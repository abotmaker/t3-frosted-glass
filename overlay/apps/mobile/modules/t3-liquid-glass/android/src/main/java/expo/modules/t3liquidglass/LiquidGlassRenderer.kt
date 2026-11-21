/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Adapted from Jarvoice's LiquidGlassRenderer.java (which adapted kushagrasinghx/BitChord
 * LiquidGlass.kt at 1189e6a566c9181111205f26a983f7984f9393ea, GPL-3.0).
 * BitChord credits EchoMusicApp/Echo-Music for the integration and Kyant0/backdrop
 * for the Apache-2.0 AGSL refraction shader.
 */
package expo.modules.t3liquidglass

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.util.Log
import android.view.View
import androidx.annotation.RequiresApi
import kotlin.math.ceil
import kotlin.math.min

/** Samples the route's content display list at the glass surface's window position. */
internal class LiquidGlassRenderer(private val view: View) {
  private val density = view.resources.displayMetrics.density
  private val bounds = RectF()
  private val clip = Path()
  private val radii = FloatArray(8)
  private val viewLocation = IntArray(2)
  private var hardware: BackdropEffect? = null
  private var blurRadiusDp = GlassTokens.BLUR_RADIUS_DP
  private var effectDark = true
  private var enabled = true
  private var failed = false

  private var clipWidth = -1
  private var clipHeight = -1
  private var clipTop = -1f
  private var clipBottom = -1f

  fun setEnabled(enabled: Boolean): Boolean {
    if (this.enabled == enabled) return false
    this.enabled = enabled
    if (!enabled) release()
    return true
  }

