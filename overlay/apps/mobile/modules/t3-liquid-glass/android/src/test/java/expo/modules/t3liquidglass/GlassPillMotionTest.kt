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
}
