package com.dvaari.dvari.deliverynotifications

import android.content.Context
import android.util.Log
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.time.Instant
import java.time.OffsetDateTime
import java.util.concurrent.TimeUnit

object DeliveryReminderScheduler {
  private const val TAG = "DeliveryReminderScheduler"

  fun schedule(
    context: Context,
    scheduleId: String,
    title: String,
    scheduledForIso: String,
    leadMinutes: Int = DeliveryNotificationPrefs.getReminderLeadMinutes(context),
    persist: Boolean = true,
  ): Boolean {
    val scheduledAt = parseInstant(scheduledForIso) ?: run {
      Log.e(TAG, "logs.error delivery reminder schedule failed invalid date")
      return false
    }

    val delayMillis = calculateInitialDelayMillis(
      nowMillis = System.currentTimeMillis(),
      scheduledForMillis = scheduledAt.toEpochMilli(),
      leadMinutes = leadMinutes,
    )
    val data = Data.Builder()
      .putString(DeliveryReminderWorker.KEY_SCHEDULE_ID, scheduleId)
      .putString(DeliveryReminderWorker.KEY_TITLE, title.ifBlank { "Upcoming delivery" })
      .putString(DeliveryReminderWorker.KEY_BODY, "Expected delivery window is coming up.")
      .build()
    val request = OneTimeWorkRequestBuilder<DeliveryReminderWorker>()
      .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
      .setInputData(data)
      .addTag(workName(scheduleId))
      .addTag(WORK_TAG_PREFIX)
      .build()

    WorkManager.getInstance(context).enqueueUniqueWork(
      workName(scheduleId),
      ExistingWorkPolicy.REPLACE,
      request,
    )
    if (persist) {
      DeliveryReminderStore.save(
        context,
        DeliveryReminderSpec(
          scheduleId = scheduleId,
          title = title,
          scheduledForIso = scheduledForIso,
          leadMinutes = leadMinutes,
        ),
      )
    }
    Log.i(TAG, "logs.info delivery reminder scheduled scheduleId=$scheduleId delayMs=$delayMillis")
    return true
  }

  fun cancel(context: Context, scheduleId: String) {
    WorkManager.getInstance(context).cancelUniqueWork(workName(scheduleId))
    DeliveryReminderStore.remove(context, scheduleId)
    Log.i(TAG, "logs.info delivery reminder cancelled scheduleId=$scheduleId")
  }

  fun cancelAll(context: Context) {
    WorkManager.getInstance(context).cancelAllWorkByTag(WORK_TAG_PREFIX)
    DeliveryReminderStore.clear(context)
    Log.i(TAG, "logs.info all delivery reminders cancelled")
  }

  fun calculateInitialDelayMillis(
    nowMillis: Long,
    scheduledForMillis: Long,
    leadMinutes: Int,
  ): Long {
    val reminderAt = scheduledForMillis - leadMinutes.coerceIn(5, 1440) * 60_000L
    return (reminderAt - nowMillis).coerceAtLeast(0L)
  }

  private fun parseInstant(value: String): Instant? {
    return runCatching { Instant.parse(value) }.getOrNull()
      ?: runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
  }

  private fun workName(scheduleId: String) = "$WORK_TAG_PREFIX:$scheduleId"

  private const val WORK_TAG_PREFIX = "delivery-reminder"
}
