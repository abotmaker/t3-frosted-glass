package expo.modules.t3liquidglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Outline
import android.view.View
import android.view.ViewOutlineProvider
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import kotlin.math.min

class T3LiquidGlassSurfaceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlassSurface")
    View(T3LiquidGlassSurfaceView::class) {
      Prop("look") { view: T3LiquidGlassSurfaceView, value: String ->
        view.look = GlassLook.fromWire(value)
      }
      Prop("dark") { view: T3LiquidGlassSurfaceView, value: Boolean ->
        view.setDarkMode(value)
      }
      Prop("cornerRadius") { view: T3LiquidGlassSurfaceView, value: Float ->
        view.setUniformCornerRadiusDp(value)
      }
      Prop("topCornerRadius") { view: T3LiquidGlassSurfaceView, value: Float? ->
        view.setTopCornerRadiusDp(value)
      }
      Prop("bottomCornerRadius") { view: T3LiquidGlassSurfaceView, value: Float? ->
        view.setBottomCornerRadiusDp(value)
      }
      Prop("glassOpacity") { view: T3LiquidGlassSurfaceView, value: Float? ->
        view.setGlassOpacity(value)
      }
      Prop("accentColor") { view: T3LiquidGlassSurfaceView, value: Int? ->
        view.setAccentColor(value)
      }
      Prop("accentOpacity") { view: T3LiquidGlassSurfaceView, value: Float? ->
        view.setAccentOpacity(value)
      }
      Prop("pressed") { view: T3LiquidGlassSurfaceView, value: Boolean ->
        view.setGlassPressed(value)
      }
      Prop("drawRim") { view: T3LiquidGlassSurfaceView, value: Boolean ->
        view.setDrawRim(value)
      }
      Prop("backdropAlpha") { view: T3LiquidGlassSurfaceView, value: Float? ->
        view.setBackdropAlpha(value)
      }
      Prop("enabled") { view: T3LiquidGlassSurfaceView, value: Boolean ->
        view.setGlassEnabled(value)
      }
    }
  }
}

/**
 * Draws the glass layer behind content laid out by a standard React Native view.
 */
class T3LiquidGlassSurfaceView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {
  private val density = context.resources.displayMetrics.density
  private val drawer = GlassSurfaceDrawer(this, GlassLook.CARD)

  private var uniformRadiusDp = 18f
  private var topRadiusDpOverride: Float? = null
  private var bottomRadiusDpOverride: Float? = null
  private var glassPressed = false

  internal var look: GlassLook
    get() = drawer.look
    set(value) {
      drawer.look = value
    }

  init {
    setWillNotDraw(false)
    clipToOutline = true
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        val w = view.width
        val h = view.height
        if (w <= 0 || h <= 0) return
        val halfMin = min(w, h) * 0.5f
        val rTop = resolveTopRadiusPx().coerceIn(0f, halfMin)
        val rBot = resolveBottomRadiusPx().coerceIn(0f, halfMin)
        if (rTop == rBot) {
          outline.setRoundRect(0, 0, w, h, rTop)
        } else if (rBot == 0f) {
          // Bottom flat (e.g. top-rounded sheet): extend outline below bounds so bottom stays square.
          outline.setRoundRect(0, 0, w, h + rTop.toInt(), rTop)
        } else if (rTop == 0f) {
          // Top flat (e.g. top-anchored header): extend outline above bounds so top stays square.
          outline.setRoundRect(0, -rBot.toInt(), w, h, rBot)
        } else {
          outline.setRoundRect(0, 0, w, h, maxOf(rTop, rBot))
        }
      }
    }
  }

  private fun resolveTopRadiusPx(): Float = (topRadiusDpOverride ?: uniformRadiusDp) * density
  private fun resolveBottomRadiusPx(): Float = (bottomRadiusDpOverride ?: uniformRadiusDp) * density

  fun setDarkMode(dark: Boolean) {
    drawer.dark = dark
  }

  fun setUniformCornerRadiusDp(radiusDp: Float) {
    val next = radiusDp.coerceAtLeast(0f)
    if (uniformRadiusDp == next) return
    uniformRadiusDp = next
    syncBounds()
    invalidateOutline()
    invalidate()
  }

  fun setTopCornerRadiusDp(radiusDp: Float?) {
    val next = radiusDp?.coerceAtLeast(0f)
    if (topRadiusDpOverride == next) return
    topRadiusDpOverride = next
    syncBounds()
    invalidateOutline()
    invalidate()
  }

  fun setBottomCornerRadiusDp(radiusDp: Float?) {
    val next = radiusDp?.coerceAtLeast(0f)
    if (bottomRadiusDpOverride == next) return
    bottomRadiusDpOverride = next
    syncBounds()
    invalidateOutline()
    invalidate()
  }

  fun setGlassOpacity(opacity: Float?) {
    drawer.opacityOverride = opacity
  }

  fun setAccentColor(color: Int?) {
    drawer.accentColor = color
  }

  fun setAccentOpacity(opacity: Float?) {
    drawer.accentOpacity = (opacity ?: 0.28f).coerceIn(0f, 1f)
  }

  fun setGlassPressed(pressed: Boolean) {
    if (glassPressed == pressed) return
    glassPressed = pressed
    invalidate()
  }

  fun setDrawRim(drawRim: Boolean) {
    drawer.drawRim = drawRim
  }

  fun setBackdropAlpha(alpha: Float?) {
    drawer.backdropAlphaOverride = alpha
  }

  fun setGlassEnabled(enabled: Boolean) {
    drawer.setLiquidGlassEnabled(enabled)
  }

  private fun syncBounds() {
    if (width <= 0 || height <= 0) return
    drawer.setBounds(
      0f,
      0f,
      width.toFloat(),
      height.toFloat(),
      resolveTopRadiusPx(),
      resolveBottomRadiusPx(),
    )
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    syncBounds()
    invalidateOutline()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    drawer.draw(canvas, glassPressed)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    drawer.onAttached()
    invalidate()
  }

  override fun onDetachedFromWindow() {
    drawer.onDetached()
    super.onDetachedFromWindow()
  }
}
