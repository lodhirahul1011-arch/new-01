package com.dvaari.dvari.sms

import android.util.Log
import com.dvaari.dvari.BuildConfig
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SmsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    if (BuildConfig.DEBUG) {
      Log.d("SmsPackage", "createNativeModules()")
    }
    return listOf(SmsModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
