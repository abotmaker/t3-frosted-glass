/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Floating liquid glass navigation dock replicating Jarvoice/BitChord's GlassSelectionPill
 * and GlassSegmentedGroup: frosted capsule dock with draggable & tappable spring-squashing
 * selection pill and live AGSL icon refraction lens on Android 13+.
 */
package expo.modules.t3liquidglass

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.Log
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.DrawableCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class T3LiquidGlassDockModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3LiquidGlassDock")
    View(T3LiquidGlassDockView::class) {
      Prop("tabs") { view: T3LiquidGlassDockView, value: List<String> ->
        view.setTabs(value)
      }
      Prop("selectedTab") { view: T3LiquidGlassDockView, value: String ->
        view.setSelectedTab(value)
      }
      Prop("dark") { view: T3LiquidGlassDockView, value: Boolean ->
        view.setDarkMode(value)
      }
      Prop("floating") { view: T3LiquidGlassDockView, value: Boolean ->
        view.setFloatingMode(value)
      }
      Prop("textScale") { view: T3LiquidGlassDockView, value: Float ->
        view.setTextScale(value)
      }
      Prop("selectedColor") { view: T3LiquidGlassDockView, value: Int ->
        view.setSelectedColor(value)
      }
      Prop("unselectedColor") { view: T3LiquidGlassDockView, value: Int ->
        view.setUnselectedColor(value)
      }
      Prop("accentColor") { view: T3LiquidGlassDockView, value: Int? ->
        view.setAccentColor(value)
      }
      Events("onTabSelected")
    }
  }
}

class T3LiquidGlassDockView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {
  private val onTabSelected by EventDispatcher()

  private val density = context.resources.displayMetrics.density
  private val track = GlassSurfaceDrawer(this, GlassLook.DOCK)
  private val flatPill = GlassSurfaceDrawer(this, GlassLook.PRIMARY)
  private val lensPill = GlassSurfaceDrawer(this, GlassLook.CLEAR)
  private val motion = GlassPillMotion({ invalidate() }, 0)

  private val shadowInset = 8f * density
  private val pillInset = 4f * density
  private val liftGrow = GlassTokens.SEGMENT_LIFT_DP * density
  private val lensHeight = GlassTokens.SEGMENT_LENS_HEIGHT_DP * density
  private val lensAmount = GlassTokens.SEGMENT_LENS_AMOUNT_DP * density
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

