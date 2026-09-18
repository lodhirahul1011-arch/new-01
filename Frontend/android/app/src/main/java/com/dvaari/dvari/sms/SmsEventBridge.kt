package com.dvaari.dvari.sms

import java.lang.ref.WeakReference
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter

object SmsEventBridge {
  const val EVENT_SMS_CHANGED: String = "SmsModule:smsChanged"

  @Volatile
  private var reactContextRef: WeakReference<ReactApplicationContext>? = null

  fun registerReactContext(context: ReactApplicationContext) {
    reactContextRef = WeakReference(context)
  }

  fun unregisterReactContext(context: ReactApplicationContext) {
    val current = reactContextRef?.get()
    if (current === context) {
      reactContextRef = null
    }
  }

  fun emitSmsChanged() {
    val context = reactContextRef?.get() ?: return
    if (!context.hasActiveCatalystInstance()) return

    val payload = Arguments.createMap().apply {
      putDouble("ts", System.currentTimeMillis().toDouble())
      putString("source", "native_receiver")
    }

    context.getJSModule(RCTDeviceEventEmitter::class.java).emit(EVENT_SMS_CHANGED, payload)
  }
}
