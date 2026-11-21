package expo.modules.t3liquidglass

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import android.view.ViewTreeObserver
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Shared glass tint, directional highlight and optional live backdrop. */
internal class GlassSurfaceDrawer(
  private val host: View,
  initialLook: GlassLook = GlassLook.CARD,
) {
  private val density = host.resources.displayMetrics.density
  private val renderer = LiquidGlassRenderer(host)
  private val baseRimWidth = GlassTokens.RIM_WIDTH_DP * density

  private val backdropScrim = Paint(Paint.ANTI_ALIAS_FLAG)
  private val tintPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val darkMenuFallback = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = GlassTokens.DARK.tintColor }
  private val lightMenuFallback = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = GlassTokens.LIGHT.tintColor }
  private val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val frostPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val glossPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 2.4f * density
  }
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val outerRimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = max(1f, 0.5f * density)
  }
  private val pressPaint = Paint(Paint.ANTI_ALIAS_FLAG)

  private val area = RectF()
  private val rimArea = RectF()
  private val outerRimArea = RectF()
  private val shapePath = Path()
  private val rimPath = Path()
  private val outerRimPath = Path()
  private val shapeRadii = FloatArray(8)
  private val rimRadii = FloatArray(8)
  private val outerRadii = FloatArray(8)

  private val scrollListener = ViewTreeObserver.OnScrollChangedListener {
    if (look.samplesContent) {
      val backdrop = findGlassBackdrop(host)
      if (backdrop?.canSampleContent(host) == true ||
        (look == GlassLook.MENU && backdrop?.menuSourceFor(host) != null)
      ) host.invalidate()
    }
  }

  var look: GlassLook = initialLook
    set(value) {
      if (field == value) return
      field = value
      if (host.isAttachedToWindow) {
        val backdrop = findGlassBackdrop(host)
        if (value.samplesContent) backdrop?.liveSurfaces?.add(host) else backdrop?.liveSurfaces?.remove(host)
      }
      applyPaletteAndLook()
      updateGeometry()
      host.invalidate()
    }

  var dark: Boolean = true
    set(value) {
      if (field == value) return
      field = value
      applyPaletteAndLook()
      updateGeometry()
      host.invalidate()
    }

  var opacityOverride: Float? = null
    set(value) {
      if (field == value) return
      field = value
      applyPaletteAndLook()
      host.invalidate()
    }

  var accentColor: Int? = null
    set(value) {
      if (field == value) return
      field = value
      applyPaletteAndLook()
      host.invalidate()
    }

  var accentOpacity: Float = 0.28f
    set(value) {
      if (field == value) return
      field = value
      applyPaletteAndLook()
      host.invalidate()
    }

  var rimScaleMultiplier: Float = 1f
    set(value) {
      if (field == value) return
      field = value
      applyPaletteAndLook()
      updateGeometry()
      host.invalidate()
    }

  var drawRim: Boolean = true
    set(value) {
      if (field == value) return
      field = value
      host.invalidate()
    }

  var backdropAlphaOverride: Float? = null
    set(value) {
      if (field == value) return
      field = value
      host.invalidate()
    }

  private var topRadius = 0f
  private var bottomRadius = 0f

  init {
    applyPaletteAndLook()
  }

  private fun effectiveOpacity(): Float =
    opacityOverride?.coerceIn(0f, 1f)
      ?: if (dark) {
        GlassTokens.DEFAULT_CARD_OPACITY_DARK
      } else if (look.samplesContent) {
        GlassTokens.DEFAULT_FLOATING_OPACITY_LIGHT
      } else {
        GlassTokens.DEFAULT_CARD_OPACITY_LIGHT
      }

  private fun applyPaletteAndLook() {
    val p = GlassTokens.palette(dark)
    val opacity = effectiveOpacity()
    tintPaint.color = GlassTokens.withOpacity(p.tintColor, opacity * look.tintScale)
    // Gentle contrast veil only when live content passes directly behind floating controls;
    // avoid double-stacking heavy scrims so blurred text & icons remain visibly clear in both themes.
    backdropScrim.color = if (dark) 0x1E08090C else 0x0CFFFFFF
    frostPaint.color = when (look.frost) {
      GlassFrost.NONE -> 0
      GlassFrost.LIGHT -> p.frostLight
      GlassFrost.STRONG -> p.frostStrong
    }
    pressPaint.color = p.pressColor
    outerRimPaint.color = p.outerHairlineColor
    val effectiveAccent = accentColor
    accentPaint.color = if (effectiveAccent != null && Color.alpha(effectiveAccent) > 0) {
      GlassTokens.withOpacity(effectiveAccent, accentOpacity * if (dark) 0.72f else 1f)
    } else {
      0
    }
    rimPaint.strokeWidth = baseRimWidth * look.rimScale * rimScaleMultiplier
    glowPaint.color = if (dark) 0x16FFFFFF else 0x8CFFFFFF.toInt()
  }

  fun setBounds(
    left: Float,
    top: Float,
    right: Float,
    bottom: Float,
    topCornerRadius: Float,
    bottomCornerRadius: Float = topCornerRadius,
  ) {
    val halfMin = min(max(0f, right - left), max(0f, bottom - top)) * 0.5f
    val rt = topCornerRadius.coerceIn(0f, halfMin)
    val rb = bottomCornerRadius.coerceIn(0f, halfMin)
    if (area.left == left && area.top == top && area.right == right && area.bottom == bottom &&
      topRadius == rt && bottomRadius == rb
    ) {
      return
    }
    area.set(left, top, right, bottom)
    topRadius = rt
    bottomRadius = rb
    updateGeometry()
  }

  private fun updateGeometry() {
    if (area.width() <= 0f || area.height() <= 0f) return
    val p = GlassTokens.palette(dark)

    fillRadii(shapeRadii, topRadius, bottomRadius)
    shapePath.rewind()
    shapePath.addRoundRect(area, shapeRadii, Path.Direction.CW)

    val inset = rimPaint.strokeWidth * 0.5f
    rimArea.set(area)
    rimArea.inset(inset, inset)
    fillRadii(rimRadii, max(0f, topRadius - inset), max(0f, bottomRadius - inset))
    rimPath.rewind()
    rimPath.addRoundRect(rimArea, rimRadii, Path.Direction.CW)

    val outerInset = outerRimPaint.strokeWidth * 0.5f
    outerRimArea.set(area)
    outerRimArea.inset(outerInset, outerInset)
    fillRadii(outerRadii, max(0f, topRadius - outerInset), max(0f, bottomRadius - outerInset))
    outerRimPath.rewind()
    outerRimPath.addRoundRect(outerRimArea, outerRadii, Path.Direction.CW)

    val maxR = max(topRadius, bottomRadius)
    val glossEnd = area.top + min(area.height() * 0.36f, max(16f * density, maxR * 0.9f))
    glossPaint.shader = LinearGradient(
      0f,
      area.top,
      0f,
      glossEnd,
      p.glossColor,
      p.glossClear,
      Shader.TileMode.CLAMP,
    )
    rimPaint.shader = LinearGradient(
      area.left,
      area.top,
      area.right,
      area.bottom,
      p.rimColors,
      floatArrayOf(0f, 0.38f, 0.65f, 1f),
      Shader.TileMode.CLAMP,
    )
  }

  fun draw(canvas: Canvas, pressed: Boolean, withBackdrop: Boolean = true) {
    if (area.width() <= 0f || area.height() <= 0f) return
    val backdropAlpha = backdropAlphaOverride ?: look.backdropAlpha
    val backdropDrawn = withBackdrop && renderer.draw(
      canvas = canvas,
      left = area.left.roundToInt(),
      top = area.top.roundToInt(),
      right = area.right.roundToInt(),
      bottom = area.bottom.roundToInt(),
      topRadius = topRadius,
      bottomRadius = bottomRadius,
      dark = dark,
      look = look,
      backdropAlpha = backdropAlpha,
      accentColor = accentColor,
    )
    // Keep the labels readable when bright text or images pass behind a floating control.
    if (backdropDrawn && look.samplesContent) {
      canvas.drawPath(shapePath, backdropScrim)
    }
    if (!backdropDrawn && look == GlassLook.MENU) {
      canvas.drawPath(shapePath, if (dark) darkMenuFallback else lightMenuFallback)
    } else if (Color.alpha(tintPaint.color) > 0) {
      canvas.drawPath(shapePath, tintPaint)
    }
    if (accentPaint.color != 0) canvas.drawPath(shapePath, accentPaint)
    if (frostPaint.color != 0) canvas.drawPath(shapePath, frostPaint)
    canvas.drawPath(shapePath, glossPaint)
    if (pressed) canvas.drawPath(shapePath, pressPaint)
    if (drawRim) {
      canvas.drawPath(outerRimPath, outerRimPaint)
      canvas.drawPath(rimPath, glowPaint)
      canvas.drawPath(rimPath, rimPaint)
    }
  }

  fun setLiquidGlassEnabled(enabled: Boolean) {
    if (renderer.setEnabled(enabled)) host.invalidate()
  }

  fun onAttached() {
    host.viewTreeObserver.addOnScrollChangedListener(scrollListener)
    if (look.samplesContent) {
      findGlassBackdrop(host)?.liveSurfaces?.add(host)
    }
  }

  fun onDetached() {
    findGlassBackdrop(host)?.liveSurfaces?.remove(host)
    host.viewTreeObserver.removeOnScrollChangedListener(scrollListener)
    renderer.release()
  }

  private fun fillRadii(out: FloatArray, top: Float, bottom: Float) {
    out[0] = top; out[1] = top
    out[2] = top; out[3] = top
    out[4] = bottom; out[5] = bottom
    out[6] = bottom; out[7] = bottom
  }
}
