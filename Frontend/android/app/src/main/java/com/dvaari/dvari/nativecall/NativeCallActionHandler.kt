package com.dvaari.dvari.nativecall

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.Executors

object NativeCallActionHandler {
  private const val TAG = "NativeCallActionHandler"
  private val executor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())

  fun answer(
    context: Context,
    callId: String,
    callerName: String?,
    callerPhone: String?,
    callType: String?,
    launchActiveUi: Boolean = true,
  ) {
    val appContext = context.applicationContext
    if (callId.isBlank()) {
      Log.e(TAG, "cannot answer native call without call id")
      return
    }

    if (NativeDeviceCallBusy.isBusy(appContext, callId)) {
      Log.i(TAG, "native answer rejected because device is already busy: $callId")
      NativeCallNotifier.cancelIncomingCall(appContext, callId)
      NativeCallAlert.stop(appContext)
      executor.execute {
        try {
          NativeTabletCallClient(appContext).reject(callId, "mobile_busy")
          Log.i(TAG, "native busy answer rejection synced with backend: $callId")
        } catch (error: Throwable) {
          Log.e(TAG, "native busy answer rejection backend sync failed", error)
        }
      }
      return
    }

    Log.i(TAG, "native call answer action accepted: $callId")
    NativeCallStore.markActiveCall(appContext, callId)
    NativeCallNotifier.cancelIncomingCall(appContext, callId)
    NativeCallAlert.stop(appContext)
    try {
      NativeAudioCallManager.start(appContext, callId)
      Log.i(TAG, "native audio session started from answer action: $callId")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to start native audio session from answer action", error)
    }

    if (launchActiveUi) {
      mainHandler.post {
        try {
          val activeIntent = NativeActiveCallActivity.intent(appContext, callId, callerName, callerPhone, callType)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          appContext.startActivity(activeIntent)
          Log.i(TAG, "native active call UI launched after answer action: $callId")
        } catch (error: Throwable) {
          Log.e(TAG, "failed to launch native active call UI after answer action", error)
        }
      }
    }

    executor.execute {
      try {
        NativeTabletCallClient(appContext).answer(callId)
        Log.i(TAG, "native call answer synced with backend: $callId")
      } catch (error: Throwable) {
        Log.e(TAG, "native call answer backend sync failed", error)
      }
    }
  }

  fun decline(context: Context, callId: String) {
    val appContext = context.applicationContext
    if (callId.isBlank()) {
      Log.e(TAG, "cannot decline native call without call id")
      return
    }

    Log.i(TAG, "native call decline action accepted: $callId")
    NativeCallNotifier.cancelIncomingCall(appContext, callId)
    NativeCallNotifier.cancelActiveCall(appContext, callId)
    NativeCallAlert.stop(appContext)
    NativeAudioCallManager.endNativeCall(appContext, callId, notifyBackend = false)

    executor.execute {
      try {
        NativeTabletCallClient(appContext).reject(callId)
        Log.i(TAG, "native call decline synced with backend: $callId")
      } catch (error: Throwable) {
        Log.e(TAG, "native call decline backend sync failed", error)
      }
    }
  }
}
