/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Live moving-pill AGSL refraction lens adapted from Jarvoice's GlassSegmentedGroup.Lens
 * (BitChord GlassSelectionPill.kt / Kyant0/backdrop Apache-2.0 shader).
 */
package expo.modules.t3liquidglass

import android.graphics.Canvas
import android.graphics.Path
import android.graphics.RecordingCanvas
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal class GlassRowLens(namePrefix: String) {
  private val rowNode = RenderNode("$namePrefix row")
  private val lensNode = RenderNode("$namePrefix lens")
  private val shader = RuntimeShader(GlassShaders.REFRACTION)
  private val clip = Path()
  private val bounds = RectF()

  fun beginRow(width: Int, height: Int): RecordingCanvas {
    rowNode.setPosition(0, 0, width, height)
    return rowNode.beginRecording(width, height)
  }

  fun endRow() {
    rowNode.endRecording()
  }

  fun drawRow(canvas: Canvas) {
    canvas.drawRenderNode(rowNode)
  }

  fun drawLens(canvas: Canvas, pill: RectF, height: Float, amount: Float) {
    val w = max(1, ceil(pill.width().toDouble()).toInt())
    val h = max(1, ceil(pill.height().toDouble()).toInt())
    val halfMin = min(w, h) * 0.5f
    shader.setFloatUniform("size", w.toFloat(), h.toFloat())
    shader.setFloatUniform("offset", 0f, 0f)
    shader.setFloatUniform("cornerRadii", halfMin, halfMin, halfMin, halfMin)
    shader.setFloatUniform("refractionHeight", min(height, halfMin).coerceAtLeast(1f))
    shader.setFloatUniform("refractionAmount", -amount)
    shader.setFloatUniform("depthEffect", 0f)
    shader.setFloatUniform("chromaticAberration", 1f)
    lensNode.setPosition(0, 0, w, h)
    lensNode.setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "content"))
    val recording = lensNode.beginRecording(w, h)
    try {
      recording.translate(-pill.left, -pill.top)
      recording.drawRenderNode(rowNode)
    } finally {
      lensNode.endRecording()
    }
    val save = canvas.save()
    try {
      canvas.translate(pill.left, pill.top)
      bounds.set(0f, 0f, w.toFloat(), h.toFloat())
      clip.rewind()
      clip.addRoundRect(bounds, halfMin, halfMin, Path.Direction.CW)
      canvas.clipPath(clip)
      canvas.drawRenderNode(lensNode)
    } finally {
      canvas.restoreToCount(save)
    }
  }

  fun release() {
    rowNode.discardDisplayList()
    lensNode.discardDisplayList()
  }
}
