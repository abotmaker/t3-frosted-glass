package expo.modules.t3liquidglass

import android.content.Context
import android.graphics.Canvas
import android.graphics.RenderNode
import android.os.Build
import android.view.View
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

class T3LiquidGlassSourceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlassSource")
    View(T3LiquidGlassSourceView::class) {
      Prop("enabled") { view: T3LiquidGlassSourceView, value: Boolean ->
        view.setCaptureEnabled(value)
      }
      Prop("menuBackdrop") { view: T3LiquidGlassSourceView, value: Boolean ->
        view.setMenuBackdrop(value)
      }
    }
  }
}

/** Records the content layer that sits below the floating controls in this route. */
class T3LiquidGlassSourceView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var layer: ContentLayer? = null
  private var backdrop: T3LiquidGlassBackdropView? = null
  private val location = IntArray(2)
  private var captureEnabled = true

  private var menuBackdrop = false

  internal fun setMenuBackdrop(value: Boolean) {
    if (menuBackdrop == value) return
    unregister()
    menuBackdrop = value
    if (captureEnabled) register()
    invalidate()
  }

  internal fun setCaptureEnabled(enabled: Boolean) {
    if (captureEnabled == enabled) return
    captureEnabled = enabled
    if (enabled) {
      register()
    } else {
      unregister()
      releaseLayer()
    }
    invalidate()
  }

  private fun register() {
    val backdrop = backdrop ?: return
    if (menuBackdrop) {
      backdrop.menuSource = this
    } else {
      backdrop.sources.add(this)
    }
  }

  private fun unregister() {
    val backdrop = backdrop ?: return
    if (backdrop.menuSource === this) backdrop.menuSource = null
    backdrop.sources.remove(this)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    backdrop = findGlassBackdrop(this)
    if (captureEnabled) register()
  }

  override fun onDetachedFromWindow() {
    unregister()
    backdrop = null
    releaseLayer()
    super.onDetachedFromWindow()
  }

  private fun releaseLayer() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) layer?.release()
    layer = null
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // Fabric already positions the React Native children.
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !canvas.isHardwareAccelerated ||
      !captureEnabled || backdrop == null || width <= 0 || height <= 0
    ) {
      super.dispatchDraw(canvas)
      return
    }
    val content = layer ?: ContentLayer().also { layer = it }
    val hadDisplayList = content.hasDisplayList()
    content.record(canvas, width, height) { super.dispatchDraw(it) }
    if (!hadDisplayList && content.hasDisplayList()) {
      backdrop?.invalidateLiveSurfacesOutside(this)
    }
  }

  internal fun drawBackdrop(canvas: Canvas, windowX: Int, windowY: Int) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val content = layer ?: return
    if (!isShown || alpha == 0f || !content.hasDisplayList()) return
    getLocationInWindow(location)
    val save = canvas.save()
    try {
      canvas.translate((location[0] - windowX).toFloat(), (location[1] - windowY).toFloat())
      content.draw(canvas)
    } finally {
      canvas.restoreToCount(save)
    }
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private class ContentLayer {
    private val node = RenderNode("T3 glass screen content")

    fun record(canvas: Canvas, width: Int, height: Int, drawChildren: (Canvas) -> Unit) {
      node.setPosition(0, 0, width, height)
      val recording = node.beginRecording(width, height)
      try {
        drawChildren(recording)
      } finally {
        node.endRecording()
      }
      draw(canvas)
    }

    fun draw(canvas: Canvas) = canvas.drawRenderNode(node)
    fun hasDisplayList(): Boolean = node.hasDisplayList()
    fun release() = node.discardDisplayList()
  }
}

internal fun findGlassBackdrop(view: View): T3LiquidGlassBackdropView? {
  var parent = view.parent
  while (parent is View) {
    if (parent is T3LiquidGlassBackdropView) return parent
    parent = parent.parent
  }
  return null
}
