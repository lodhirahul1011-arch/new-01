package com.dvaari.dvari

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.dvaari.dvari.deliverynotifications.DeliveryNotificationPackage
import com.dvaari.dvari.nativecall.NativeCallPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          Log.i("MainApplication", "logs.info delivery notification package enabled without SMS inbox permission")
          add(DeliveryNotificationPackage())
          add(LiveFeedAudioPackage())
          Log.i("MainApplication", "logs.info Adding MobileCallStatePackage to PackageList")
          add(MobileCallStatePackage())
          add(CallRingtonePackage())
          add(NativeCallPackage())
          add(DeliveryImageDownloadPackage())
          add(OpenAppPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
