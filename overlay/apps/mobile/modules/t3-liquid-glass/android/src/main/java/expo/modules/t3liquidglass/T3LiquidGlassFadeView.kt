package expo.modules.t3liquidglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class T3LiquidGlassFadeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlassFade")
    View(T3LiquidGlassFadeView::class) {
      Prop("dark") { view: T3LiquidGlassFadeView, value: Boolean ->
        view.setDarkMode(value)
      }
      Prop("direction") { view: T3LiquidGlassFadeView, value: String ->
        view.setDirection(value)
      }
      Prop("solidStop") { view: T3LiquidGlassFadeView, value: Float ->
        view.setSolidStop(value)
      }
    }
  }
}

/**
 * Hardware-accelerated edge gradient fade drawn directly onto the GPU Canvas
 * without allocating full-width software bitmaps (replacing react-native-svg fades).
 */
class T3LiquidGlassFadeView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var dark = true
  private var fromTop = true
  private var solidStop = 0.5f
  private var shaderHeight = -1

  init {
    setWillNotDraw(false)
  }

  fun setDarkMode(value: Boolean) {
    if (dark == value) return
    dark = value
    shaderHeight = -1
    invalidate()
  }

  fun setDirection(value: String) {
    val nextFromTop = value != "bottom"
    if (fromTop == nextFromTop) return
    fromTop = nextFromTop
    shaderHeight = -1
    invalidate()
  }

  fun setSolidStop(value: Float) {
    val clamped = value.coerceIn(0f, 0.9f)
    if (solidStop == clamped) return
    solidStop = clamped
    shaderHeight = -1
    invalidate()
  }

  private fun ensureShader(h: Int) {
    if (h <= 0 || shaderHeight == h) return
    shaderHeight = h
    val base = if (dark) Color.BLACK else GlassTokens.LIGHT_CANVAS
    val colors: IntArray
    val positions: FloatArray
    if (fromTop) {
      val s = solidStop.coerceIn(0f, 0.85f)
      val mid = (s + (1f - s) * 0.45f).coerceAtMost(0.95f)
      colors = intArrayOf(
        base,
        base,
        GlassTokens.withOpacity(base, 0.60f),
        base and 0x00FFFFFF,
      )
      positions = floatArrayOf(0f, s, mid, 1f)
    } else {
      colors = intArrayOf(
        base and 0x00FFFFFF,
        GlassTokens.withOpacity(base, 0.18f),
        GlassTokens.withOpacity(base, 0.86f),
        base,
      )
      positions = floatArrayOf(0f, 0.52f, 0.82f, 1f)
    }
    paint.shader = LinearGradient(
      0f,
      0f,
      0f,
      h.toFloat(),
      colors,
      positions,
      Shader.TileMode.CLAMP,
    )
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    shaderHeight = -1
  }

  override fun onDraw(canvas: Canvas) {
    if (width <= 0 || height <= 0) return
    ensureShader(height)
    canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
  }
}
