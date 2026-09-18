package com.dvaari.dvari.nativecall

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.app.KeyguardManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.PowerManager
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.dvaari.dvari.R

object NativeCallNotifier {
  private const val TAG = "NativeCallNotifier"
  private const val INCOMING_NORMAL_CHANNEL_ID = "dvaari-native-calls-v1-normal"
  private const val INCOMING_VIBRATE_CHANNEL_ID = "dvaari-native-calls-v1-vibrate"
  private const val INCOMING_SILENT_CHANNEL_ID = "dvaari-native-calls-v1-silent"
  private const val ACTIVE_CALL_CHANNEL_ID = "dvaari-active-calls-v1"
  private const val INCOMING_PREFIX = 910_000
  private const val ACTIVE_PREFIX = 920_000
  private val CALL_VIBRATION_PATTERN = longArrayOf(0, 900, 350, 900, 900)

  fun showIncomingCall(
    context: Context,
    callId: String,
    callerName: String,
    callerPhone: String?,
    callType: String?,
    openFullScreen: Boolean = true,
  ) {
    if (callId.isBlank()) {
      Log.e(TAG, "cannot show native incoming call without call id")
      return
    }

    var shouldOpenFullScreen = openFullScreen || shouldUseFullScreenUi(context)
    Log.i(TAG, "native incoming call full-screen request evaluated: $callId requested=$openFullScreen useFullScreen=$shouldOpenFullScreen")
    if (shouldOpenFullScreen) {
      wakeScreenForIncomingCall(context, callId)
    }
    if (!shouldOpenFullScreen) {
      val overlayShown = NativeMiniCallOverlay.show(context, callId, callerName, callerPhone, callType)
      if (overlayShown) {
        NativeCallAlert.start(context)
        Log.i(TAG, "native incoming call handled by overlay: $callId")
        return
      }
      Log.e(TAG, "native mini overlay unavailable or failed; falling back to full-screen incoming UI: $callId")
      shouldOpenFullScreen = true
      wakeScreenForIncomingCall(context, callId)
    }

    val ringerMode = getRingerMode(context)
    val incomingChannelId = incomingChannelIdForMode(ringerMode)
    ensureIncomingChannel(context, incomingChannelId, ringerMode)
    val fullScreenIntent = IncomingCallActivity.intent(context, callId, callerName, callerPhone, callType)
    val miniIntent = MiniIncomingCallActivity.intent(context, callId, callerName, callerPhone, callType)
    val displayIntent = if (shouldOpenFullScreen) fullScreenIntent else miniIntent
    val fullScreenPendingIntent = PendingIntent.getActivity(
      context,
      callId.hashCode(),
      displayIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )

    val declineIntent = NativeCallActionActivity.intent(context, NativeCallActions.DECLINE, callId, callerName, callerPhone, callType)
    val answerIntent = NativeCallActionActivity.intent(context, NativeCallActions.ANSWER, callId, callerName, callerPhone, callType)
    val declinePendingIntent = PendingIntent.getActivity(
      context,
      callId.hashCode() + 1,
      declineIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )
    val answerPendingIntent = PendingIntent.getActivity(
      context,
      callId.hashCode() + 2,
      answerIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )
    val headsUpView = incomingCallRemoteViews(context, callId, callerName, callerPhone, callType, shouldOpenFullScreen, declinePendingIntent, answerPendingIntent)

    val builder = NotificationCompat.Builder(context, incomingChannelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(callerName.ifBlank { "Visitor at Door" })
      .setContentText("Incoming voice call")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setCustomContentView(headsUpView)
      .setCustomBigContentView(headsUpView)
      .setCustomHeadsUpContentView(headsUpView)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setContentIntent(fullScreenPendingIntent)
      .setFullScreenIntent(fullScreenPendingIntent, true)

    applyAlertMode(builder, ringerMode)

    if (shouldOpenFullScreen) {
      Log.i(TAG, "native incoming call will launch full-screen activity: $callId")
    } else {
      Log.i(TAG, "native incoming call uses full-screen intent for heads-up fallback: $callId")
    }

    try {
      NotificationManagerCompat.from(context).notify(incomingNotificationId(callId), builder.build())
      Log.i(TAG, "native incoming call notification shown: $callId fullScreen=$shouldOpenFullScreen ringerMode=$ringerMode channel=$incomingChannelId")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to show native incoming call notification", error)
    }

    if (shouldOpenFullScreen) {
      try {
        context.startActivity(fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        Log.i(TAG, "native incoming call activity launched: $callId")
      } catch (error: Throwable) {
        Log.e(TAG, "failed to launch native incoming call activity", error)
      }
    } else {
      Log.i(TAG, "native incoming call shown as notification fallback: $callId")
    }
  }

  fun showActiveCall(context: Context, callId: String, callerName: String) {
    if (callId.isBlank()) {
      Log.e(TAG, "cannot show native active call without call id")
      return
    }

    ensureActiveCallChannel(context)
    val openIntent = NativeActiveCallActivity.intent(context, callId, callerName, null, null)
    val openPendingIntent = PendingIntent.getActivity(
      context,
      callId.hashCode() + 10,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )
    val endPendingIntent = PendingIntent.getBroadcast(
      context,
      callId.hashCode() + 11,
      CallActionReceiver.intent(context, NativeCallActions.END, callId, callerName, null, null),
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
    )

    val notification = NotificationCompat.Builder(context, ACTIVE_CALL_CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(callerName.ifBlank { "Visitor at Door" })
      .setContentText("Audio call in progress")
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(openPendingIntent)
      .addAction(0, "End Call", endPendingIntent)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setLocalOnly(true)
      .build()

    try {
      NotificationManagerCompat.from(context).notify(activeNotificationId(callId), notification)
      Log.i(TAG, "native active call notification shown quietly in shade: $callId")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to show native active call notification", error)
    }
  }

  fun cancelIncomingCall(context: Context, callId: String?) {
    try {
      NativeCallAlert.stop(context)
      if (callId.isNullOrBlank()) {
        Log.e(TAG, "native incoming call cancel requested without call id; alert stopped")
        return
      }
      NativeMiniCallOverlay.hide(context, callId)
      NotificationManagerCompat.from(context).cancel(incomingNotificationId(callId))
      Log.i(TAG, "native incoming call notification cancelled and alert stopped: $callId")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to cancel native incoming call notification", error)
    }
  }

  fun cancelActiveCall(context: Context, callId: String?) {
    try {
      NativeCallAlert.stop(context)
      if (callId.isNullOrBlank()) {
        Log.e(TAG, "native active call cancel requested without call id; alert stopped")
        return
      }
      NotificationManagerCompat.from(context).cancel(activeNotificationId(callId))
      Log.i(TAG, "native active call notification cancelled and alert stopped: $callId")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to cancel native active call notification", error)
    }
  }

  private fun ensureIncomingChannel(context: Context, channelId: String, ringerMode: Int) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      channelId,
      incomingChannelName(ringerMode),
      NotificationManager.IMPORTANCE_HIGH,
    )
    channel.description = "Incoming Dvaari visitor calls"
    channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    channel.enableVibration(ringerMode != AudioManager.RINGER_MODE_SILENT)
    if (ringerMode != AudioManager.RINGER_MODE_SILENT) {
      channel.vibrationPattern = CALL_VIBRATION_PATTERN
    }
    if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
      channel.setSound(
        android.provider.Settings.System.DEFAULT_RINGTONE_URI,
        callAudioAttributes(),
      )
    } else {
      channel.setSound(null, null)
    }
    manager.createNotificationChannel(channel)
    Log.i(TAG, "native incoming call channel ensured: $channelId ringerMode=$ringerMode")
  }

