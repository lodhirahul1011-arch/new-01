package com.dvaari.dvari.deliverynotifications

import android.content.Context
import android.util.Log

object CapturedNotificationStore {
  private const val TAG = "CapturedNotifStore"
  private const val PREFS = "dvaari_captured_notifications"

  fun clearLegacy(context: Context) {
    try {
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .clear()
        .apply()
      Log.i(TAG, "logs.info legacy captured notification text store cleared")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error legacy captured notification text store clear failed", error)
    }
  }
}
