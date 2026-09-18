package com.dvaari.dvari.deliverynotifications

import android.content.Context
import android.provider.Settings
import android.text.TextUtils
import android.util.Log

object DeliveryNotificationPrefs {
  private const val TAG = "DeliveryNotifPrefs"
  private const val PREFS = "dvaari_delivery_notifications"
  private const val KEY_FEATURE_ENABLED = "featureEnabled"
  private const val KEY_KEYWORDS = "keywords"
  private const val KEY_REMINDER_LEAD_MINUTES = "reminderLeadMinutes"
  private const val KEY_PROCESSED_HASHES = "processedHashes"
  private const val MAX_PROCESSED_HASHES = 250

  val monitoredSourceDescriptions = listOf(
    "Known Android SMS apps only",
    "Google Messages",
    "Samsung Messages",
    "OEM SMS apps",
  )

  val defaultSmsPackages = setOf(
    "com.google.android.apps.messaging",
    "com.samsung.android.messaging",
    "com.android.mms",
    "com.android.messaging",
    "com.miui.mms",
    "com.oneplus.mms",
    "com.coloros.mms",
    "com.vivo.messaging",
    "com.htc.sense.mms",
    "com.sonyericsson.conversations",
  )

  val defaultKeywords = listOf(
    "delivery",
    "arriving",
    "arriving today",
    "out for delivery",
    "scheduled",
    "shipment",
    "courier",
    "package",
    "order",
    "ready to deliver",
    "collect the order",
    "confirm your availability",
  )

  fun isFeatureEnabled(context: Context): Boolean {
    val enabled = prefs(context).getBoolean(KEY_FEATURE_ENABLED, false)
    Log.i(TAG, "logs.info delivery notification feature read enabled=$enabled")
    return enabled
  }

  fun setFeatureEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_FEATURE_ENABLED, enabled).apply()
    CapturedNotificationStore.clearLegacy(context)
    Log.i(TAG, "logs.info delivery notification feature enabled=$enabled")
  }

  fun getKeywords(context: Context): List<String> {
    val stored = prefs(context).getString(KEY_KEYWORDS, "").orEmpty()
    val values = stored
      .split("|")
      .map { it.trim().lowercase() }
      .filter { it.isNotBlank() }
      .distinct()
    return values.ifEmpty { defaultKeywords }
  }

  fun setKeywords(context: Context, keywords: List<String>) {
    val safeKeywords = keywords
      .map { it.trim().lowercase() }
      .filter { it.length in 2..40 }
      .distinct()
      .take(30)
    prefs(context).edit().putString(KEY_KEYWORDS, safeKeywords.joinToString("|")).apply()
    Log.i(TAG, "logs.info delivery notification keywords saved count=${safeKeywords.size}")
  }

  fun getReminderLeadMinutes(context: Context): Int {
    return prefs(context).getInt(KEY_REMINDER_LEAD_MINUTES, 60).coerceIn(5, 1440)
  }

  fun setReminderLeadMinutes(context: Context, minutes: Int) {
    val safeMinutes = minutes.coerceIn(5, 1440)
    prefs(context).edit().putInt(KEY_REMINDER_LEAD_MINUTES, safeMinutes).apply()
    Log.i(TAG, "logs.info delivery reminder lead minutes saved=$safeMinutes")
  }

  fun shouldCaptureSourcePackage(context: Context, packageName: String): Boolean {
    if (!isFeatureEnabled(context)) {
      Log.i(TAG, "logs.info notification source skipped because delivery notification feature is disabled")
      return false
    }

    val normalizedPackage = packageName.trim()
    if (normalizedPackage.isBlank()) {
      Log.e(TAG, "logs.error captured notification source package missing")
      return false
    }

    if (!isSmsPackageAllowed(normalizedPackage)) {
      Log.i(TAG, "logs.info notification source skipped because package is not an allowlisted SMS app package=$normalizedPackage")
      return false
    }

    Log.i(TAG, "logs.info notification source accepted for delivery parsing package=$normalizedPackage")
    return true
  }

  fun isSmsPackageAllowed(packageName: String): Boolean {
    return defaultSmsPackages.contains(packageName.trim())
  }

  fun isNotificationAccessEnabled(context: Context): Boolean {
    return try {
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners",
      )
      val packageName = context.packageName
      if (enabled.isNullOrBlank()) {
        false
      } else {
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabled)
        splitter.any { component -> component.contains(packageName, ignoreCase = true) }
      }
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error failed to read notification listener access", error)
      false
    }
  }

  fun hasProcessedHash(context: Context, hashedNotificationId: String): Boolean {
    return readProcessedHashes(context).contains(hashedNotificationId)
  }

  fun rememberProcessedHash(context: Context, hashedNotificationId: String) {
    val hashes = readProcessedHashes(context).toMutableList()
    hashes.remove(hashedNotificationId)
    hashes.add(hashedNotificationId)
    val trimmed = hashes.takeLast(MAX_PROCESSED_HASHES)
    prefs(context).edit().putString(KEY_PROCESSED_HASHES, trimmed.joinToString("|")).apply()
    Log.i(TAG, "logs.info delivery notification hash remembered count=${trimmed.size}")
  }

  fun clearProcessedHashes(context: Context) {
    prefs(context).edit().remove(KEY_PROCESSED_HASHES).apply()
    Log.i(TAG, "logs.info delivery notification processed hashes cleared")
  }

  private fun readProcessedHashes(context: Context): List<String> {
    return prefs(context)
      .getString(KEY_PROCESSED_HASHES, "")
      .orEmpty()
      .split("|")
      .map { it.trim() }
      .filter { it.isNotBlank() }
  }

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