  private fun ensureActiveCallChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      val channel = NotificationChannel(
        ACTIVE_CALL_CHANNEL_ID,
        "Dvaari Active Calls",
        NotificationManager.IMPORTANCE_LOW,
      )
      channel.description = "Ongoing Dvaari call controls"
      channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      channel.enableVibration(false)
      channel.setSound(null, null)
      manager.createNotificationChannel(channel)
      Log.i(TAG, "native active call channel ensured: $ACTIVE_CALL_CHANNEL_ID")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to ensure native active call channel", error)
    }
  }

  private fun applyAlertMode(builder: NotificationCompat.Builder, ringerMode: Int) {
    when (ringerMode) {
      AudioManager.RINGER_MODE_NORMAL -> {
        builder
          .setSound(android.provider.Settings.System.DEFAULT_RINGTONE_URI)
          .setVibrate(CALL_VIBRATION_PATTERN)
        Log.i(TAG, "native incoming notification configured for normal ring")
      }
      AudioManager.RINGER_MODE_VIBRATE -> {
        builder
          .setSound(null)
          .setVibrate(CALL_VIBRATION_PATTERN)
        Log.i(TAG, "native incoming notification configured for vibrate only")
      }
      else -> {
        builder
          .setSound(null)
          .setVibrate(longArrayOf(0))
          .setSilent(true)
        Log.i(TAG, "native incoming notification configured for silent mode")
      }
    }
  }

  private fun getRingerMode(context: Context): Int {
    return try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      val mode = audioManager?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
      Log.i(TAG, "native notification ringer mode checked: $mode")
      mode
    } catch (error: Throwable) {
      Log.e(TAG, "failed to check native notification ringer mode", error)
      AudioManager.RINGER_MODE_NORMAL
    }
  }

  private fun incomingChannelIdForMode(ringerMode: Int): String {
    return when (ringerMode) {
      AudioManager.RINGER_MODE_NORMAL -> INCOMING_NORMAL_CHANNEL_ID
      AudioManager.RINGER_MODE_VIBRATE -> INCOMING_VIBRATE_CHANNEL_ID
      else -> INCOMING_SILENT_CHANNEL_ID
    }
  }

  private fun incomingChannelName(ringerMode: Int): String {
    return when (ringerMode) {
      AudioManager.RINGER_MODE_NORMAL -> "Dvaari Native Calls"
      AudioManager.RINGER_MODE_VIBRATE -> "Dvaari Native Calls Vibrate"
      else -> "Dvaari Native Calls Silent"
    }
  }

  private fun callAudioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
  }

  private fun incomingCallRemoteViews(
    context: Context,
    callId: String,
    callerName: String,
    callerPhone: String?,
    callType: String?,
    fullScreen: Boolean,
    declinePendingIntent: PendingIntent,
    answerPendingIntent: PendingIntent,
  ): RemoteViews {
    return RemoteViews(context.packageName, R.layout.native_incoming_call_notification).apply {
      setTextViewText(R.id.native_call_title, callerName.ifBlank { "Visitor at Door" })
      setTextViewText(R.id.native_call_body, "Incoming voice call")
      setOnClickPendingIntent(R.id.native_call_decline, declinePendingIntent)
      setOnClickPendingIntent(R.id.native_call_answer, answerPendingIntent)
      setOnClickPendingIntent(
        R.id.native_call_root,
        PendingIntent.getActivity(
          context,
          callId.hashCode() + 3,
          if (fullScreen) {
            IncomingCallActivity.intent(context, callId, callerName, callerPhone, callType)
          } else {
            MiniIncomingCallActivity.intent(context, callId, callerName, callerPhone, callType)
          },
          PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag(),
        ),
      )
      Log.i(TAG, "native incoming call remote view prepared: $callId")
    }
  }

  private fun shouldUseFullScreenUi(context: Context): Boolean {
    return try {
      val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val locked = keyguardManager?.isKeyguardLocked == true
      val interactive = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
        powerManager?.isInteractive == true
      } else {
        @Suppress("DEPRECATION")
        powerManager?.isScreenOn == true
      }
      val shouldUse = locked || !interactive
      Log.i(TAG, "native call full-screen decision locked=$locked interactive=$interactive useFullScreen=$shouldUse")
      shouldUse
    } catch (error: Throwable) {
      Log.e(TAG, "failed to decide native call full-screen state", error)
      true
    }
  }

  private fun wakeScreenForIncomingCall(context: Context, callId: String) {
    try {
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
      if (powerManager == null) {
        Log.e(TAG, "cannot wake screen for incoming call because PowerManager is unavailable: $callId")
        return
      }

      @Suppress("DEPRECATION")
      val wakeLock = powerManager.newWakeLock(
        PowerManager.FULL_WAKE_LOCK or
          PowerManager.ACQUIRE_CAUSES_WAKEUP or
          PowerManager.ON_AFTER_RELEASE,
        "Dwar:IncomingCallWakeLock",
      )
      wakeLock.acquire(10_000L)
      Log.i(TAG, "native incoming call wake lock acquired: $callId")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to wake screen for native incoming call: $callId", error)
    }
  }

  private fun incomingNotificationId(callId: String): Int = INCOMING_PREFIX + kotlin.math.abs(callId.hashCode() % 10_000)

  private fun activeNotificationId(callId: String): Int = ACTIVE_PREFIX + kotlin.math.abs(callId.hashCode() % 10_000)

  private fun immutableFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
  }
}

object NativeCallActions {
  const val ACTION = "com.dvaari.dvari.nativecall.ACTION"
  const val ANSWER = "answer"
  const val DECLINE = "decline"
  const val END = "end"
  const val MUTE = "mute"
  const val SPEAKER = "speaker"
  const val EXTRA_CALL_ID = "callId"
  const val EXTRA_CALLER_NAME = "callerName"
  const val EXTRA_CALLER_PHONE = "callerPhone"
  const val EXTRA_CALL_TYPE = "callType"
}
