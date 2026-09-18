package com.dvaari.dvari

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OpenAppModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "OpenApp"

  @ReactMethod
  fun openApp(packageName: String, promise: Promise) {
    try {
      val launchIntent =
        reactContext.packageManager.getLaunchIntentForPackage(packageName)
      if (launchIntent == null) {
        promise.resolve(false)
        return
      }

      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(launchIntent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_APP_FAILED", error.message, error)
    }
  }
}
