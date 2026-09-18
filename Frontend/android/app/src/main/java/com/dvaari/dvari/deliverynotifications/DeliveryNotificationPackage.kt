package com.dvaari.dvari.deliverynotifications

import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DeliveryNotificationPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    Log.i(TAG, "logs.info delivery notification native module registered")
    return listOf(DeliveryNotificationModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    Log.i(TAG, "logs.info delivery notification package has no view managers")
    return emptyList()
  }

  companion object {
    private const val TAG = "DeliveryNotifPackage"
  }
}
