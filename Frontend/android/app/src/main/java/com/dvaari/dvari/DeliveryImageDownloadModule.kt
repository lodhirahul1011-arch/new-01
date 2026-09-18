package com.dvaari.dvari

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class DeliveryImageDownloadModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DeliveryImageDownload"

  @ReactMethod
  fun download(url: String, fileName: String, promise: Promise) {
    try {
      val cleanUrl = url.trim()
      if (cleanUrl.isEmpty()) {
        promise.reject("INVALID_URL", "Image URL is empty")
        return
      }

      val resolvedName = fileName
        .trim()
        .ifEmpty { "delivery-image-${System.currentTimeMillis()}.jpg" }
        .replace(Regex("[^A-Za-z0-9._-]+"), "-")
        .let { name ->
          if (name.contains(".")) name else "$name.jpg"
        }
      val mimeType = MimeTypeMap.getSingleton()
        .getMimeTypeFromExtension(resolvedName.substringAfterLast('.', "jpg").lowercase())
        ?: "image/jpeg"

      val request = DownloadManager.Request(Uri.parse(cleanUrl))
        .setTitle(resolvedName)
        .setDescription("Saving delivery image")
        .setMimeType(mimeType)
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Dvaari/$resolvedName")
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true)

      val manager = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val downloadId = manager.enqueue(request)
      promise.resolve(downloadId.toDouble())
    } catch (error: Exception) {
      promise.reject("DOWNLOAD_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openReport(url: String, fileName: String, mimeType: String, headers: ReadableMap?, promise: Promise) {
    try {
      val file = downloadToCache(url, fileName, mimeType, headers)
      val uri = uriForFile(file)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType.ifBlank { "application/octet-stream" })
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(Intent.createChooser(intent, "Open report").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(file.absolutePath)
    } catch (error: ActivityNotFoundException) {
      promise.reject("NO_VIEWER", "No app is available to open this report", error)
    } catch (error: Exception) {
      promise.reject("OPEN_REPORT_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun shareReports(files: ReadableArray, headers: ReadableMap?, promise: Promise) {
    try {
      val uris = ArrayList<Uri>()
      val mimeTypes = ArrayList<String>()
      for (index in 0 until files.size()) {
        val item = files.getMap(index) ?: continue
        val url = item.getString("url") ?: ""
        val fileName = item.getString("fileName") ?: "dvaari-report-$index"
        val mimeType = item.getString("mimeType") ?: "application/octet-stream"
        val file = downloadToCache(url, fileName, mimeType, headers)
        uris.add(uriForFile(file))
        mimeTypes.add(mimeType)
      }

      if (uris.isEmpty()) {
        promise.reject("NO_FILES", "No report files were available to share")
        return
      }

      val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        type = "application/*"
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
        clipData = buildClipData(uris)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        setPackage("com.whatsapp")
      }

      try {
        grantReadPermissions(intent, uris)
        reactContext.startActivity(intent)
      } catch (_: ActivityNotFoundException) {
        intent.setPackage(null)
        grantReadPermissions(intent, uris)
        reactContext.startActivity(Intent.createChooser(intent, "Share report").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SHARE_REPORTS_FAILED", error.message, error)
    }
  }

  private fun downloadToCache(url: String, fileName: String, mimeType: String, headers: ReadableMap?): File {
    val cleanUrl = url.trim()
    require(cleanUrl.isNotEmpty()) { "Report URL is empty" }

    val safeName = sanitizeReportFileName(fileName, mimeType)
    val reportsDir = File(reactContext.cacheDir, "reports").apply {
      if (!exists()) mkdirs()
    }
    val outputFile = File(reportsDir, safeName)

    val connection = (URL(cleanUrl).openConnection() as HttpURLConnection).apply {
      requestMethod = "GET"
      connectTimeout = 20000
      readTimeout = 30000
      headers?.let { headerMap ->
        val iterator = headerMap.keySetIterator()
        while (iterator.hasNextKey()) {
          val key = iterator.nextKey()
          val value = headerMap.getString(key)
          if (!value.isNullOrBlank()) {
            setRequestProperty(key, value)
          }
        }
      }
    }

    try {
      val statusCode = connection.responseCode
      if (statusCode !in 200..299) {
        throw IllegalStateException("Report download failed with status $statusCode")
      }

      connection.inputStream.use { input ->
        FileOutputStream(outputFile).use { output ->
          input.copyTo(output)
        }
      }
    } finally {
      connection.disconnect()
    }

    return outputFile
  }

  private fun sanitizeReportFileName(fileName: String, mimeType: String): String {
    val fallbackExt = when (mimeType) {
      "application/pdf" -> "pdf"
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> "xlsx"
      else -> "bin"
    }
    val cleaned = fileName
      .trim()
      .ifEmpty { "dvaari-report-${System.currentTimeMillis()}.$fallbackExt" }
      .replace(Regex("[^A-Za-z0-9._-]+"), "-")
    return if (cleaned.contains(".")) cleaned else "$cleaned.$fallbackExt"
  }

  private fun uriForFile(file: File): Uri {
    return FileProvider.getUriForFile(
      reactContext,
      "${reactContext.packageName}.fileprovider",
      file,
    )
  }

  private fun buildClipData(uris: ArrayList<Uri>): ClipData? {
    if (uris.isEmpty()) return null
    val clipData = ClipData.newUri(reactContext.contentResolver, "Dvaari report", uris[0])
    for (index in 1 until uris.size) {
      clipData.addItem(ClipData.Item(uris[index]))
    }
    return clipData
  }

  private fun grantReadPermissions(intent: Intent, uris: ArrayList<Uri>) {
    val activities = reactContext.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
    activities.forEach { resolveInfo ->
      uris.forEach { uri ->
        reactContext.grantUriPermission(
          resolveInfo.activityInfo.packageName,
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      }
    }
  }
}
