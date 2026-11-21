/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Selection pill motion (travel spring, held lift, acceleration squash, and glass-to-flat
 * hand-off with their exact constants) ported from Jarvoice's GlassPillMotion.java and
 * BitChord's GlassSelectionPill.kt (1189e6a566c9181111205f26a983f7984f9393ea, GPL-3.0),
 * which ports liquid_glass_easy 4.3.4 (Copyright (c) 2025 Ahmed Gamil, MIT License).
 */
package expo.modules.t3liquidglass

import android.view.Choreographer
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign

internal class GlassPillMotion(
  private val listener: () -> Unit,
  initialIndex: Int = 0,
) : Choreographer.FrameCallback {
  var position: Float = 0f
    private set
  var liftX: Float = 0f
    private set
  var liftY: Float = 0f
    private set
  var material: Float = 0f
    private set
  var deviation: Float = 0f
    private set
  var glassPresence: Float = 0f
    private set
  var isFlat: Boolean = true
    private set
  var isDragging: Boolean = false
    private set
  var index: Int = 0
    private set

  private var stepDp: Float = 0f
  private var reduceMotion: Boolean = false

  private val squashModel = SquashModel()
  private var travelPos = 0.0
  private var travelVel = 0.0
  private var travelTarget = 0.0
  private var travelFrom = 0.0
  private var travelActive = false

  private var lifted = false
  private var liftXPos = 0.0
  private var liftXVel = 0.0
  private var liftYPos = 0.0
  private var liftYVel = 0.0
  private var liftPos = 0.0
  private var liftVel = 0.0

  private var dragTarget = 0.0
  private var dragFollow = 0.0

  private var travelSign = 0.0
  private var travelSignEased = 0.0
  private var handover = 1.0
  private var squash = 0.0

  private var running = false
  private var lastFrameNanos = -1L

  init {
    snapTo(initialIndex)
  }

  fun setStepDp(dp: Float) {
    stepDp = dp
  }

  fun setReduceMotion(reduce: Boolean) {
    reduceMotion = reduce
  }

  fun animateTo(next: Int) {
    if (next == index && !travelActive && !isDragging) return
    if (reduceMotion) {
      snapTo(next)
      return
    }
    index = next
    travelActive = true
    lifted = true
    travelFrom = travelPos
    travelTarget = next.toDouble()
    travelSign = signOfTravel(travelTarget - travelFrom)
    isFlat = false
    start()
  }

  fun snapTo(target: Int) {
    stop()
    index = target
    travelPos = target.toDouble()
    travelTarget = travelPos
    travelFrom = travelPos
    travelVel = 0.0
    travelActive = false
    isDragging = false
    lifted = false
    liftXPos = 0.0; liftXVel = 0.0
    liftYPos = 0.0; liftYVel = 0.0
    liftPos = 0.0; liftVel = 0.0
    handover = 1.0
    squash = 0.0
    squashModel.stop()
    travelSign = 0.0
    travelSignEased = 0.0
    publish()
    isFlat = true
  }

  fun startDrag() {
    isDragging = true
    travelActive = false
    lifted = !reduceMotion
    travelSign = 0.0
    dragFollow = travelPos
    dragTarget = travelPos
    travelVel = 0.0
    isFlat = false
    start()
  }

  fun dragTo(pos: Float) {
    if (isDragging) dragTarget = pos.toDouble()
  }

  fun release(next: Int) {
    if (!isDragging) return
    val from = dragFollow
    isDragging = false
    index = next
    if (reduceMotion) {
      snapTo(next)
      return
    }
    travelActive = true
    travelPos = from
    travelVel = 0.0
    travelFrom = from
    travelTarget = next.toDouble()
    travelSign = signOfTravel(travelTarget - travelFrom)
    start()
  }

  fun stop() {
    if (running) Choreographer.getInstance().removeFrameCallback(this)
    running = false
    lastFrameNanos = -1L
  }

  private fun start() {
    if (running) return
    running = true
    lastFrameNanos = -1L
    Choreographer.getInstance().postFrameCallback(this)
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (!running) return
    val dt = if (lastFrameNanos < 0L) 0.0 else min(MAX_FRAME_SECONDS, (frameTimeNanos - lastFrameNanos) / 1e9)
    lastFrameNanos = frameTimeNanos
    val more = tick(dt, frameTimeNanos / 1e9)
    listener()
    if (more) {
      Choreographer.getInstance().postFrameCallback(this)
    } else {
      running = false
      lastFrameNanos = -1L
    }
  }

  /** One frame step; returns false once every spring has settled. */
  internal fun tick(dt: Double, now: Double): Boolean {
    var travelSettled = true
    if (travelActive) {
      val (p, v) = springStep(travelPos, travelVel, travelTarget, dt, TRAVEL_STIFFNESS, TRAVEL_DAMPING)
      travelPos = p
      travelVel = v
      travelSettled = abs(travelPos - travelTarget) < 0.003 && abs(travelVel) < 0.05
      if (travelSettled) {
        travelPos = travelTarget
        travelVel = 0.0
      }
    }

    if (isDragging) {
      dragFollow += if (reduceMotion) {
        dragTarget - dragFollow
      } else {
        (dragTarget - dragFollow) * (1.0 - exp(-dt / FOLLOW_TAU))
      }
    }

    if (!isDragging && (travelSettled || travelProgress() >= HANDOVER_START)) {
      lifted = false
    }
    val liftTarget = if (lifted) 1.0 else 0.0
    val (lx, lxv) = stepLift(liftXPos, liftXVel, liftTarget, dt, LIFT_STIFFNESS, LIFT_DAMPING_X)
    liftXPos = lx; liftXVel = lxv
    val (ly, lyv) = stepLift(liftYPos, liftYVel, liftTarget, dt, LIFT_STIFFNESS, LIFT_DAMPING_Y)
    liftYPos = ly; liftYVel = lyv
    val (lm, lmv) = stepLift(liftPos, liftVel, liftTarget, dt, MATERIAL_STIFFNESS, MATERIAL_DAMPING)
    liftPos = lm; liftVel = lmv
    val liftSettled = !lifted && liftXPos == 0.0 && liftYPos == 0.0 && liftPos == 0.0

    if (travelActive && travelSettled && liftSettled && !isDragging) {
      travelActive = false
    }

    val frac = if (isDragging) dragFollow else travelPos
    if (stepDp > 0f) {
      if (!squashModel.tracking) squashModel.start()
      squash = squashModel.track(frac * stepDp, now, dt)
      if (travelSignEased == 0.0) {
        travelSignEased = travelSign
      } else if (travelSignEased != travelSign) {
        travelSignEased += (travelSign - travelSignEased) * (1.0 - exp(-dt / SIGN_TAU))
        if (abs(travelSign - travelSignEased) < 0.01) travelSignEased = travelSign
      }
      val key = travelSignEased
      if (key != 0.0) {
        squash = squash * (1.0 - abs(key)) - key * abs(squash)
      }
    }

    val handoverTarget = if (lifted) 0.0 else 1.0
    val tau = if (handoverTarget > handover) HANDOVER_TAU else GLASS_RETURN_TAU
    handover += (handoverTarget - handover) * (1.0 - exp(-dt / tau))
    if (abs(handoverTarget - handover) < 0.002) handover = handoverTarget

    val settled = !travelActive && !isDragging && liftSettled && abs(squash) < 0.0005 && handover >= 1.0
    if (settled) {
      squashModel.stop()
      squash = 0.0
      travelSign = 0.0
      travelSignEased = 0.0
    }
    publish()
    isFlat = settled
    return !settled
  }

  private fun publish() {
    position = (if (isDragging) dragFollow else travelPos).toFloat()
    liftX = liftXPos.toFloat()
    liftY = liftYPos.toFloat()
    material = liftPos.coerceIn(0.0, 1.0).toFloat()
    deviation = squash.toFloat()
    glassPresence = (1.0 - handover).coerceIn(0.0, 1.0).toFloat()
  }

  private fun travelProgress(): Double {
    val span = abs(travelTarget - travelFrom)
    if (span < 1e-6) return 1.0
    return (1.0 - abs(travelTarget - travelPos) / span).coerceIn(0.0, 1.0)
  }

  private class SquashModel {
    private val history = ArrayDeque<Pair<Double, Double>>()
    var tracking = false
      private set
    private var value = 0.0

    fun start() {
      history.clear()
      value = 0.0
      tracking = true
    }

    fun stop() {
      tracking = false
      history.clear()
      value = 0.0
    }

    fun track(x: Double, now: Double, dt: Double): Double {
      if (!tracking) return value
      history.addLast(x to now)
      val cutoff = now - SAMPLE_WINDOW
      while (history.isNotEmpty() && history.first().second < cutoff) {
        history.removeFirst()
      }
      val raw = (averageAcceleration() * SENSITIVITY).coerceIn(-MAX_DEFORMATION, MAX_DEFORMATION)
      val ease = (dt / RESPONSE_TIME).coerceIn(0.0, 1.0)
      value += (raw - value) * ease
      return value
    }

    private fun averageAcceleration(): Double {
      if (history.size < 3) return 0.0
      val samples = history.toList()
      val vel = DoubleArray(samples.size)
      val velTime = DoubleArray(samples.size)
      var n = 0
      for (i in 1 until samples.size) {
        val dt = samples[i].second - samples[i - 1].second
        if (dt <= 0.0) continue
        vel[n] = (samples[i].first - samples[i - 1].first) / dt
        velTime[n] = (samples[i].second + samples[i - 1].second) * 0.5
        n++
      }
      if (n < 2) return 0.0
      var total = 0.0
      var count = 0
      for (i in 1 until n) {
        val dt = velTime[i] - velTime[i - 1]
        if (dt <= 0.0) continue
        total += (vel[i] - vel[i - 1]) / dt
        count++
      }
      return if (count == 0) 0.0 else total / count
    }

    private companion object {
      const val SAMPLE_WINDOW = 0.3
      const val SENSITIVITY = 0.00007
      const val MAX_DEFORMATION = 0.12
      const val RESPONSE_TIME = 0.18
    }
  }

  companion object {
    private const val TRAVEL_STIFFNESS = 280.0
    private const val TRAVEL_DAMPING = 31.4
    private const val LIFT_STIFFNESS = 250.0
    private const val LIFT_DAMPING_X = 19.0
    private const val LIFT_DAMPING_Y = 22.1
    private const val MATERIAL_STIFFNESS = 1000.0
    private const val MATERIAL_DAMPING = 63.3
    private const val HANDOVER_START = 0.92
    private const val HANDOVER_TAU = 0.09
    private const val GLASS_RETURN_TAU = 0.05
    private const val FOLLOW_TAU = 0.05
    private const val SIGN_TAU = 0.25
    private const val MAX_FRAME_SECONDS = 0.1

    private fun signOfTravel(span: Double): Double = if (abs(span) < 1e-6) 0.0 else sign(span)

    /** Semi-implicit Euler in 1/240s substeps so long frames never blow up the spring. */
    fun springStep(
      x0: Double,
      v0: Double,
      target: Double,
      dt: Double,
      stiffness: Double,
      damping: Double,
    ): Pair<Double, Double> {
      var x = x0
      var vel = v0
      var remaining = dt
      while (remaining > 0.0) {
        val step = min(remaining, 1.0 / 240.0)
        val accel = -stiffness * (x - target) - damping * vel
        vel += accel * step
        x += vel * step
        remaining -= step
      }
      return x to vel
    }

    private fun stepLift(
      x: Double,
      vel: Double,
      target: Double,
      dt: Double,
      stiffness: Double,
      damping: Double,
    ): Pair<Double, Double> {
      val (nx, nv) = springStep(x, vel, target, dt, stiffness, damping)
      return if (abs(nx - target) < 0.0008 && abs(nv) < 0.01) target to 0.0 else nx to nv
    }

    /** Rim fades cleanly by 55% through the glass-to-flat handoff. */
    fun rimAlpha(presence: Float): Float = ((presence - 0.45f) / 0.55f).coerceIn(0f, 1f)
  }
}