  private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.FILL
    color = Color.TRANSPARENT
  }
  private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
  }

  private val trackRect = RectF()
  private val pillRect = RectF()
  private val iconCache = mutableMapOf<String, Drawable?>()

  private var tabs: List<String> = listOf("threads", "pullRequests", "issues", "usage", "settings")
  private var selectedTab: String = "threads"
  private var dark: Boolean = true
  private var floating: Boolean = true
  private var textScale: Float = 1f
  private var selectedColor: Int = Color.WHITE
  private var unselectedColor: Int = 0xB3FFFFFF.toInt()
  private var themeAccentColor: Int? = null
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
    updateShadow()
  }

  fun setTabs(nextTabs: List<String>) {
    if (tabs == nextTabs) return
    tabs = nextTabs
    recomputeLayout()
    val idx = selectedIndex().coerceAtLeast(0)
    motion.snapTo(idx)
    invalidate()
  }

  fun setSelectedTab(tab: String) {
    if (selectedTab == tab) return
    selectedTab = tab
    val idx = selectedIndex()
    if (idx >= 0) {
      if (!hasLaidOut || centers.size != tabs.size) {
        motion.snapTo(idx)
      } else if (!motion.isDragging) {
        motion.setReduceMotion(!ValueAnimator.areAnimatorsEnabled())
        motion.animateTo(idx)
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
    updatePillAccent()
    updateShadow()
    invalidate()
  }

  fun setFloatingMode(isFloating: Boolean) {
    if (floating == isFloating) return
    floating = isFloating
    track.look = if (isFloating) GlassLook.DOCK else GlassLook.HEADER
    recomputeLayout()
    invalidate()
  }

  fun setTextScale(scale: Float) {
    textScale = scale.coerceIn(0.8f, 1.5f)
    invalidate()
  }

  fun setSelectedColor(color: Int) {
    selectedColor = color
    invalidate()
  }

  fun setUnselectedColor(color: Int) {
    unselectedColor = color
    invalidate()
  }

  fun setAccentColor(color: Int?) {
    themeAccentColor = color
    updatePillAccent()
    invalidate()
  }

  private fun updatePillAccent() {
    if (dark) {
      flatPill.opacityOverride = null
      flatPill.accentColor = themeAccentColor
      flatPill.accentOpacity = 0.14f
    } else {
      // Crisp frosted cool-slate active capsule on light glass so the selected tab pops like dark mode.
      flatPill.opacityOverride = 0.16f
      flatPill.accentColor = 0xFF0F172A.toInt()
      flatPill.accentOpacity = 0.12f
    }
  }

  private fun updateShadow() {
    val shadowColor = if (dark) 0x58000000 else 0x2A0F172A
    shadowPaint.color = if (dark) 0x1A000000 else 0x0E0F172A
    shadowPaint.setShadowLayer(12f * density, 0f, 5f * density, shadowColor)
  }

  private fun selectedIndex(): Int = tabs.indexOf(selectedTab)

  private fun recomputeLayout() {
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0f || h <= 0f || tabs.isEmpty()) {
      trackRect.setEmpty()
      centers = FloatArray(0)
      cellWidths = FloatArray(0)
      return
    }
    if (floating) {
      trackRect.set(shadowInset, shadowInset, w - shadowInset, h - shadowInset)
      track.setBounds(trackRect.left, trackRect.top, trackRect.right, trackRect.bottom, trackRect.height() * 0.5f)
    } else {
      trackRect.set(0f, 0f, w, h)
      track.setBounds(0f, 0f, w, h, 0f)
    }
    val n = tabs.size
    val innerLeft = trackRect.left + (if (floating) 2f * density else 8f * density)
    val innerRight = trackRect.right - (if (floating) 2f * density else 8f * density)
    val cellW = (innerRight - innerLeft) / n
    centers = FloatArray(n) { i -> innerLeft + cellW * (i + 0.5f) }
    cellWidths = FloatArray(n) { cellW }
    motion.setStepDp(stepPx() / density)
    hasLaidOut = true
    val idx = selectedIndex()
    if (idx >= 0 && motion.isFlat && !motion.isDragging) {
      motion.snapTo(idx)
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
    val restH = if (floating) trackRect.height() - 2f * pillInset else min(trackRect.height() - 12f * density, 54f * density)
    val restW = cellWidth - 2f * pillInset
    val liftedH = restH + liftGrow
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
    if (trackRect.isEmpty || centers.size != tabs.size) return
    val showPill = selectedIndex() >= 0
    if (showPill) computePill(pillRect)

    if (floating) {
      val r = trackRect.height() * 0.5f
      canvas.drawRoundRect(trackRect, r, r, shadowPaint)
    }

    val material = if (showPill && !motion.isFlat) motion.material else 0f
    val useLens = material > 0.001f &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !lensFailed &&
      canvas.isHardwareAccelerated

    if (useLens) {
      try {
        val activeLens = lens ?: GlassRowLens("T3 dock").also { lens = it }
        val rowCanvas = activeLens.beginRow(width, height)
        drawRow(rowCanvas, showPill, material, drawClearBody = false)
        activeLens.endRow()
        activeLens.drawRow(canvas)
        activeLens.drawLens(canvas, pillRect, lensHeight * motion.glassPresence, lensAmount * material)
      } catch (failure: RuntimeException) {
        Log.w(TAG, "Dock lens unavailable; using clear glass", failure)
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
    drawTabContent(canvas)
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

  private fun drawTabContent(canvas: Canvas) {
    val iconSize = (24f * textScale * density).roundToInt().coerceIn((18f * density).roundToInt(), (30f * density).roundToInt())
    val activePos = motion.position
    for (i in tabs.indices) {
      val tab = tabs[i]
      val cx = centers[i]
      val cy = trackRect.centerY()
      val proximity = (1f - abs(activePos - i)).coerceIn(0f, 1f)
      val tint = GlassTokens.blendColors(unselectedColor, selectedColor, proximity)
      val drawable = getIcon(tab) ?: continue
      DrawableCompat.setTint(drawable, tint)
      if (floating) {
        val half = iconSize / 2
        drawable.setBounds(
          (cx - half).roundToInt(),
          (cy - half).roundToInt(),
          (cx + half).roundToInt(),
          (cy + half).roundToInt(),
        )
        drawable.draw(canvas)
      } else {
        val iconTop = (cy - iconSize * 0.72f).roundToInt()
        val half = iconSize / 2
        drawable.setBounds(
          (cx - half).roundToInt(),
          iconTop,
          (cx + half).roundToInt(),
          iconTop + iconSize,
        )
        drawable.draw(canvas)
        labelPaint.color = tint
        labelPaint.textSize = 11.5f * textScale * density
        canvas.drawText(tabTitle(tab), cx, iconTop + iconSize + 14f * density, labelPaint)
      }
    }
  }

  private fun getIcon(tab: String): Drawable? = iconCache.getOrPut(tab) {
    val resId = when (tab) {
      "threads" -> R.drawable.glass_tab_chats
      "pullRequests" -> R.drawable.glass_tab_pull_requests
      "issues" -> R.drawable.glass_tab_issues
      "usage" -> R.drawable.glass_tab_usage
      else -> R.drawable.glass_tab_settings
    }
    ContextCompat.getDrawable(context, resId)?.mutate()
  }

  private fun tabTitle(tab: String): String = when (tab) {
    "threads" -> "Chats"
    "pullRequests" -> "Pulls"
    "issues" -> "Issues"
    "usage" -> "Usage"
    else -> "Settings"
  }

  // ---- Touch: tap or horizontal drag with BitChord lens physics ----

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!isEnabled || tabs.isEmpty() || centers.isEmpty()) return super.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
        touchTracking = true
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (!motion.isDragging && touchTracking && tabs.size > 1 && stepPx() > 0f && passedSlop(event)) {
          beginDrag(event.x)
        }
        if (motion.isDragging) dragTo(event.x)
        return true
      }
      MotionEvent.ACTION_UP -> {
        if (motion.isDragging) {
          endDrag(event.x)
        } else if (touchTracking) {
          val tapped = nearestIndex(event.x)
          selectTabIndex(tapped)
        }
        touchTracking = false
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        if (motion.isDragging) motion.release(max(0, selectedIndex()))
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
    dragStartIndex = max(0, selectedIndex())
    lastTickIndex = dragStartIndex
    motion.setReduceMotion(!ValueAnimator.areAnimatorsEnabled())
    motion.startDrag()
  }

  private fun dragPosition(x: Float): Float {
    val dir = if (layoutDirection == LAYOUT_DIRECTION_RTL) -1f else 1f
    val p = dragStartIndex + (x - dragOriginX) * dir / stepPx()
    return p.coerceIn(0f, (tabs.size - 1).toFloat())
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
    val next = dragPosition(x).roundToInt().coerceIn(0, tabs.lastIndex)
    motion.release(next)
    val tab = tabs[next]
    if (tab != selectedTab) {
      selectedTab = tab
      onTabSelected(mapOf("tab" to tab))
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

  private fun selectTabIndex(index: Int) {
    if (index !in tabs.indices) return
    val tab = tabs[index]
    performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    if (tab != selectedTab) {
      selectedTab = tab
      motion.setReduceMotion(!ValueAnimator.areAnimatorsEnabled())
      motion.animateTo(index)
      onTabSelected(mapOf("tab" to tab))
    } else {
      // Allow re-tapping current tab (e.g. closing settings or scrolling to top).
      onTabSelected(mapOf("tab" to tab))
    }
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    track.onAttached()
    flatPill.onAttached()
    lensPill.onAttached()
  }

  override fun onDetachedFromWindow() {
    motion.snapTo(max(0, selectedIndex()))
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
    const val TAG = "T3LiquidGlassDock"
  }
}
