/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Thin knobless liquid glass slider adapted from Jarvoice's GlassSlider.java / BitChord's ThinSlider.kt:
 * 10dp capsule at rest that springs to 16dp while held and settles back smoothly on release.
 */
package expo.modules.t3liquidglass

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.view.Choreographer
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class T3LiquidGlassSliderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlassSlider")
    View(T3LiquidGlassSliderView::class) {
      Prop("min") { view: T3LiquidGlassSliderView, value: Double -> view.setMin(value) }
      Prop("max") { view: T3LiquidGlassSliderView, value: Double -> view.setMax(value) }
      Prop("step") { view: T3LiquidGlassSliderView, value: Double -> view.setStep(value) }
      Prop("value") { view: T3LiquidGlassSliderView, value: Double -> view.setValue(value) }
      Prop("dark") { view: T3LiquidGlassSliderView, value: Boolean -> view.setDarkMode(value) }
      Prop("enabled") { view: T3LiquidGlassSliderView, value: Boolean -> view.isEnabled = value }
      Events("onValueChange", "onValueCommit")
    }
  }
}

class T3LiquidGlassSliderView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), Choreographer.FrameCallback {
  private val onValueChange by EventDispatcher()
  private val onValueCommit by EventDispatcher()

  private val density = context.resources.displayMetrics.density
  private val idleHeightPx = GlassTokens.SLIDER_TRACK_IDLE_DP * density
  private val activeHeightPx = GlassTokens.SLIDER_TRACK_ACTIVE_DP * density
  private val rimWidthPx = GlassTokens.RIM_WIDTH_DP * density

