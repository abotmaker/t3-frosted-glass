package expo.modules.t3liquidglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class T3LiquidGlassBackdropModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlassBackdrop")
    View(T3LiquidGlassBackdropView::class) {
      Prop("dark") { view: T3LiquidGlassBackdropView, value: Boolean ->
        view.setDarkMode(value)
      }
      Prop("accentColor") { view: T3LiquidGlassBackdropView, value: Int? ->
        view.setAccentTint(value)
      }
    }
  }
}

/** Route-local canvas and registry of screen content layers below floating controls. */
class T3LiquidGlassBackdropView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {
  private val drawable = GlassBackdropDrawable(context.resources, dark = true)

  internal val sources = linkedSetOf<T3LiquidGlassSourceView>()
  internal var menuSource: T3LiquidGlassSourceView? = null
  internal val liveSurfaces = linkedSetOf<View>()

  internal fun invalidateLiveSurfacesOutside(source: T3LiquidGlassSourceView) {
    for (surface in liveSurfaces) {
      if (!containsSource(surface) { it === source }) {
        surface.invalidate()
      }
    }
  }

  internal fun canSampleContent(view: View): Boolean =
    sources.isNotEmpty() && !containsSource(view) { it in sources }

  internal fun menuSourceFor(view: View): T3LiquidGlassSourceView? =
    menuSource?.takeIf { source -> !containsSource(view) { it === source } }

  private fun containsSource(view: View, matches: (T3LiquidGlassSourceView) -> Boolean): Boolean {
    var parent = view.parent
    while (parent is View && parent !== this) {
      // Sampling a node that contains this glass could create a display-list cycle.
      if (parent is T3LiquidGlassSourceView && matches(parent)) return true
      parent = parent.parent
    }
    return false
  }

  internal fun drawCanvas(canvas: Canvas, dark: Boolean) {
    canvas.drawColor(if (dark) Color.BLACK else GlassTokens.LIGHT_CANVAS)
  }

  init {
    setWillNotDraw(false)
  }

  fun setDarkMode(dark: Boolean) {
    if (drawable.dark == dark) return
    drawable.dark = dark
    invalidate()
  }

  fun setAccentTint(color: Int?) {
    if (drawable.accentColor == color) return
    drawable.accentColor = color
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    drawable.setBounds(0, 0, w, h)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // Fabric already positions the React Native children. LinearLayout would reposition them.
  }

  override fun onDraw(canvas: Canvas) {
    drawCanvas(canvas, drawable.dark)
    super.onDraw(canvas)
  }
}
