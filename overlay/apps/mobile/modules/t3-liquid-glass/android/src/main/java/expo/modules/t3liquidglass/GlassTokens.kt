package expo.modules.t3liquidglass

import android.graphics.Color
import kotlin.math.roundToInt

internal enum class GlassFrost {
  NONE,
  LIGHT,
  STRONG,
}

internal enum class GlassLook(
  val tintScale: Float,
  val frost: GlassFrost,
  val rimScale: Float,
  val backdropAlpha: Float,
  val samplesContent: Boolean = false,
  val blurRadiusDp: Float = GlassTokens.BLUR_RADIUS_DP,
) {
  CARD(1.0f, GlassFrost.NONE, 1.0f, 1.0f),
  TRACK(1.0f, GlassFrost.NONE, 1.0f, 0.90f),
  DOCK(0.76f, GlassFrost.LIGHT, 1.12f, 0.88f, samplesContent = true, blurRadiusDp = 9f),
  COMPOSER(0.82f, GlassFrost.LIGHT, 1.1f, 0.90f, samplesContent = true, blurRadiusDp = 10f),
  HEADER(0.76f, GlassFrost.LIGHT, 1.12f, 0.88f, samplesContent = true, blurRadiusDp = 10f),
  MENU(0.84f, GlassFrost.LIGHT, 1.18f, 1.0f, samplesContent = true, blurRadiusDp = 11f),
  SHEET(0.76f, GlassFrost.NONE, 1.0f, 0.94f),
  PRIMARY(1.0f, GlassFrost.STRONG, 1.08f, 0.90f, samplesContent = true, blurRadiusDp = 9f),
  TONAL(0.80f, GlassFrost.LIGHT, 1.0f, 0.92f),
  CLEAR(0.0f, GlassFrost.NONE, 1.15f, 0.85f),
  BUBBLE(1.0f, GlassFrost.LIGHT, 0.85f, 0.94f),
  INPUT(0.90f, GlassFrost.NONE, 0.95f, 0.90f);

  companion object {
    fun fromWire(value: String?): GlassLook = when (value?.lowercase()) {
      "card" -> CARD
      "track" -> TRACK
      "dock" -> DOCK
      "composer" -> COMPOSER
      "header" -> HEADER
      "menu" -> MENU
      "sheet" -> SHEET
      "primary" -> PRIMARY
      "tonal" -> TONAL
      "clear" -> CLEAR
      "bubble" -> BUBBLE
      "input" -> INPUT
      else -> CARD
    }
  }
}

internal data class GlassPalette(
  val tintColor: Int,
  val glossColor: Int,
  val glossClear: Int,
  val rimColors: IntArray,
  val outerHairlineColor: Int,
  val frostLight: Int,
  val frostStrong: Int,
  val pressColor: Int,
  val sliderActive: Int,
  val sliderInactive: Int,
  val backdropStart: Int,
  val backdropCenter: Int,
  val backdropEnd: Int,
  val backdropLight: Int,
  val backdropLightMid: Int,
  val backdropLightClear: Int,
  val backdropSteel: Int,
  val backdropSteelMid: Int,
  val backdropSteelClear: Int,
  val backdropVignette: Int,
  val backdropVignetteClear: Int,
)

/**
 * Exact liquid glass dimensions & colour tokens adapted from Jarvoice/BitChord,
 * with a calibrated light-mode counterpart.
 */
internal object GlassTokens {
  const val BLUR_RADIUS_DP = 8f
  const val REFRACTION_HEIGHT_DP = 24f
  const val REFRACTION_AMOUNT_DP = 24f
  const val RIM_WIDTH_DP = 0.65f
  const val SEGMENT_INSET_DP = 2f
  const val SEGMENT_LIFT_DP = 8f
  const val SEGMENT_LENS_HEIGHT_DP = 12f
  const val SEGMENT_LENS_AMOUNT_DP = 14f
  const val SLIDER_TRACK_IDLE_DP = 10f
  const val SLIDER_TRACK_ACTIVE_DP = 16f
  const val SATURATION = 1.6f
  const val DEPTH_EFFECT = 1.0f
  const val CHROMATIC_ABERRATION = 1.0f
  const val DEFAULT_CARD_OPACITY_DARK = 0.36f
  const val DEFAULT_CARD_OPACITY_LIGHT = 0.60f
  const val DEFAULT_FLOATING_OPACITY_LIGHT = 0.34f
  const val LIGHT_CANVAS = 0xFFF2F4F7.toInt()

