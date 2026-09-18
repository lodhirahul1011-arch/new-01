package com.dvaari.dvari.nativecall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.concurrent.Executors

class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pendingResult = goAsync()
    val appContext = context.applicationContext
    executor.execute {
      try {
        handle(appContext, intent)
      } catch (error: Throwable) {
        Log.e(TAG, "native call action failed", error)
      } finally {
        pendingResult.finish()
      }
    }
  }

  private fun handle(context: Context, intent: Intent) {
    val action = intent.getStringExtra(NativeCallActions.ACTION).orEmpty()
    val callId = intent.getStringExtra(NativeCallActions.EXTRA_CALL_ID).orEmpty()
    val callerName = intent.getStringExtra(NativeCallActions.EXTRA_CALLER_NAME).orEmpty().ifBlank { "Visitor at Door" }
    val callerPhone = intent.getStringExtra(NativeCallActions.EXTRA_CALLER_PHONE)
    val callType = intent.getStringExtra(NativeCallActions.EXTRA_CALL_TYPE)

    if (callId.isBlank()) {
      Log.e(TAG, "native call action missing call id")
      return
    }

    Log.i(TAG, "handling native call action=$action callId=$callId")
    when (action) {
      NativeCallActions.ANSWER -> {
        NativeCallActionHandler.answer(context, callId, callerName, callerPhone, callType, launchActiveUi = true)
      }
      NativeCallActions.DECLINE -> {
        NativeCallActionHandler.decline(context, callId)
      }
      NativeCallActions.END -> {
        NativeAudioCallManager.endNativeCall(context, callId, notifyBackend = true)
      }
      NativeCallActions.MUTE -> {
        NativeAudioCallManager.toggleMute()
      }
      NativeCallActions.SPEAKER -> {
        NativeAudioCallManager.toggleSpeaker(context)
      }
      else -> Log.e(TAG, "unknown native call action=$action")
    }
  }

  companion object {
    private const val TAG = "CallActionReceiver"
    private val executor = Executors.newSingleThreadExecutor()

    fun intent(
      context: Context,
      action: String,
      callId: String,
      callerName: String?,
      callerPhone: String?,
      callType: String?,
    ): Intent {
      return Intent(context, CallActionReceiver::class.java)
        .putExtra(NativeCallActions.ACTION, action)
        .putExtra(NativeCallActions.EXTRA_CALL_ID, callId)
        .putExtra(NativeCallActions.EXTRA_CALLER_NAME, callerName.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALLER_PHONE, callerPhone.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALL_TYPE, callType.orEmpty())
    }
  }
}
