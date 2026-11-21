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
  private val allowLiveBackdrop: Boolean = true,
) {
  private val density = host.resources.displayMetrics.density
  private var renderer: LiquidGlassRenderer? = null
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
  // Lazily allocated only for rare asymmetric top/bottom corner radii; uniform corners use
  // Skia's hardware-accelerated drawRoundRect fast path directly (zero SkPath overhead).
  private var shapePath: Path? = null
  private var rimPath: Path? = null
  private var outerRimPath: Path? = null
  private var shapeRadii: FloatArray? = null
  private var rimRadii: FloatArray? = null
  private var outerRadii: FloatArray? = null
  private var uniformCorners = true
  private var rimRadius = 0f
  private var outerRadius = 0f

  private var cachedBackdrop: T3LiquidGlassBackdropView? = null
  private var scrollListenerAttached = false
  private var scrollInvalidationPending = false

  private val scrollListener = ViewTreeObserver.OnScrollChangedListener {
    if (scrollInvalidationPending || !allowLiveBackdrop || !look.samplesContent) return@OnScrollChangedListener
    if (!host.isShown || host.alpha <= 0f || host.width <= 0 || host.height <= 0) return@OnScrollChangedListener
    val backdrop = cachedBackdrop ?: findGlassBackdrop(host)?.also { cachedBackdrop = it } ?: return@OnScrollChangedListener
    if (backdrop.canSampleContent(host) || (look == GlassLook.MENU && backdrop.menuSourceFor(host) != null)) {
      scrollInvalidationPending = true
      host.postInvalidateOnAnimation()
    }
  }

  private fun syncScrollAndBackdropRegistration() {
    if (!host.isAttachedToWindow) return
    val wantsLive = allowLiveBackdrop && look.samplesContent
    val backdrop = cachedBackdrop ?: findGlassBackdrop(host)?.also { cachedBackdrop = it }
    if (wantsLive) {
      backdrop?.addLiveSurface(host)
      if (!scrollListenerAttached) {
        host.viewTreeObserver.addOnScrollChangedListener(scrollListener)
        scrollListenerAttached = true
      }
    } else {
      backdrop?.removeLiveSurface(host)
      if (scrollListenerAttached) {
        host.viewTreeObserver.removeOnScrollChangedListener(scrollListener)
        scrollListenerAttached = false
      }
      scrollInvalidationPending = false
    }
  }

  var look: GlassLook = initialLook
    set(value) {
      if (field == value) return
      field = value
      syncScrollAndBackdropRegistration()
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

    val inset = rimPaint.strokeWidth * 0.5f
    rimArea.set(area)
    rimArea.inset(inset, inset)

    val outerInset = outerRimPaint.strokeWidth * 0.5f
    outerRimArea.set(area)
    outerRimArea.inset(outerInset, outerInset)

    uniformCorners = topRadius == bottomRadius
    if (uniformCorners) {
      rimRadius = max(0f, topRadius - inset)
      outerRadius = max(0f, topRadius - outerInset)
    } else {
      val sRadii = shapeRadii ?: FloatArray(8).also { shapeRadii = it }
      val sPath = shapePath ?: Path().also { shapePath = it }
      fillRadii(sRadii, topRadius, bottomRadius)
      sPath.rewind()
      sPath.addRoundRect(area, sRadii, Path.Direction.CW)

      val rRadii = rimRadii ?: FloatArray(8).also { rimRadii = it }
      val rPath = rimPath ?: Path().also { rimPath = it }
      fillRadii(rRadii, max(0f, topRadius - inset), max(0f, bottomRadius - inset))
      rPath.rewind()
      rPath.addRoundRect(rimArea, rRadii, Path.Direction.CW)

      val oRadii = outerRadii ?: FloatArray(8).also { outerRadii = it }
      val oPath = outerRimPath ?: Path().also { outerRimPath = it }
      fillRadii(oRadii, max(0f, topRadius - outerInset), max(0f, bottomRadius - outerInset))
      oPath.rewind()
      oPath.addRoundRect(outerRimArea, oRadii, Path.Direction.CW)
    }

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
      RIM_STOPS,
      Shader.TileMode.CLAMP,
    )
  }

  private inline fun drawShape(canvas: Canvas, paint: Paint) {
    if (uniformCorners) {
      canvas.drawRoundRect(area, topRadius, topRadius, paint)
    } else {
      shapePath?.let { canvas.drawPath(it, paint) }
    }
  }

  /** A pill's material follows the pill, so translating it can reuse its local gradients. */
  fun drawPill(canvas: Canvas, rect: RectF, alpha: Float = 1f) {
    val opacity = (alpha.coerceIn(0f, 1f) * 255f).roundToInt()
    if (opacity == 0) return
    val w = rect.width()
    val h = rect.height()
    setBounds(0f, 0f, w, h, h * 0.5f)
    val save = canvas.save()
    try {
      canvas.translate(rect.left, rect.top)
      if (opacity < 255) canvas.saveLayerAlpha(-2f, -2f, w + 2f, h + 2f, opacity)
      draw(canvas, pressed = false, withBackdrop = false)
    } finally {
      canvas.restoreToCount(save)
    }
  }

  fun draw(canvas: Canvas, pressed: Boolean, withBackdrop: Boolean = true) {
    scrollInvalidationPending = false
    if (area.width() <= 0f || area.height() <= 0f) return
    val backdropDrawn = if (allowLiveBackdrop && withBackdrop && look.samplesContent) {
      val activeRenderer = renderer ?: LiquidGlassRenderer(host).also {
        it.setEnabled(liquidGlassEnabled)
        renderer = it
      }
      val backdropAlpha = backdropAlphaOverride ?: look.backdropAlpha
      activeRenderer.draw(
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
        cachedBackdrop = cachedBackdrop,
      )
    } else {
      false
    }
    // Keep the labels readable when bright text or images pass behind a floating control.
    if (backdropDrawn && look.samplesContent) {
      drawShape(canvas, backdropScrim)
    }
    if (!backdropDrawn && look == GlassLook.MENU) {
      drawShape(canvas, if (dark) darkMenuFallback else lightMenuFallback)
    } else if (Color.alpha(tintPaint.color) > 0) {
      drawShape(canvas, tintPaint)
    }
    if (accentPaint.color != 0) drawShape(canvas, accentPaint)
    if (frostPaint.color != 0) drawShape(canvas, frostPaint)
    drawShape(canvas, glossPaint)
    if (pressed) drawShape(canvas, pressPaint)
    if (drawRim) {
      if (uniformCorners) {
        canvas.drawRoundRect(outerRimArea, outerRadius, outerRadius, outerRimPaint)
        canvas.drawRoundRect(rimArea, rimRadius, rimRadius, glowPaint)
        canvas.drawRoundRect(rimArea, rimRadius, rimRadius, rimPaint)
      } else {
        outerRimPath?.let { canvas.drawPath(it, outerRimPaint) }
        rimPath?.let {
          canvas.drawPath(it, glowPaint)
          canvas.drawPath(it, rimPaint)
        }
      }
    }
  }

  private var liquidGlassEnabled = true

  fun setLiquidGlassEnabled(enabled: Boolean) {
    if (liquidGlassEnabled == enabled) return
    liquidGlassEnabled = enabled
    renderer?.setEnabled(enabled)
    host.invalidate()
  }

  fun onAttached() {
    cachedBackdrop = findGlassBackdrop(host)
    syncScrollAndBackdropRegistration()
  }

  fun onDetached() {
    cachedBackdrop?.removeLiveSurface(host)
    cachedBackdrop = null
    if (scrollListenerAttached) {
      host.viewTreeObserver.removeOnScrollChangedListener(scrollListener)
      scrollListenerAttached = false
    }
    scrollInvalidationPending = false
    renderer?.release()
  }

  private fun fillRadii(out: FloatArray, top: Float, bottom: Float) {
    out[0] = top; out[1] = top
    out[2] = top; out[3] = top
    out[4] = bottom; out[5] = bottom
    out[6] = bottom; out[7] = bottom
  }

  private companion object {
    val RIM_STOPS = floatArrayOf(0f, 0.38f, 0.65f, 1f)
  }
}
