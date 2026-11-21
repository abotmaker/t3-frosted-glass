/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Liquid glass segmented control replicating Jarvoice's GlassSegmentedGroup:
 * glass track + frosted active pill that lifts, squashes, and refracts segment labels
 * via Android 13+ AGSL RuntimeShader lens while tapping or dragging.
 */
package expo.modules.t3liquidglass

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.text.TextPaint
import android.text.TextUtils
import android.util.Log
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

class T3LiquidGlassSegmentedModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlassSegmented")
    View(T3LiquidGlassSegmentedView::class) {
      Prop("labels") { view: T3LiquidGlassSegmentedView, value: List<String> ->
        view.setLabels(value)
      }
      Prop("selectedIndex") { view: T3LiquidGlassSegmentedView, value: Int ->
        view.setSelectedIndex(value)
      }
      Prop("dark") { view: T3LiquidGlassSegmentedView, value: Boolean ->
        view.setDarkMode(value)
      }
      Prop("compact") { view: T3LiquidGlassSegmentedView, value: Boolean ->
        view.setCompact(value)
      }
      Prop("selectedTextColor") { view: T3LiquidGlassSegmentedView, value: Int ->
        view.setSelectedTextColor(value)
      }
      Prop("mutedTextColor") { view: T3LiquidGlassSegmentedView, value: Int ->
        view.setMutedTextColor(value)
      }
      Events("onSelectIndex")
    }
  }
}

class T3LiquidGlassSegmentedView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {
  private val onSelectIndex by EventDispatcher()

  private val density = context.resources.displayMetrics.density
  private val track = GlassSurfaceDrawer(this, GlassLook.TRACK)
  private val flatPill = GlassSurfaceDrawer(this, GlassLook.PRIMARY)
  private val lensPill = GlassSurfaceDrawer(this, GlassLook.CLEAR)
  private val motion = GlassPillMotion({ invalidate() }, 0)

  private val pillInset = GlassTokens.SEGMENT_INSET_DP * density
  private val liftGrow = GlassTokens.SEGMENT_LIFT_DP * density
  private val lensHeight = GlassTokens.SEGMENT_LENS_HEIGHT_DP * density
  private val lensAmount = GlassTokens.SEGMENT_LENS_AMOUNT_DP * density
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

