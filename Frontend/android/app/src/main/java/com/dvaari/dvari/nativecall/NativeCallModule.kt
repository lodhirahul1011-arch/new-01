package com.dvaari.dvari.nativecall

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class NativeCallModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NativeCall"

  @ReactMethod
  fun setAuthTokens(accessToken: String?, refreshToken: String?) {
    Log.i(TAG, "logs.info native module set auth tokens requested")
    NativeCallStore.saveTokens(reactContext.applicationContext, accessToken, refreshToken)
  }

  @ReactMethod
  fun clearAuthTokens() {
    Log.i(TAG, "logs.info native module clear auth tokens requested")
    NativeCallStore.clearTokens(reactContext.applicationContext)
  }

  @ReactMethod
  fun getAuthTokens(promise: Promise) {
    try {
      val tokens = NativeCallStore.getAuthTokens(reactContext.applicationContext)
      val map = Arguments.createMap()
      map.putString("accessToken", tokens.accessToken)
      map.putString("refreshToken", tokens.refreshToken)
      map.putDouble("updatedAt", tokens.updatedAt.toDouble())
      Log.i(
        TAG,
        "logs.info native module auth tokens returned hasAccess=${tokens.accessToken.isNotBlank()} hasRefresh=${tokens.refreshToken.isNotBlank()}",
      )
      promise.resolve(map)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error native module get auth tokens failed", error)
      promise.reject("native_auth_tokens_read_failed", error)
    }
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      val allowed = NativeMiniCallOverlay.canDrawOverlays(reactContext.applicationContext)
      Log.i(TAG, "native overlay permission checked: $allowed")
      promise.resolve(allowed)
    } catch (error: Throwable) {
      Log.e(TAG, "native overlay permission check failed", error)
      promise.reject("native_overlay_check_failed", error)
    }
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    try {
      reactContext.startActivity(NativeMiniCallOverlay.overlaySettingsIntent(reactContext.applicationContext))
      Log.i(TAG, "native overlay settings opened")
      promise.resolve(true)
    } catch (error: Throwable) {
      Log.e(TAG, "native overlay settings open failed", error)
      promise.reject("native_overlay_settings_failed", error)
    }
  }

  @ReactMethod
  fun showIncomingCall(payload: ReadableMap, promise: Promise) {
    try {
      val callId = payload.getString("callId").orEmpty()
      val callerName = payload.getString("callerName").orEmpty().ifBlank { "Visitor at Door" }
      val callerPhone = if (payload.hasKey("callerPhone")) payload.getString("callerPhone") else null
      val callType = if (payload.hasKey("callType")) payload.getString("callType") else null
      NativeCallNotifier.showIncomingCall(
        reactContext.applicationContext,
        callId,
        callerName,
        callerPhone,
        callType,
        openFullScreen = true,
      )
      NativeCallAlert.start(reactContext.applicationContext)
      Log.i(TAG, "native module displayed incoming call: $callId")
      promise.resolve(true)
    } catch (error: Throwable) {
      Log.e(TAG, "native module showIncomingCall failed", error)
      promise.reject("native_call_show_failed", error)
    }
  }

  @ReactMethod
  fun cancelIncomingCall(callId: String?) {
    NativeCallNotifier.cancelIncomingCall(reactContext.applicationContext, callId)
    NativeCallAlert.stop(reactContext.applicationContext)
  }

  @ReactMethod
  fun cancelActiveCall(callId: String?) {
    NativeCallNotifier.cancelActiveCall(reactContext.applicationContext, callId)
  }

  companion object {
    private const val TAG = "NativeCallModule"
  }
}
