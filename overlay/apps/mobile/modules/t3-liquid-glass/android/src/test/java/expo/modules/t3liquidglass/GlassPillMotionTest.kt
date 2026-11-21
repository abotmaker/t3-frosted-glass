package expo.modules.t3liquidglass

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlassPillMotionTest {
  @Test
  fun tapAnimatesLiftedAndSettlesFlat() {
    val motion = GlassPillMotion({}, initialIndex = 0)
    motion.setStepDp(72f)
    assertTrue(motion.isFlat)
    assertEquals(0f, motion.position, 1e-4f)

    // Drive ticks directly (unit test has no Android Looper/Choreographer).
    motion.setReduceMotion(true)
    motion.animateTo(2)
    assertTrue(motion.isFlat)
    assertEquals(2f, motion.position, 1e-4f)
    assertEquals(2, motion.index)
  }

  @Test
  fun springStepConvergesWithoutExploding() {
    var x = 0.0
    var v = 0.0
    repeat(120) {
      val (nx, nv) = GlassPillMotion.springStep(x, v, 1.0, 1.0 / 60.0, 280.0, 31.4)
      x = nx
      v = nv
    }
    assertEquals(1.0, x, 1e-3)
    assertEquals(0.0, v, 1e-2)
  }

  @Test
  fun rimAlphaFadesByHandoverThreshold() {
    assertEquals(0f, GlassPillMotion.rimAlpha(0.45f), 1e-4f)
    assertEquals(1f, GlassPillMotion.rimAlpha(1.0f), 1e-4f)
    assertTrue(GlassPillMotion.rimAlpha(0.75f) in 0.5f..0.6f)
  }

  @Test
  fun lookWireParsingCoversAllVariants() {
    assertEquals(GlassLook.DOCK, GlassLook.fromWire("dock"))
    assertEquals(GlassLook.COMPOSER, GlassLook.fromWire("COMPOSER"))
    assertEquals(GlassLook.PRIMARY, GlassLook.fromWire("primary"))
    assertEquals(GlassLook.CARD, GlassLook.fromWire("unknown"))
    assertFalse(GlassTokens.DARK.tintColor == GlassTokens.LIGHT.tintColor)
  }

  @Test
  fun squashRingBufferHandlesWrapAroundAndAcceleration() {
    val squash = GlassPillMotion.SquashModel()
    squash.start()
    var now = 0.0
    val dt = 1.0 / 120.0
    var peak = 0.0
    // Accelerate quadratically across 140 frames (> 96 ring buffer capacity).
    for (i in 0 until 140) {
      now += dt
      val x = 0.5 * 8000.0 * now * now
      val v = squash.track(x, now, dt)
      if (kotlin.math.abs(v) > peak) peak = kotlin.math.abs(v)
    }
    assertTrue("Expected positive squash under acceleration, got $peak", peak > 0.01)
    assertTrue("Expected squash clamped to <= 0.12, got $peak", peak <= 0.120001)

    // Hold constant position for 2 seconds -> squash decays back toward 0.
    val holdX = 0.5 * 8000.0 * now * now
    var settled = peak
    for (i in 0 until 240) {
      now += dt
      settled = squash.track(holdX, now, dt)
    }
    assertEquals(0.0, settled, 1e-3)
  }

  @Test
  fun refractionShaderDefinesRequiredUniforms() {
    val src = GlassShaders.REFRACTION
    assertTrue(src.contains("uniform shader content;"))
    assertTrue(src.contains("uniform float2 size;"))
    assertTrue(src.contains("uniform float4 cornerRadii;"))
    assertTrue(src.contains("uniform float chromaticAberration;"))
  }
}
