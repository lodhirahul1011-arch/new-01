package com.dvaari.dvari.nativecall

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.telecom.TelecomManager
import android.util.Log

object NativeDeviceCallBusy {
  private const val TAG = "NativeDeviceCallBusy"

  fun isBusy(context: Context, nextCallId: String? = null): Boolean {
    val appContext = context.applicationContext
    val storedActiveCallId = NativeCallStore.getActiveCallId(appContext)
    val next = nextCallId.orEmpty().trim()
    val storedDifferentCall = storedActiveCallId.isNotBlank() && storedActiveCallId != next
    val storedCallStillManaged = NativeAudioCallManager.isManagingCall(storedActiveCallId)
    if (storedDifferentCall && !storedCallStillManaged) {
      NativeCallStore.clearActiveCall(appContext, storedActiveCallId)
      Log.i(TAG, "cleared stale native active call marker before busy decision stored=$storedActiveCallId next=$next")
    }
    val appCallBusy = storedDifferentCall && storedCallStillManaged
    val audioBusy = isAudioCallBusy(appContext)
    val telecomBusy = isTelecomCallBusy(appContext)
    val busy = appCallBusy || audioBusy || telecomBusy
    Log.i(
      TAG,
      "native device call busy checked stored=$storedActiveCallId next=$next appCallBusy=$appCallBusy audioBusy=$audioBusy telecomBusy=$telecomBusy busy=$busy",
    )
    return busy
  }

  private fun isAudioCallBusy(context: Context): Boolean {
    return try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      val mode = audioManager?.mode ?: AudioManager.MODE_NORMAL
      val busy = mode == AudioManager.MODE_IN_CALL ||
        mode == AudioManager.MODE_IN_COMMUNICATION ||
        mode == AudioManager.MODE_CALL_SCREENING
      Log.i(TAG, "native audio call mode checked mode=${modeName(mode)} value=$mode busy=$busy")
      busy
    } catch (error: Throwable) {
      Log.e(TAG, "failed to check native audio call busy state", error)
      false
    }
  }

  private fun isTelecomCallBusy(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      Log.i(TAG, "native telecom busy check skipped below API 23")
      return false
    }

    return try {
      val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
      val busy = telecomManager?.isInCall == true
      Log.i(TAG, "native telecom call state checked busy=$busy")
      busy
    } catch (error: SecurityException) {
      Log.e(TAG, "native telecom call state permission missing", error)
      false
    } catch (error: Throwable) {
      Log.e(TAG, "failed to check native telecom call state", error)
      false
    }
  }

  private fun modeName(mode: Int): String {
    return when (mode) {
      AudioManager.MODE_IN_CALL -> "in_call"
      AudioManager.MODE_IN_COMMUNICATION -> "in_communication"
      AudioManager.MODE_CALL_SCREENING -> "call_screening"
      AudioManager.MODE_RINGTONE -> "ringtone"
      AudioManager.MODE_NORMAL -> "normal"
      else -> "unknown"
    }
  }
}
