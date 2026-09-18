package com.dvaari.dvari.deliverynotifications

import android.service.notification.StatusBarNotification
import android.util.Log
import java.security.MessageDigest

object DeliveryNotificationHash {
  private const val TAG = "DeliveryNotifHash"

  fun fromStatusBarNotification(sbn: StatusBarNotification): String {
    val stableSource = listOf(
      sbn.packageName,
      sbn.key,
      sbn.id.toString(),
      sbn.tag.orEmpty(),
      sbn.postTime.toString(),
    ).joinToString("|")
    val hash = sha256(stableSource)
    Log.i(TAG, "logs.info delivery notification hash created")
    return hash
  }

  fun sha256(value: String): String {
    return try {
      MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error failed to hash delivery notification", error)
      ""
    }
  }
}
