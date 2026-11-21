package expo.modules.t3liquidglass

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest

internal object T3GlassUpdaterSecurity {
  private val ALLOWED_HOSTS = setOf(
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "github-releases.githubusercontent.com",
  )

  private val SHA256_HEX = Regex("^[0-9a-f]{64}$")

  fun isAllowedDownloadUrl(rawUrl: String): Boolean {
    val parsed = try {
      URI(rawUrl.trim())
    } catch (_: Exception) {
      return false
    }
    if (!parsed.scheme.equals("https", ignoreCase = true)) return false
    val host = parsed.host?.lowercase() ?: return false
    return host in ALLOWED_HOSTS
  }

  fun sanitizeApkFileName(rawName: String): String {
    val base = rawName.substringAfterLast('/').substringAfterLast('\\')
    val cleaned = base.replace(Regex("[^A-Za-z0-9._-]"), "_")
      .trimStart('.')
      .ifEmpty { "t3-frosted-glass-update.apk" }
    return if (cleaned.endsWith(".apk", ignoreCase = true)) cleaned else "$cleaned.apk"
  }

  fun normalizeSha256(raw: String?): String? {
    val value = raw?.trim()?.removePrefix("sha256:")?.removePrefix("SHA256:")?.lowercase() ?: return null
    if (value.isEmpty()) return null
    return if (SHA256_HEX.matches(value)) value else null
  }
}

class T3GlassUpdaterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3GlassUpdater")
    Events("onDownloadProgress")

    Function("getInstalledVersionCode") {
      val context = appContext.reactContext ?: return@Function 0
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      PackageInfoCompat.getLongVersionCode(info).toInt()
    }

    Function("canRequestPackageInstalls") {
      val context = appContext.reactContext ?: return@Function false
      canInstallPackages(context)
    }

    Function("openInstallPermissionSettings") {
      val context = appContext.reactContext ?: return@Function false
      openUnknownSourcesSettings(context)
    }

    AsyncFunction("downloadAndInstallApk") { url: String, expectedSha256: String?, fileName: String ->
      val context = appContext.reactContext ?: error("App context is unavailable.")
      require(T3GlassUpdaterSecurity.isAllowedDownloadUrl(url)) {
        "Refused update download from untrusted host."
      }
      val normalizedExpected = if (expectedSha256.isNullOrBlank()) {
        null
      } else {
        T3GlassUpdaterSecurity.normalizeSha256(expectedSha256)
          ?: error("Invalid SHA-256 checksum format.")
      }

      val cacheDir = File(context.cacheDir, UPDATES_DIR).apply { mkdirs() }
      cacheDir.listFiles()?.forEach { existing ->
        if (existing.isFile) existing.delete()
      }

      val safeName = T3GlassUpdaterSecurity.sanitizeApkFileName(fileName)
      val partFile = File(cacheDir, "$safeName.part")
      val finalFile = File(cacheDir, safeName)

      val actualSha256 = downloadFollowingTrustedRedirects(url, partFile)
      if (normalizedExpected != null && !actualSha256.equals(normalizedExpected, ignoreCase = true)) {
        partFile.delete()
        error("Downloaded APK checksum mismatch.")
      }
      if (finalFile.exists()) finalFile.delete()
      if (!partFile.renameTo(finalFile)) {
        partFile.delete()
        error("Failed to finalize downloaded APK.")
      }

      if (!canInstallPackages(context)) {
        openUnknownSourcesSettings(context)
        return@AsyncFunction "permission_required"
      }
      launchPackageInstaller(context, finalFile)
      "installer_launched"
    }

    AsyncFunction("installCachedApk") { fileName: String, expectedSha256: String? ->
      val context = appContext.reactContext ?: error("App context is unavailable.")
      val cacheDir = File(context.cacheDir, UPDATES_DIR)
      val safeName = T3GlassUpdaterSecurity.sanitizeApkFileName(fileName)
      val apkFile = File(cacheDir, safeName)
      require(apkFile.isFile && apkFile.canonicalPath.startsWith(cacheDir.canonicalPath)) {
        "Cached update APK not found."
      }
      val normalizedExpected = if (expectedSha256.isNullOrBlank()) {
        null
      } else {
        T3GlassUpdaterSecurity.normalizeSha256(expectedSha256)
          ?: error("Invalid SHA-256 checksum format.")
      }
      if (normalizedExpected != null) {
        val actual = computeFileSha256(apkFile)
        if (!actual.equals(normalizedExpected, ignoreCase = true)) {
          apkFile.delete()
          error("Cached APK checksum mismatch.")
        }
      }
      if (!canInstallPackages(context)) {
        openUnknownSourcesSettings(context)
        return@AsyncFunction "permission_required"
      }
      launchPackageInstaller(context, apkFile)
      "installer_launched"
    }
  }

  private fun canInstallPackages(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

  private fun openUnknownSourcesSettings(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
      data = Uri.parse("package:${context.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
    return true
  }

  private fun launchPackageInstaller(context: Context, apkFile: File) {
    val contentUri = FileProvider.getUriForFile(
      context,
      "${context.packageName}.glass_updater_provider",
      apkFile,
    )
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(contentUri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }

  private fun downloadFollowingTrustedRedirects(initialUrl: String, destFile: File): String {
    var currentUrl = initialUrl
    var connection: HttpURLConnection? = null
    try {
      for (hop in 0..MAX_REDIRECTS) {
        require(T3GlassUpdaterSecurity.isAllowedDownloadUrl(currentUrl)) {
          "Refused redirect to untrusted host."
        }
        val conn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
          instanceFollowRedirects = false
          connectTimeout = 15_000
          readTimeout = 30_000
          setRequestProperty("Accept", "application/octet-stream")
          setRequestProperty("User-Agent", "T3CodeGlass-Android-Updater")
        }
        val code = conn.responseCode
        if (code in 300..399) {
          val location = conn.getHeaderField("Location")
          conn.disconnect()
          require(!location.isNullOrBlank()) { "Redirect missing Location header." }
          currentUrl = URL(URL(currentUrl), location).toString()
          continue
        }
        require(code in 200..299) { "Update download failed with HTTP $code." }
        connection = conn
        break
      }
      val active = connection ?: error("Too many redirects while downloading update.")
      val totalBytes = active.contentLengthLong
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(16 * 1024)
      var bytesWritten = 0L
      var lastEmitMs = 0L

      active.inputStream.use { input ->
        FileOutputStream(destFile).use { output ->
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            output.write(buffer, 0, read)
            digest.update(buffer, 0, read)
            bytesWritten += read
            val now = System.currentTimeMillis()
            if (now - lastEmitMs >= 120L || (totalBytes > 0L && bytesWritten >= totalBytes)) {
              lastEmitMs = now
              val progress = if (totalBytes > 0L) {
                (bytesWritten.toDouble() / totalBytes.toDouble()).coerceIn(0.0, 1.0)
              } else {
                -1.0
              }
              sendEvent(
                "onDownloadProgress",
                mapOf(
                  "bytesWritten" to bytesWritten.toDouble(),
                  "totalBytes" to totalBytes.toDouble(),
                  "progress" to progress,
                ),
              )
            }
          }
          output.fd.sync()
        }
      }
      return digest.digest().joinToString("") { "%02x".format(it) }
    } finally {
      connection?.disconnect()
    }
  }

  private fun computeFileSha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(16 * 1024)
    FileInputStream(file).use { input ->
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private companion object {
    const val UPDATES_DIR = "glass-updates"
    const val MAX_REDIRECTS = 6
  }
}
