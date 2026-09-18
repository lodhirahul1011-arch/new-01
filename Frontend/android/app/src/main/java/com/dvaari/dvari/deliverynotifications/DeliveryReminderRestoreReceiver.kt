package com.dvaari.dvari.deliverynotifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class DeliveryReminderRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    try {
      val action = intent?.action.orEmpty()
      if (!DeliveryNotificationPrefs.isFeatureEnabled(context)) {
        Log.i(TAG, "logs.info reminder restore skipped because feature is disabled action=$action")
        return
      }

      val reminders = DeliveryReminderStore.getAll(context)
      reminders.forEach { spec ->
        DeliveryReminderScheduler.schedule(
          context,
          spec.scheduleId,
          spec.title,
          spec.scheduledForIso,
          spec.leadMinutes,
          persist = false,
        )
      }
      Log.i(TAG, "logs.info delivery reminders restored action=$action count=${reminders.size}")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder restore failed", error)
    }
  }

  companion object {
    private const val TAG = "DeliveryReminderRestore"
  }
}
