package expo.modules.t3liquidglass

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class T3GlassUpdaterSecurityTest {
  @Test
  fun allowsOnlyTrustedHttpsGithubReleaseHosts() {
    assertTrue(
      T3GlassUpdaterSecurity.isAllowedDownloadUrl(
        "https://github.com/abotmaker/t3-frosted-glass/releases/download/v2.3.0/app.apk",
      ),
    )
    assertTrue(
      T3GlassUpdaterSecurity.isAllowedDownloadUrl(
        "https://objects.githubusercontent.com/github-production-release-asset/foo.apk",
      ),
    )
    assertTrue(
      T3GlassUpdaterSecurity.isAllowedDownloadUrl(
        "https://release-assets.githubusercontent.com/github-production-release-asset/foo.apk",
      ),
    )
    assertFalse(T3GlassUpdaterSecurity.isAllowedDownloadUrl("http://github.com/a/b/app.apk"))
    assertFalse(T3GlassUpdaterSecurity.isAllowedDownloadUrl("https://evil.example.com/app.apk"))
    assertFalse(T3GlassUpdaterSecurity.isAllowedDownloadUrl("https://github.com.evil.com/app.apk"))
  }

  @Test
  fun sanitizesApkFileNamesAgainstTraversal() {
    assertEquals(
      "T3Code-Glass-latest.apk",
      T3GlassUpdaterSecurity.sanitizeApkFileName("../../T3Code-Glass-latest.apk"),
    )
    assertEquals(
      "release_build.apk",
      T3GlassUpdaterSecurity.sanitizeApkFileName("release build"),
    )
  }

  @Test
  fun normalizesSha256Checksums() {
    val valid = "A".repeat(64)
    assertEquals("a".repeat(64), T3GlassUpdaterSecurity.normalizeSha256("sha256:$valid"))
    assertNull(T3GlassUpdaterSecurity.normalizeSha256("not-a-hash"))
    assertNull(T3GlassUpdaterSecurity.normalizeSha256("a".repeat(63)))
  }
}