  private val inactivePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val activePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = rimWidthPx
  }

  private val trackRect = RectF()
  private val activeRect = RectF()
  private val rimRect = RectF()
  private val clipPath = Path()
  private var cachedTrackTop = Float.NaN
  private var cachedTrackBottom = Float.NaN
  private var cachedTrackWidth = Float.NaN
  private var cachedRimDark = true

  private var minVal = 0.0
  private var maxVal = 1.0
  private var stepVal = 0.0
  private var currentVal = 0.0
  private var dark = true
  private var dragging = false
  private var lastHapticVal = Double.NaN

  private var trackHeight: Double = idleHeightPx.toDouble()
  private var velocity: Double = 0.0
  private var targetHeight: Double = idleHeightPx.toDouble()
  private var running = false
  private var lastFrameNanos = -1L

  init {
    setWillNotDraw(false)
    applyPalette()
  }

  fun setMin(value: Double) {
    if (minVal == value) return
    minVal = value
    invalidate()
  }

  fun setMax(value: Double) {
    if (maxVal == value) return
    maxVal = value
    invalidate()
  }

  fun setStep(value: Double) {
    stepVal = value.coerceAtLeast(0.0)
  }

  fun setValue(value: Double) {
    if (dragging || currentVal == value) return
    currentVal = value
    invalidate()
  }

  fun setDarkMode(isDark: Boolean) {
    if (dark == isDark) return
    dark = isDark
    applyPalette()
    invalidate()
  }

  private fun applyPalette() {
    val p = GlassTokens.palette(dark)
    activePaint.color = p.sliderActive
    inactivePaint.color = p.sliderInactive
    updateRimShader()
  }

  private fun updateRimShader() {
    if (trackRect.isEmpty) return
    val p = GlassTokens.palette(dark)
    cachedRimDark = dark
    rimPaint.shader = LinearGradient(
      trackRect.left,
      trackRect.top,
      trackRect.right,
      trackRect.bottom,
      p.rimColors,
      RIM_STOPS,
      Shader.TileMode.CLAMP,
    )
  }

  private fun animateHeight(toPx: Float) {
    targetHeight = toPx.toDouble()
    if (!ValueAnimator.areAnimatorsEnabled()) {
      trackHeight = targetHeight
      velocity = 0.0
      invalidate()
      return
    }
    if (running) return
    running = true
    lastFrameNanos = -1L
    Choreographer.getInstance().postFrameCallback(this)
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (!running) return
    val dt = if (lastFrameNanos < 0L) 0.0 else min(0.1, (frameTimeNanos - lastFrameNanos) / 1e9)
    lastFrameNanos = frameTimeNanos
    val (h, v) = GlassPillMotion.springStep(trackHeight, velocity, targetHeight, dt, STIFFNESS, DAMPING)
    trackHeight = h
    velocity = v
    val settled = abs(trackHeight - targetHeight) < 0.25 && abs(velocity) < 1.0
    if (settled) {
      trackHeight = targetHeight
      velocity = 0.0
    }
    invalidate()
    if (settled) {
      running = false
      lastFrameNanos = -1L
    } else {
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0f || h <= 0f) return
    val barH = max(2f, trackHeight.toFloat())
    val radius = barH * 0.5f
    val top = (h - barH) * 0.5f
    val bottom = top + barH
    val geometryChanged = top != cachedTrackTop || bottom != cachedTrackBottom || w != cachedTrackWidth
    if (geometryChanged || rimPaint.shader == null || cachedRimDark != dark) {
      trackRect.set(0f, top, w, bottom)
      cachedTrackTop = top
      cachedTrackBottom = bottom
      cachedTrackWidth = w
      clipPath.rewind()
      clipPath.addRoundRect(trackRect, radius, radius, Path.Direction.CW)
      updateRimShader()
    }

    val span = (maxVal - minVal).coerceAtLeast(1e-6)
    val fraction = ((currentVal - minVal) / span).toFloat().coerceIn(0f, 1f)
    val filledW = if (fraction <= 0f) 0f else max(barH, w * fraction)

    val save = canvas.save()
    try {
      canvas.clipPath(clipPath)
      canvas.drawRect(trackRect, inactivePaint)
      if (filledW > 0f) {
        if (layoutDirection == LAYOUT_DIRECTION_RTL) {
          activeRect.set(w - filledW, top, w, bottom)
        } else {
          activeRect.set(0f, top, filledW, bottom)
        }
        canvas.drawRoundRect(activeRect, radius, radius, activePaint)
      }
    } finally {
      canvas.restoreToCount(save)
    }

    rimRect.set(trackRect)
    val inset = rimWidthPx * 0.5f
    rimRect.inset(inset, inset)
    val rRim = max(0f, radius - inset)
    canvas.drawRoundRect(rimRect, rRim, rRim, rimPaint)
  }

  private fun snapValue(raw: Double): Double {
    val clamped = raw.coerceIn(minVal, maxVal)
    if (stepVal <= 0.0) return clamped
    val steps = ((clamped - minVal) / stepVal).roundToInt()
    return (minVal + steps * stepVal).coerceIn(minVal, maxVal)
  }

  private fun valueForX(x: Float): Double {
    val w = width.toFloat().coerceAtLeast(1f)
    val rawFrac = (x / w).coerceIn(0f, 1f)
    val frac = if (layoutDirection == LAYOUT_DIRECTION_RTL) 1f - rawFrac else rawFrac
    return snapValue(minVal + frac * (maxVal - minVal))
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!isEnabled) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        parent?.requestDisallowInterceptTouchEvent(true)
        dragging = true
        animateHeight(activeHeightPx)
        updateFromTouch(event.x)
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (dragging) updateFromTouch(event.x)
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (dragging) {
          updateFromTouch(event.x)
          dragging = false
          animateHeight(idleHeightPx)
          onValueCommit(mapOf("value" to currentVal))
        }
        return true
      }
    }
    return super.onTouchEvent(event)
  }

  private fun updateFromTouch(x: Float) {
    val next = valueForX(x)
    if (next != currentVal) {
      currentVal = next
      if (stepVal > 0.0 && next != lastHapticVal) {
        lastHapticVal = next
        performHapticFeedback(
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            HapticFeedbackConstants.SEGMENT_FREQUENT_TICK
          } else {
            HapticFeedbackConstants.CLOCK_TICK
          },
        )
      }
      onValueChange(mapOf("value" to currentVal))
      invalidate()
    }
  }

  override fun onDetachedFromWindow() {
    if (running) Choreographer.getInstance().removeFrameCallback(this)
    running = false
    trackHeight = idleHeightPx.toDouble()
    targetHeight = idleHeightPx.toDouble()
    velocity = 0.0
    super.onDetachedFromWindow()
  }

  private companion object {
    // Spring.DampingRatioMediumBouncy at Spring.StiffnessMediumLow (BitChord ThinSlider).
    const val STIFFNESS = 400.0
    const val DAMPING = 20.0
    val RIM_STOPS = floatArrayOf(0f, 0.38f, 0.65f, 1f)
  }
}