  fun draw(
    canvas: Canvas,
    left: Int,
    top: Int,
    right: Int,
    bottom: Int,
    topRadius: Float,
    bottomRadius: Float,
    dark: Boolean,
    look: GlassLook,
    backdropAlpha: Float,
    accentColor: Int?,
    cachedBackdrop: T3LiquidGlassBackdropView? = null,
  ): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !enabled || failed || !canvas.isHardwareAccelerated) {
      return false
    }
    val width = right - left
    val height = bottom - top
    if (width <= 0 || height <= 0) return false

    val backdrop = cachedBackdrop ?: findGlassBackdrop(view) ?: return false
    val menuSource = if (look == GlassLook.MENU) backdrop.menuSourceFor(view) else null
    // Composer suggestions share the menu material and sit beside the thread feed source.
    val localContent = menuSource == null && look.samplesContent && backdrop.canSampleContent(view)
    val live = menuSource != null || localContent
    // Both dark (#000000) and light (#F2F4F7) use uniform clean canvases, so blurring without
    // live screen content behind the glass would leave a flat color unchanged.
    if (!live) return false

    view.getLocationInWindow(viewLocation)
    val windowX = viewLocation[0] + left
    val windowY = viewLocation[1] + top
    val halfMin = min(width, height) * 0.5f
    val rTop = topRadius.coerceIn(0f, halfMin)
    val rBottom = bottomRadius.coerceIn(0f, halfMin)

    return try {
      if (blurRadiusDp != look.blurRadiusDp || effectDark != dark) {
        release()
        blurRadiusDp = look.blurRadiusDp
        effectDark = dark
      }
      val effect = hardware ?: BackdropEffect(density, blurRadiusDp, dark).also { hardware = it }

      // Combine source display-list generations + overlap check so unchanged frames reuse
      // the cached RenderNode without re-recording the screen hierarchy.
      val padPx = effect.sourceOverlapPaddingPx
      var generationHash = 17L
      var overlappingSources = 0
      if (menuSource != null && menuSource.hasRecordedContent()) {
        val locHash = menuSource.refreshWindowLocation()
        generationHash = generationHash * 31L + menuSource.contentGeneration
        generationHash = generationHash * 31L + locHash
        overlappingSources = 1
      } else if (localContent) {
        for (source in backdrop.sources) {
          if (source.hasRecordedContent() &&
            source.overlapsWindowRect(windowX, windowY, width, height, padPx)
          ) {
            generationHash = generationHash * 31L + source.contentGeneration
            generationHash = generationHash * 31L +
              ((source.windowLeft.toLong() shl 32) xor (source.windowTop.toLong() and 0xFFFFFFFFL))
            overlappingSources += 1
          }
        }
      }
      if (overlappingSources == 0) return false

      val targetAlpha = if (live) 1f else backdropAlpha
      effect.recordIfDirty(
        w = width,
        h = height,
        top = rTop,
        bottom = rBottom,
        alpha = targetAlpha,
        windowX = windowX,
        windowY = windowY,
        generationHash = generationHash,
        sourceCount = overlappingSources,
      ) { recording ->
        recording.drawColor(if (dark) Color.BLACK else GlassTokens.LIGHT_CANVAS)
        if (menuSource != null) {
          menuSource.drawBackdrop(recording, windowX, windowY)
        } else if (localContent) {
          for (source in backdrop.sources) {
            if (source.overlapsWindowRect(windowX, windowY, width, height, padPx)) {
              source.drawBackdrop(recording, windowX, windowY)
            }
          }
        }
      }

      if (clipWidth != width || clipHeight != height || clipTop != rTop || clipBottom != rBottom) {
        clipWidth = width
        clipHeight = height
        clipTop = rTop
        clipBottom = rBottom
        bounds.set(0f, 0f, width.toFloat(), height.toFloat())
        radii.fill(rTop, 0, 4)
        radii.fill(rBottom, 4, 8)
        clip.rewind()
        clip.addRoundRect(bounds, radii, Path.Direction.CW)
      }

      val save = canvas.save()
      try {
        canvas.translate(left.toFloat(), top.toFloat())
        canvas.clipPath(clip)
        effect.draw(canvas)
      } finally {
        canvas.restoreToCount(save)
      }
      true
    } catch (failure: RuntimeException) {
      Log.w("T3LiquidGlass", "GPU backdrop unavailable; using the glass tint", failure)
      release()
      failed = true
      false
    }
  }

  fun release() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) hardware?.release()
    hardware = null
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private class BackdropEffect(density: Float, blurRadiusDp: Float, dark: Boolean) {
    // 0.5x preserves thin white text strokes before Gaussian blur so dark-mode UI content
    // glows visibly through menus and floating oval headers rather than aliasing away.
    private val scale = 0.5f
    private val blur = blurRadiusDp * density * scale
    private val lensHeight = GlassTokens.REFRACTION_HEIGHT_DP * density * scale
    private val lensAmount = GlassTokens.REFRACTION_AMOUNT_DP * density * scale
    private val padding = ceil(blur * 2f + lensAmount).toInt()
    val sourceOverlapPaddingPx: Int = ceil(padding / scale).toInt()

    private val saturation = ColorMatrixColorFilter(
      ColorMatrix().apply {
        setSaturation(GlassTokens.SATURATION)
        if (dark) {
          val lift = ColorMatrix(
            floatArrayOf(
              1.14f, 0f, 0f, 0f, 0f,
              0f, 1.14f, 0f, 0f, 0f,
              0f, 0f, 1.14f, 0f, 0f,
              0f, 0f, 0f, 1f, 0f,
            ),
          )
          postConcat(lift)
        } else {
          // Symmetric light-mode contrast anchor around #F4F4F4 (244) keeps the porcelain
          // canvas neutral while preserving blurred dark ink strokes through frosted glass.
          val anchor = ColorMatrix(
            floatArrayOf(
              1.10f, 0f, 0f, 0f, -24.4f,
              0f, 1.10f, 0f, 0f, -24.4f,
              0f, 0f, 1.10f, 0f, -24.4f,
              0f, 0f, 0f, 1f, 0f,
            ),
          )
          postConcat(anchor)
        }
      },
    )
    private val blurChainEffect: RenderEffect =
      RenderEffect.createBlurEffect(
        blur,
        blur,
        RenderEffect.createColorFilterEffect(saturation),
        Shader.TileMode.CLAMP,
      )
    private val refractionShader: Any? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Api33.createShader()
      } else {
        null
      }

    private val node = RenderNode("T3 glass lens backdrop")
    private var width = -1
    private var height = -1
    private var topRadius = -1f
    private var bottomRadius = -1f
    private var lastWindowX = Int.MIN_VALUE
    private var lastWindowY = Int.MIN_VALUE
    private var lastGenerationHash = Long.MIN_VALUE
    private var lastSourceCount = -1

    fun recordIfDirty(
      w: Int,
      h: Int,
      top: Float,
      bottom: Float,
      alpha: Float,
      windowX: Int,
      windowY: Int,
      generationHash: Long,
      sourceCount: Int,
      drawContent: (Canvas) -> Unit,
    ) {
      val clampedAlpha = alpha.coerceIn(0f, 1f)
      val geometryChanged = w != width || h != height || top != topRadius || bottom != bottomRadius
      if (!geometryChanged &&
        node.hasDisplayList() &&
        lastWindowX == windowX &&
        lastWindowY == windowY &&
        lastGenerationHash == generationHash &&
        lastSourceCount == sourceCount
      ) {
        if (node.alpha != clampedAlpha) node.alpha = clampedAlpha
        return
      }

      val scaledWidth = w * scale
      val scaledHeight = h * scale
      val recordingWidth = ceil(scaledWidth).toInt() + padding * 2
      val recordingHeight = ceil(scaledHeight).toInt() + padding * 2
      if (geometryChanged) {
        width = w
        height = h
        topRadius = top
        bottomRadius = bottom
        node.setPosition(0, 0, recordingWidth, recordingHeight)
        var effect = blurChainEffect
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && refractionShader != null) {
          effect = Api33.lens(
            refractionShader,
            effect,
            scaledWidth,
            scaledHeight,
            padding,
            top * scale,
            bottom * scale,
            lensHeight,
            lensAmount,
          )
        }
        node.setRenderEffect(effect)
      }
      node.alpha = clampedAlpha
      lastWindowX = windowX
      lastWindowY = windowY
      lastGenerationHash = generationHash
      lastSourceCount = sourceCount

      val recording = node.beginRecording(recordingWidth, recordingHeight)
      try {
        recording.translate(padding.toFloat(), padding.toFloat())
        recording.scale(scale, scale)
        drawContent(recording)
      } finally {
        node.endRecording()
      }
    }

    fun draw(canvas: Canvas) {
      canvas.scale(1f / scale, 1f / scale)
      canvas.translate(-padding.toFloat(), -padding.toFloat())
      canvas.drawRenderNode(node)
    }

    fun release() {
      node.discardDisplayList()
      lastGenerationHash = Long.MIN_VALUE
      lastSourceCount = -1
    }
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private object Api33 {
    fun createShader(): RuntimeShader = RuntimeShader(GlassShaders.REFRACTION)

    fun lens(
      shaderObj: Any,
      input: RenderEffect,
      width: Float,
      height: Float,
      padding: Int,
      topRadius: Float,
      bottomRadius: Float,
      lensHeight: Float,
      lensAmount: Float,
    ): RenderEffect {
      val shader = shaderObj as RuntimeShader
      val halfMin = min(width, height) * 0.5f
      val rTop = min(topRadius, halfMin)
      val rBot = min(bottomRadius, halfMin)
      shader.setFloatUniform("size", width, height)
      shader.setFloatUniform("offset", -padding.toFloat(), -padding.toFloat())
      // cornerRadii order in shader: x=topLeft, y=topRight, z=bottomRight, w=bottomLeft
      shader.setFloatUniform("cornerRadii", rTop, rTop, rBot, rBot)
      shader.setFloatUniform("refractionHeight", min(lensHeight, halfMin))
      shader.setFloatUniform("refractionAmount", -min(lensAmount, halfMin))
      shader.setFloatUniform("depthEffect", GlassTokens.DEPTH_EFFECT)
      shader.setFloatUniform("chromaticAberration", GlassTokens.CHROMATIC_ABERRATION)
      return RenderEffect.createChainEffect(
        RenderEffect.createRuntimeShaderEffect(shader, "content"),
        input,
      )
    }
  }
}