  val DARK = GlassPalette(
    tintColor = 0xFF1A1C20.toInt(),
    glossColor = 0x1AFFFFFF,
    glossClear = 0x00FFFFFF,
    rimColors = intArrayOf(
      0xA8FFFFFF.toInt(),
      0x26FFFFFF,
      0x2CFFFFFF,
      0x86FFFFFF.toInt(),
    ),
    outerHairlineColor = 0x1CFFFFFF,
    frostLight = 0x0BFFFFFF,
    frostStrong = 0x1DFFFFFF,
    pressColor = 0x1FFFFFFF,
    sliderActive = 0xEBFFFFFF.toInt(),
    sliderInactive = 0x42FFFFFF,
    backdropStart = 0xFF2A2E34.toInt(),
    backdropCenter = 0xFF0D0F11.toInt(),
    backdropEnd = 0xFF1E2227.toInt(),
    backdropLight = 0x47FFFFFF,
    backdropLightMid = 0x1FFFFFFF,
    backdropLightClear = 0x00FFFFFF,
    backdropSteel = 0x5C8FA0B2,
    backdropSteelMid = 0x248FA0B2,
    backdropSteelClear = 0x008FA0B2,
    backdropVignette = 0xCC000000.toInt(),
    backdropVignetteClear = 0x00000000,
  )

  val LIGHT = GlassPalette(
    tintColor = 0xFFFFFFFF.toInt(),
    glossColor = 0x2EFFFFFF,
    glossClear = 0x00FFFFFF,
    rimColors = intArrayOf(
      0x4C0F172A,
      0x160F172A,
      0x1C0F172A,
      0x3C0F172A,
    ),
    outerHairlineColor = 0x2A0F172A,
    frostLight = 0x0EFFFFFF,
    frostStrong = 0x1EFFFFFF,
    pressColor = 0x140F172A,
    sliderActive = 0xEB181B20.toInt(),
    sliderInactive = 0x260F172A,
    backdropStart = 0xFFF2F4F7.toInt(),
    backdropCenter = 0xFFF2F4F7.toInt(),
    backdropEnd = 0xFFF2F4F7.toInt(),
    backdropLight = 0x00FFFFFF,
    backdropLightMid = 0x00FFFFFF,
    backdropLightClear = 0x00FFFFFF,
    backdropSteel = 0x00000000,
    backdropSteelMid = 0x00000000,
    backdropSteelClear = 0x00000000,
    backdropVignette = 0x00000000,
    backdropVignetteClear = 0x00000000,
  )

  fun palette(dark: Boolean): GlassPalette = if (dark) DARK else LIGHT

  fun withOpacity(color: Int, opacity: Float): Int {
    val clamped = opacity.coerceIn(0f, 1f)
    return Color.argb(
      (clamped * 255f).roundToInt(),
      Color.red(color),
      Color.green(color),
      Color.blue(color),
    )
  }

  fun blendColors(base: Int, overlay: Int, amount: Float): Int {
    val t = amount.coerceIn(0f, 1f)
    val a = (Color.alpha(base) * (1f - t) + Color.alpha(overlay) * t).roundToInt()
    val r = (Color.red(base) * (1f - t) + Color.red(overlay) * t).roundToInt()
    val g = (Color.green(base) * (1f - t) + Color.green(overlay) * t).roundToInt()
    val b = (Color.blue(base) * (1f - t) + Color.blue(overlay) * t).roundToInt()
    return Color.argb(a, r, g, b)
  }
}