  private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
  }
  private val boldTypeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
  private val regularTypeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)

  private val trackRect = RectF()
  private val pillRect = RectF()

  private var labels: List<String> = emptyList()
  private var selectedIdx: Int = 0
  private var dark: Boolean = true
  private var compact: Boolean = false
  private var selectedTextColor: Int = Color.WHITE
  private var mutedTextColor: Int = 0xB3FFFFFF.toInt()
  private var hasLaidOut = false

  private var centers = FloatArray(0)
  private var cellWidths = FloatArray(0)
  private var lens: GlassRowLens? = null
  private var lensFailed = false

  private var downX = 0f
  private var downY = 0f
  private var touchTracking = false
  private var dragOriginX = 0f
  private var dragStartIndex = 0
  private var lastTickIndex = 0

  init {
    setWillNotDraw(false)
    clipChildren = false
    clipToPadding = false
  }

  fun setLabels(next: List<String>) {
    if (labels == next) return
    labels = next
    recomputeLayout()
    if (selectedIdx in labels.indices) motion.snapTo(selectedIdx)
    invalidate()
  }

  fun setSelectedIndex(index: Int) {
    if (selectedIdx == index) return
    selectedIdx = index
    if (index in labels.indices) {
      if (!hasLaidOut || centers.size != labels.size) {
        motion.snapTo(index)
      } else if (!motion.isDragging) {
        motion.setReduceMotion(!ValueAnimator.areAnimatorsEnabled())
        motion.animateTo(index)
      }
    }
    invalidate()
  }

  fun setDarkMode(isDark: Boolean) {
    if (dark == isDark) return
    dark = isDark
    track.dark = isDark
    flatPill.dark = isDark
    lensPill.dark = isDark
    flatPill.opacityOverride = if (isDark) null else 0.16f
    flatPill.accentColor = if (isDark) null else 0xFF0F172A.toInt()
    flatPill.accentOpacity = if (isDark) 0f else 0.12f
    invalidate()
  }

  fun setCompact(isCompact: Boolean) {
    compact = isCompact
    invalidate()
  }

  fun setSelectedTextColor(color: Int) {
    selectedTextColor = color
    invalidate()
  }

  fun setMutedTextColor(color: Int) {
    mutedTextColor = color
    invalidate()
  }

  private fun recomputeLayout() {
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0f || h <= 0f || labels.isEmpty()) {
      trackRect.setEmpty()
      centers = FloatArray(0)
      cellWidths = FloatArray(0)
      return
    }
    // Vertical breathing room so the lifted pill doesn't clip.
    val vPad = 4f * density
    val top = if (h > 36f * density) vPad else 0f
    val bottom = if (h > 36f * density) h - vPad else h
    trackRect.set(0f, top, w, bottom)
    track.setBounds(trackRect.left, trackRect.top, trackRect.right, trackRect.bottom, trackRect.height() * 0.5f)
    val n = labels.size
    val cellW = trackRect.width() / n
    centers = FloatArray(n) { i -> trackRect.left + cellW * (i + 0.5f) }
    cellWidths = FloatArray(n) { cellW }
    motion.setStepDp(stepPx() / density)
    hasLaidOut = true
    if (selectedIdx in labels.indices && motion.isFlat && !motion.isDragging) {
      motion.snapTo(selectedIdx)
    }
  }

  private fun stepPx(): Float {
    val n = centers.size
    return if (n < 2) 0f else abs(centers[n - 1] - centers[0]) / (n - 1)
  }

  private fun computePill(out: RectF) {
    val n = centers.size
    val p = motion.position
    val cx: Float
    val cellWidth: Float
    if (n == 1) {
      cx = centers[0]
      cellWidth = cellWidths[0]
    } else {
      val i = floor(p.toDouble()).toInt().coerceIn(0, n - 2)
      val f = p - i
      cx = centers[i] + (centers[i + 1] - centers[i]) * f
      val fw = f.coerceIn(0f, 1f)
      cellWidth = cellWidths[i] + (cellWidths[i + 1] - cellWidths[i]) * fw
    }
    val restH = trackRect.height() - 2f * pillInset
    val restW = cellWidth - 2f * pillInset
    val liftedH = trackRect.height() + liftGrow
    val liftedW = restW + (liftedH - restH)
    val w = (restW + (liftedW - restW) * motion.liftX) * (1f + motion.deviation)
    val h = (restH + (liftedH - restH) * motion.liftY) * (1f - motion.deviation)
    val cy = trackRect.centerY()
    out.set(cx - w * 0.5f, cy - h * 0.5f, cx + w * 0.5f, cy + h * 0.5f)
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    recomputeLayout()
  }

  override fun onDraw(canvas: Canvas) {
    if (trackRect.isEmpty || centers.size != labels.size) return
    val showPill = selectedIdx in labels.indices
    if (showPill) computePill(pillRect)
    val material = if (showPill && !motion.isFlat) motion.material else 0f
    val useLens = material > 0.001f &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !lensFailed &&
      canvas.isHardwareAccelerated

    if (useLens) {
      try {
        val activeLens = lens ?: GlassRowLens("T3 segment").also { lens = it }
        val rowCanvas = activeLens.beginRow(width, height)
        drawRow(rowCanvas, showPill, material, drawClearBody = false)
        activeLens.endRow()
        activeLens.drawRow(canvas)
        activeLens.drawLens(canvas, pillRect, lensHeight * motion.glassPresence, lensAmount * material)
      } catch (failure: RuntimeException) {
        Log.w(TAG, "Segment lens unavailable; using clear glass", failure)
        lensFailed = true
        lens?.release()
        lens = null
        drawRow(canvas, showPill, material, drawClearBody = true)
        return
      }
      val rim = material * GlassPillMotion.rimAlpha(motion.glassPresence)
      if (rim > 0f) drawPillAtAlpha(canvas, lensPill, rim, withBackdrop = false)
    } else {
      drawRow(canvas, showPill, material, drawClearBody = true)
    }
  }

  private fun drawRow(canvas: Canvas, showPill: Boolean, material: Float, drawClearBody: Boolean) {
    track.draw(canvas, pressed = false)
    if (showPill) {
      val radius = pillRect.height() * 0.5f
      flatPill.setBounds(pillRect.left, pillRect.top, pillRect.right, pillRect.bottom, radius)
      if (material <= 0f) {
        flatPill.draw(canvas, pressed = false, withBackdrop = false)
      } else {
        if (material < 1f) drawPillAtAlpha(canvas, flatPill, 1f - material, withBackdrop = false)
        if (drawClearBody) drawPillAtAlpha(canvas, lensPill, material, withBackdrop = false)
      }
    }
    drawLabels(canvas)
  }

  private fun drawPillAtAlpha(
    canvas: Canvas,
    surface: GlassSurfaceDrawer,
    alpha: Float,
    withBackdrop: Boolean,
  ) {
    surface.setBounds(pillRect.left, pillRect.top, pillRect.right, pillRect.bottom, pillRect.height() * 0.5f)
    val save = canvas.saveLayerAlpha(
      pillRect.left - 2f,
      pillRect.top - 2f,
      pillRect.right + 2f,
      pillRect.bottom + 2f,
      (alpha.coerceIn(0f, 1f) * 255f).roundToInt(),
    )
    surface.draw(canvas, pressed = false, withBackdrop = withBackdrop)
    canvas.restoreToCount(save)
  }

  private fun drawLabels(canvas: Canvas) {
    textPaint.textSize = (if (compact) 12.5f else 13.5f) * density
    val fm = textPaint.fontMetrics
    val baselineOffset = -(fm.ascent + fm.descent) * 0.5f
    val activePos = motion.position
    for (i in labels.indices) {
      val proximity = (1f - abs(activePos - i)).coerceIn(0f, 1f)
      textPaint.color = GlassTokens.blendColors(mutedTextColor, selectedTextColor, proximity)
      textPaint.typeface = if (proximity > 0.5f) boldTypeface else regularTypeface
      val availWidth = (cellWidths[i] - 12f * density).coerceAtLeast(8f)
      val fitted = TextUtils.ellipsize(labels[i], textPaint, availWidth, TextUtils.TruncateAt.END).toString()
      canvas.drawText(fitted, centers[i], trackRect.centerY() + baselineOffset, textPaint)
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!isEnabled || labels.isEmpty() || centers.isEmpty()) return super.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
        touchTracking = true
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (!motion.isDragging && touchTracking && labels.size > 1 && stepPx() > 0f && passedSlop(event)) {
          beginDrag(event.x)
        }
        if (motion.isDragging) dragTo(event.x)
        return true
      }
      MotionEvent.ACTION_UP -> {
        if (motion.isDragging) {
          endDrag(event.x)
        } else if (touchTracking) {
          val next = nearestIndex(event.x)
          if (next != selectedIdx) {
            selectedIdx = next
            performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
            motion.setReduceMotion(!ValueAnimator.areAnimatorsEnabled())
            motion.animateTo(next)
            onSelectIndex(mapOf("index" to next))
            invalidate()
          }
        }
        touchTracking = false
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        if (motion.isDragging) motion.release(max(0, selectedIdx))
        touchTracking = false
        return true
      }
    }
    return super.onTouchEvent(event)
  }

  private fun passedSlop(ev: MotionEvent): Boolean {
    val dx = abs(ev.x - downX)
    val dy = abs(ev.y - downY)
    return dx > touchSlop && dx > dy
  }

  private fun beginDrag(x: Float) {
    parent?.requestDisallowInterceptTouchEvent(true)
    dragOriginX = x
    dragStartIndex = selectedIdx.coerceIn(0, labels.lastIndex)
    lastTickIndex = dragStartIndex
    motion.setReduceMotion(!ValueAnimator.areAnimatorsEnabled())
    motion.startDrag()
  }

  private fun dragPosition(x: Float): Float {
    val dir = if (layoutDirection == LAYOUT_DIRECTION_RTL) -1f else 1f
    val p = dragStartIndex + (x - dragOriginX) * dir / stepPx()
    return p.coerceIn(0f, (labels.size - 1).toFloat())
  }

  private fun dragTo(x: Float) {
    val p = dragPosition(x)
    motion.dragTo(p)
    val nearest = p.roundToInt()
    if (nearest != lastTickIndex) {
      performHapticFeedback(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          HapticFeedbackConstants.SEGMENT_FREQUENT_TICK
        } else {
          HapticFeedbackConstants.CLOCK_TICK
        },
      )
      lastTickIndex = nearest
    }
  }

  private fun endDrag(x: Float) {
    val next = dragPosition(x).roundToInt().coerceIn(0, labels.lastIndex)
    motion.release(next)
    if (next != selectedIdx) {
      selectedIdx = next
      onSelectIndex(mapOf("index" to next))
    }
    invalidate()
  }

  private fun nearestIndex(x: Float): Int {
    var best = 0
    var bestDist = Float.MAX_VALUE
    for (i in centers.indices) {
      val d = abs(centers[i] - x)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    return best
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    track.onAttached()
    flatPill.onAttached()
    lensPill.onAttached()
  }

  override fun onDetachedFromWindow() {
    motion.snapTo(max(0, selectedIdx))
    track.onDetached()
    flatPill.onDetached()
    lensPill.onDetached()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      lens?.release()
    }
    lens = null
    super.onDetachedFromWindow()
  }

  private companion object {
    const val TAG = "T3LiquidGlassSegmented"
  }
}
