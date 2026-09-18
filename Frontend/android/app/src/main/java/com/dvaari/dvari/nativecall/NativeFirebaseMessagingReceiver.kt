package com.dvaari.dvari.nativecall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import io.invertase.firebase.common.SharedUtils
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingReceiver
import java.util.concurrent.Executors

class NativeFirebaseMessagingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      val appContext = context.applicationContext
      val type = dataValue(intent, "type")
      val callId = dataValue(intent, "callId")

      if (isAppInForeground(context)) {
        Log.i(TAG, "foreground FCM delegated to React Native: type=$type callId=$callId")
        delegateToReactNative(context, intent)
        return
      }

      when (type) {
        "incoming_call" -> {
          if (callId.isBlank()) {
            Log.e(TAG, "incoming call FCM missing callId")
            delegateToReactNative(context, intent)
            return
          }
          val callerName = dataValue(intent, "callerName").ifBlank { "Visitor at Door" }
          val callerPhone = dataValue(intent, "callerPhone")
          val callType = dataValue(intent, "callType")
          if (NativeDeviceCallBusy.isBusy(appContext, callId)) {
            val pendingResult = goAsync()
            rejectBusyCallAsync(appContext, callId, pendingResult)
            NativeCallNotifier.cancelIncomingCall(appContext, callId)
            NativeCallAlert.stop(appContext)
            Log.i(TAG, "background incoming call rejected because mobile is busy: $callId")
            return
          }
          NativeCallNotifier.showIncomingCall(
            appContext,
            callId,
            callerName,
            callerPhone,
            callType,
            openFullScreen = false,
          )
          NativeCallAlert.start(appContext)
          Log.i(TAG, "background incoming call handled natively: $callId")
        }
        "call_ended" -> {
          if (callId.isBlank()) {
            Log.e(TAG, "call ended FCM missing callId")
            delegateToReactNative(context, intent)
            return
          }
          NativeAudioCallManager.endNativeCall(appContext, callId, notifyBackend = false)
          NativeCallNotifier.cancelIncomingCall(appContext, callId)
          NativeCallNotifier.cancelActiveCall(appContext, callId)
          NativeCallAlert.stop(appContext)
          Log.i(TAG, "background call ended handled natively: $callId")
        }
        else -> {
          Log.i(TAG, "background FCM delegated to React Native: type=$type")
          delegateToReactNative(context, intent)
        }
      }
    } catch (error: Throwable) {
      Log.e(TAG, "native FCM receiver failed; falling back to React Native", error)
      delegateToReactNative(context, intent)
    }
  }

  private fun dataValue(intent: Intent, key: String): String {
    return try {
      intent.extras?.get(key)?.toString().orEmpty().trim()
    } catch (error: Throwable) {
      Log.e(TAG, "failed to read FCM value: $key", error)
      ""
    }
  }

  private fun isAppInForeground(context: Context): Boolean {
    return try {
      SharedUtils.isAppInForeground(context)
    } catch (error: Throwable) {
      Log.e(TAG, "failed to detect foreground state", error)
      false
    }
  }

  private fun delegateToReactNative(context: Context, intent: Intent) {
    try {
      ReactNativeFirebaseMessagingReceiver().onReceive(context, intent)
    } catch (error: Throwable) {
      Log.e(TAG, "failed to delegate FCM to React Native", error)
    }
  }

  private fun rejectBusyCallAsync(context: Context, callId: String, pendingResult: PendingResult) {
    val appContext = context.applicationContext
    executor.execute {
      try {
        NativeTabletCallClient(appContext).reject(callId, "mobile_busy")
        Log.i(TAG, "background busy incoming call synced with backend: $callId")
      } catch (error: Throwable) {
        Log.e(TAG, "failed to sync background busy incoming call rejection", error)
      } finally {
        try {
          pendingResult.finish()
        } catch (error: Throwable) {
          Log.e(TAG, "failed to finish busy reject pending result", error)
        }
      }
    }
  }

  companion object {
    private const val TAG = "NativeFcmReceiver"
    private val executor = Executors.newSingleThreadExecutor()
  }
}
