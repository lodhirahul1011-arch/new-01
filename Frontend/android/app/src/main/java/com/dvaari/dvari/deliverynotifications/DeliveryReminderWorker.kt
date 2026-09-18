package com.dvaari.dvari.deliverynotifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.dvaari.dvari.MainActivity
import com.dvaari.dvari.R

class DeliveryReminderWorker(
  context: Context,
  workerParams: WorkerParameters,
) : Worker(context, workerParams) {
  override fun doWork(): Result {
    val scheduleId = inputData.getString(KEY_SCHEDULE_ID).orEmpty()
    val title = inputData.getString(KEY_TITLE).orEmpty().ifBlank { "Upcoming delivery" }
    val body = inputData.getString(KEY_BODY).orEmpty().ifBlank { "A delivery is expected soon." }

    return try {
      ensureChannel()
      val intent = Intent(applicationContext, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra("deliveryScheduleId", scheduleId)
      }
      val pendingIntent = PendingIntent.getActivity(
        applicationContext,
        scheduleId.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

      val notification = NotificationCompat.Builder(
        applicationContext,
        applicationContext.getString(R.string.delivery_reminder_channel_id),
      )
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setContentIntent(pendingIntent)
        .setAutoCancel(true)
        .build()

      NotificationManagerCompat.from(applicationContext).notify(scheduleId.hashCode(), notification)
      Log.i(TAG, "logs.info delivery reminder notification shown scheduleId=$scheduleId")
      Result.success()
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder worker failed", error)
      Result.failure()
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channelId = applicationContext.getString(R.string.delivery_reminder_channel_id)
    val channel = NotificationChannel(
      channelId,
      applicationContext.getString(R.string.delivery_reminder_channel_name),
      NotificationManager.IMPORTANCE_HIGH,
    )
    val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val TAG = "DeliveryReminderWorker"
    const val KEY_SCHEDULE_ID = "scheduleId"
    const val KEY_TITLE = "title"
    const val KEY_BODY = "body"
  }
}
