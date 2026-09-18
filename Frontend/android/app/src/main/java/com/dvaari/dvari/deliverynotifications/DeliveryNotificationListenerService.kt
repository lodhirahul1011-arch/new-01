package com.dvaari.dvari.deliverynotifications

import android.app.Notification
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class DeliveryNotificationListenerService : NotificationListenerService() {
  override fun onListenerConnected() {
    super.onListenerConnected()
    CapturedNotificationStore.clearLegacy(applicationContext)
    Log.i(TAG, "logs.info delivery notification listener connected")
    captureActiveNotificationsSnapshot()
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    Log.e(TAG, "logs.error delivery notification listener disconnected")
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    captureNotification(sbn, "posted")
  }

  private fun captureActiveNotificationsSnapshot() {
    try {
      val notifications = activeNotifications.orEmpty()
      Log.i(TAG, "logs.info active notification snapshot count=${notifications.size}")
      notifications.forEach { captureNotification(it, "active_snapshot") }
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error active notification snapshot failed", error)
    }
  }

  private fun captureNotification(sbn: StatusBarNotification?, reason: String) {
    val notification = sbn ?: return
    val context = applicationContext

    if (!DeliveryNotificationPrefs.shouldCaptureSourcePackage(context, notification.packageName)) {
      return
    }

    val isGroupSummary = notification.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0
    if (isGroupSummary) {
      Log.i(TAG, "logs.info grouped SMS notification summary skipped before delivery parsing")
      return
    }

    val hashedNotificationId = DeliveryNotificationHash.fromStatusBarNotification(notification)
    if (hashedNotificationId.isBlank()) {
      Log.e(TAG, "logs.error delivery notification hash unavailable")
      return
    }

    val title = extractNotificationTitle(notification.notification)
    val body = extractNotificationBody(notification.notification)
    val safeTitle = limitText(DeliveryNotificationParser.clean(title), 240)
    val safeBody = limitText(body, 2000)

    Log.i(
      TAG,
      "logs.info allowlisted SMS notification inspected in memory package=${notification.packageName} reason=$reason hasTitle=${title.isNotBlank()} hasBody=${body.isNotBlank()}",
    )

    maybePostDeliveryNotification(
      context = context,
      hashedNotificationId = hashedNotificationId,
      sourcePackage = notification.packageName,
      postedAtMillis = notification.postTime,
      title = safeTitle,
      body = safeBody,
    )
  }

  private fun maybePostDeliveryNotification(
    context: Context,
    hashedNotificationId: String,
    sourcePackage: String,
    postedAtMillis: Long,
    title: String,
    body: String,
  ) {
    if (DeliveryNotificationPrefs.hasProcessedHash(context, hashedNotificationId)) {
      Log.i(TAG, "logs.info delivery notification backend post skipped for processed hash")
      return
    }

    val parsed = DeliveryNotificationParser.parse(
      title = title,
      body = body,
      postedAtMillis = postedAtMillis,
      keywords = DeliveryNotificationPrefs.getKeywords(context),
    )
    if (parsed == null) {
      Log.i(TAG, "logs.info notification skipped for backend because it is not delivery-like")
      return
    }

    Thread {
      try {
        val response = DeliveryNotificationApiClient(context).postNotification(
          hashedNotificationId = hashedNotificationId,
          sourcePackage = sourcePackage,
          postedAtMillis = postedAtMillis,
          parsed = parsed,
        )
        DeliveryNotificationPrefs.rememberProcessedHash(context, hashedNotificationId)
        scheduleReminderIfReady(response = response, parsed = parsed)
        Log.i(TAG, "logs.info delivery notification posted to backend and marked processed")
      } catch (error: Throwable) {
        Log.e(TAG, "logs.error delivery notification backend post failed; will retry later", error)
      }
    }.start()
  }

  private fun scheduleReminderIfReady(response: org.json.JSONObject, parsed: ParsedDeliveryNotification) {
    if (parsed.needsConfirmation || parsed.deliveryDateIso.isBlank()) {
      Log.i(TAG, "logs.info delivery notification requires confirmation before local reminder")
      return
    }

    val data = response.optJSONObject("data") ?: org.json.JSONObject()
    val scheduleId = data.optString("scheduleId", "").trim()
    if (scheduleId.isBlank()) {
      Log.e(TAG, "logs.error delivery reminder skipped missing backend schedule id")
      return
    }

    val title = listOf(parsed.productTitle, parsed.merchantName, parsed.courierName)
      .firstOrNull { it.isNotBlank() }
      ?.let { "$it delivery" }
      ?: "Upcoming delivery"

    DeliveryReminderScheduler.schedule(
      context = applicationContext,
      scheduleId = scheduleId,
      title = title,
      scheduledForIso = parsed.deliveryDateIso,
      leadMinutes = DeliveryNotificationPrefs.getReminderLeadMinutes(applicationContext),
    )
  }

  private fun firstCleanValue(vararg values: String?): String {
    values.forEach { value ->
      val cleanValue = DeliveryNotificationParser.clean(value.orEmpty())
      if (cleanValue.isNotBlank()) return cleanValue
    }
    return ""
  }

  private fun extractNotificationTitle(notification: Notification): String {
    val extras = notification.extras ?: return ""
    return firstCleanValue(
      extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
      extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString(),
      extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString(),
      extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
      notification.tickerText?.toString(),
    )
  }

  private fun extractNotificationBody(notification: Notification): String {
    val extras = notification.extras
    if (extras == null) {
      Log.e(TAG, "logs.error delivery notification extras missing")
      return ""
    }

    val candidates = mutableListOf<String>()
    candidates.add(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty())
    candidates.add(extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty())
    candidates.add(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty())
    candidates.add(extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString().orEmpty())
    candidates.add(extras.getCharSequence(Notification.EXTRA_INFO_TEXT)?.toString().orEmpty())
    candidates.add(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString().orEmpty())
    candidates.add(notification.tickerText?.toString().orEmpty())
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
      ?.forEach { candidates.add(it?.toString().orEmpty()) }
    getNotificationMessageBundles(extras).forEach { bundle ->
      candidates.add(bundle.getCharSequence("text")?.toString().orEmpty())
      candidates.add(bundle.getCharSequence("sender")?.toString().orEmpty())
    }
    collectTextValuesFromBundle(extras, candidates)

    val body = candidates
      .map { DeliveryNotificationParser.clean(it) }
      .filter { it.isNotBlank() }
      .distinct()
      .joinToString(" ")

    if (body.isBlank()) {
      Log.e(TAG, "logs.error delivery notification body hidden or empty")
    } else {
      Log.i(TAG, "logs.info delivery notification body extracted")
    }
    return body
  }

  @Suppress("DEPRECATION")
  private fun collectTextValuesFromBundle(bundle: Bundle, candidates: MutableList<String>, depth: Int = 0) {
    if (depth > 2) return

    try {
      bundle.keySet().forEach { key ->
        when (val value = bundle.get(key)) {
          is CharSequence -> candidates.add(value.toString())
          is String -> candidates.add(value)
          is Bundle -> collectTextValuesFromBundle(value, candidates, depth + 1)
          is Array<*> -> value.forEach { appendTextLikeValue(it, candidates, depth + 1) }
          is Iterable<*> -> value.forEach { appendTextLikeValue(it, candidates, depth + 1) }
        }
      }
      Log.i(TAG, "logs.info notification extras scanned text candidates=${candidates.size}")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error notification extras text scan failed", error)
    }
  }

  private fun appendTextLikeValue(value: Any?, candidates: MutableList<String>, depth: Int) {
    when (value) {
      null -> return
      is CharSequence -> candidates.add(value.toString())
      is String -> candidates.add(value)
      is Bundle -> collectTextValuesFromBundle(value, candidates, depth + 1)
      is Array<*> -> value.forEach { appendTextLikeValue(it, candidates, depth + 1) }
      is Iterable<*> -> value.forEach { appendTextLikeValue(it, candidates, depth + 1) }
      else -> {
        val className = value.javaClass.name
        if (className == "android.app.Person") {
          runCatching {
            val name = value.javaClass.getMethod("getName").invoke(value)?.toString().orEmpty()
            candidates.add(name)
          }.onFailure {
            Log.e(TAG, "logs.error notification person text read failed", it)
          }
        }
      }
    }
  }

  private fun limitText(value: String, maxLength: Int): String {
    val text = value.trim()
    if (text.length <= maxLength) return text
    Log.i(TAG, "logs.info in-memory notification text trimmed maxLength=$maxLength")
    return text.take(maxLength)
  }

  private fun getNotificationMessageBundles(extras: Bundle): List<Bundle> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      extras.getParcelableArray(Notification.EXTRA_MESSAGES, Bundle::class.java)
        ?.toList()
        .orEmpty()
    } else {
      @Suppress("DEPRECATION")
      extras.getParcelableArray(Notification.EXTRA_MESSAGES)
        ?.mapNotNull { it as? Bundle }
        .orEmpty()
    }
  }

  companion object {
    private const val TAG = "DeliveryNotifListener"
  }
}
