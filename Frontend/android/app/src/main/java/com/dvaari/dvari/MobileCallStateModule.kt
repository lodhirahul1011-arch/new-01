package com.dvaari.dvari

import android.media.AudioManager
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

class MobileCallStateModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MobileCallState"

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

  @ReactMethod
  fun getAudioCallState(promise: Promise) {
    try {
      val audioManager = reactContext.getSystemService(AudioManager::class.java)
      if (audioManager == null) {
        Log.e("MobileCallState", "AudioManager unavailable while checking call state")
        val result = WritableNativeMap()
        result.putBoolean("busy", false)
        result.putString("mode", "unavailable")
        result.putInt("modeValue", -1)
        promise.resolve(result)
        return
      }

      val mode = audioManager.mode
      val normalizedMode = modeName(mode)
      val busy = mode == AudioManager.MODE_IN_CALL ||
        mode == AudioManager.MODE_IN_COMMUNICATION ||
        mode == AudioManager.MODE_CALL_SCREENING
      val result = WritableNativeMap()
      result.putBoolean("busy", busy)
      result.putString("mode", normalizedMode)
      result.putInt("modeValue", mode)

      Log.i("MobileCallState", "Audio call state checked mode=$normalizedMode busy=$busy")
      promise.resolve(result)
    } catch (error: Throwable) {
      Log.e("MobileCallState", "Failed to check audio call state", error)
      promise.reject("MOBILE_CALL_STATE_FAILED", error.message, error)
    }
  }
}
