package expo.modules.t3liquidglass

import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.Drawable

/**
 * Procedural reproduction of Jarvoice's `glass_page_background.xml`:
 * a 315-degree diagonal graphite (or pearl in light mode) gradient layered with 7 large
 * floating light & cool-steel radial blooms plus an edge vignette so the GPU blur has
 * luminous fields to smear and the AGSL lens has visible gradients to bend.
 */
internal class GlassBackdropDrawable(
  resources: Resources,
  dark: Boolean = true,
  accentColor: Int? = null,
) : Drawable() {
  private val density = resources.displayMetrics.density
  private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val bloomPaints = Array(BLOOM_SPECS.size) { Paint(Paint.ANTI_ALIAS_FLAG) }
  private val vignettePaint = Paint(Paint.ANTI_ALIAS_FLAG)

  var dark: Boolean = dark
    set(value) {
      if (field == value) return
      field = value
      rebuildShaders()
      invalidateSelf()
    }

  var accentColor: Int? = accentColor
    set(value) {
      if (field == value) return
      field = value
      rebuildShaders()
      invalidateSelf()
    }

  override fun onBoundsChange(bounds: Rect) {
    super.onBoundsChange(bounds)
    rebuildShaders()
  }

  private fun rebuildShaders() {
    val w = bounds.width().toFloat()
    val h = bounds.height().toFloat()
    if (w <= 0f || h <= 0f) return

    val p = GlassTokens.palette(dark)
    // Subtle 14% tinting of steel blooms when user picks a vibrant theme.
    val steelColor = accentColor?.let { GlassTokens.blendColors(p.backdropSteel, it, 0.16f) }
      ?: p.backdropSteel
    val steelMid = accentColor?.let { GlassTokens.blendColors(p.backdropSteelMid, it, 0.14f) }
      ?: p.backdropSteelMid
    val steelClear = steelColor and 0x00FFFFFF

    // Android gradient angle 315 = top-left to bottom-right diagonal.
    basePaint.shader = LinearGradient(
      bounds.left.toFloat(),
      bounds.top.toFloat(),
      bounds.right.toFloat(),
      bounds.bottom.toFloat(),
      intArrayOf(p.backdropStart, p.backdropCenter, p.backdropEnd),
      floatArrayOf(0f, 0.5f, 1f),
      Shader.TileMode.CLAMP,
    )

    for (i in BLOOM_SPECS.indices) {
      val spec = BLOOM_SPECS[i]
      val cx = bounds.left + w * spec.cx
      val cy = bounds.top + h * spec.cy
      val radius = (spec.radiusDp * density).coerceAtLeast(1f)
      val colors = if (spec.isSteel) {
        intArrayOf(steelColor, steelMid, steelClear)
      } else {
        intArrayOf(p.backdropLight, p.backdropLightMid, p.backdropLightClear)
      }
      bloomPaints[i].shader = RadialGradient(
        cx,
        cy,
        radius,
        colors,
        floatArrayOf(0f, 0.5f, 1f),
        Shader.TileMode.CLAMP,
      )
    }

    vignettePaint.shader = RadialGradient(
      bounds.left + w * 0.5f,
      bounds.top + h * 0.42f,
      (760f * density).coerceAtLeast(1f),
      intArrayOf(p.backdropVignetteClear, p.backdropVignetteClear, p.backdropVignette),
      floatArrayOf(0f, 0.5f, 1f),
      Shader.TileMode.CLAMP,
    )
  }

  override fun draw(canvas: Canvas) {
    if (bounds.isEmpty) return
    canvas.drawRect(bounds, basePaint)
    for (paint in bloomPaints) {
      canvas.drawRect(bounds, paint)
    }
    canvas.drawRect(bounds, vignettePaint)
  }

  override fun setAlpha(alpha: Int) {
    // Backdrop always draws opaque; translucency is controlled by GlassSurface.
  }

  override fun setColorFilter(colorFilter: ColorFilter?) {
    basePaint.colorFilter = colorFilter
  }

  @Deprecated("Deprecated in Android Drawable")
  override fun getOpacity(): Int = PixelFormat.OPAQUE

  private data class BloomSpec(val cx: Float, val cy: Float, val radiusDp: Float, val isSteel: Boolean)

  private companion object {
    val BLOOM_SPECS = arrayOf(
      BloomSpec(0.10f, 0.02f, 400f, false),
      BloomSpec(1.02f, 0.14f, 360f, true),
      BloomSpec(0.55f, 0.31f, 300f, false),
      BloomSpec(0.00f, 0.43f, 380f, false),
      BloomSpec(0.98f, 0.58f, 400f, true),
      BloomSpec(0.10f, 0.76f, 380f, false),
      BloomSpec(0.92f, 0.94f, 360f, true),
    )
  }
}
