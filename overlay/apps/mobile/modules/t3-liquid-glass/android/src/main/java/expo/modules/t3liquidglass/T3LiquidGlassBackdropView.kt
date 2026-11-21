package expo.modules.t3liquidglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
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
  private var dark: Boolean = true
  private var accentColor: Int? = null

  internal val sources = linkedSetOf<T3LiquidGlassSourceView>()
  internal var menuSource: T3LiquidGlassSourceView? = null
  internal val liveSurfaces = linkedSetOf<View>()

  internal fun addLiveSurface(view: View) {
    liveSurfaces.add(view)
    // If a source skipped recording before any live surface existed, wake it once now.
    for (source in sources) {
      if (!source.hasRecordedContent() && source.isShown) {
        source.invalidate()
      }
    }
  }

  internal fun removeLiveSurface(view: View) {
    liveSurfaces.remove(view)
  }

  internal fun hasActiveLiveSurfacesOutside(source: T3LiquidGlassSourceView): Boolean {
    for (surface in liveSurfaces) {
      if (surface.isShown && surface.alpha > 0f && !containsSource(surface) { it === source }) {
        return true
      }
    }
    return false
  }

  internal fun invalidateLiveSurfacesOutside(source: T3LiquidGlassSourceView) {
    for (surface in liveSurfaces) {
      if (surface.isShown && surface.alpha > 0f && !containsSource(surface) { it === source }) {
        surface.postInvalidateOnAnimation()
      }
    }
  }

  internal fun canSampleContent(view: View): Boolean =
    sources.isNotEmpty() &&
      !isInsideLiveSurface(view) &&
      !containsSource(view) { it in sources }

  internal fun menuSourceFor(view: View): T3LiquidGlassSourceView? =
    menuSource?.takeIf { source -> !containsSource(view) { it === source } }

  /**
   * Avoids nested double-blur when a small glass control (e.g. Send button) sits inside an
   * already live-blurred container (e.g. ComposerSurface, floating header, or menu).
   */
  internal fun isInsideLiveSurface(view: View): Boolean {
    var parent = view.parent
    while (parent is View && parent !== this) {
      if (parent !== view && parent in liveSurfaces) return true
      if (parent is ViewGroup && parent.childCount > 0) {
        val firstChild = parent.getChildAt(0)
        if (firstChild !== view && firstChild in liveSurfaces) return true
      }
      parent = parent.parent
    }
    return false
  }

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
    if (this.dark == dark) return
    this.dark = dark
    invalidate()
  }

  fun setAccentTint(color: Int?) {
    if (accentColor == color) return
    accentColor = color
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // Fabric already positions the React Native children. LinearLayout would reposition them.
  }

  override fun onDraw(canvas: Canvas) {
    drawCanvas(canvas, dark)
    super.onDraw(canvas)
  }
}
