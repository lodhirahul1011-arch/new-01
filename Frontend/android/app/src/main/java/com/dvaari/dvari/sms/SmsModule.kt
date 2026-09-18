package com.dvaari.dvari.sms

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.util.Log
import com.dvaari.dvari.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = SmsModule.NAME)
class SmsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME: String = "SmsModule"
  }

  private var smsObserver: ContentObserver? = null
  private var observerCount: Int = 0

  override fun getName(): String = NAME

  init {
    log("init()")
    SmsEventBridge.registerReactContext(reactContext)
  }

  @ReactMethod
  fun getSMS(options: ReadableMap?, promise: Promise) {
    log("getSMS() called, hasPermission=${hasReadSmsPermission()}")
    if (!hasReadSmsPermission()) {
      promise.resolve(Arguments.createArray())
      return
    }

    val since: Long? =
      if (options != null && options.hasKey("since") && !options.isNull("since")) {
        // RN numbers come as Double.
        options.getDouble("since").toLong()
      } else {
        null
      }

    val limit: Int =
      if (options != null && options.hasKey("limit") && !options.isNull("limit")) {
        options.getInt("limit").coerceIn(1, 500)
      } else {
        200
      }

    log("getSMS() query since=$since limit=$limit")

    try {
      val resolver = reactContext.contentResolver

      val queryUri: Uri = Telephony.Sms.Inbox.CONTENT_URI

      val projection =
        arrayOf(
          Telephony.Sms._ID,
          Telephony.Sms.ADDRESS,
          Telephony.Sms.BODY,
          Telephony.Sms.DATE,
        )

      val selection: String?
      val selectionArgs: Array<String>?

      if (since != null) {
        selection = "${Telephony.Sms.DATE} > ?"
        selectionArgs = arrayOf(since.toString())
      } else {
        selection = null
        selectionArgs = null
      }

      val cursor =
        resolver.query(
          queryUri,
          projection,
          selection,
          selectionArgs,
          "${Telephony.Sms.DATE} DESC",
        )

      val result: WritableArray = Arguments.createArray()
      var pushedCount = 0

      cursor?.use { c ->
        val idIndex = c.getColumnIndex(Telephony.Sms._ID)
        val addressIndex = c.getColumnIndex(Telephony.Sms.ADDRESS)
        val bodyIndex = c.getColumnIndex(Telephony.Sms.BODY)
        val dateIndex = c.getColumnIndex(Telephony.Sms.DATE)

        while (c.moveToNext() && pushedCount < limit) {
          val map = Arguments.createMap()

          if (idIndex >= 0) map.putString("id", c.getString(idIndex))
          if (addressIndex >= 0) map.putString("address", c.getString(addressIndex))
          if (bodyIndex >= 0) map.putString("body", c.getString(bodyIndex))
          if (dateIndex >= 0) map.putDouble("date", c.getLong(dateIndex).toDouble())

          result.pushMap(map)
          pushedCount += 1
        }
      }

      log("getSMS() returning count=$pushedCount")
      promise.resolve(result)
    } catch (e: Exception) {
      log("getSMS() failed: ${e.message}")
      promise.reject("SMS_READ_FAILED", e)
    }
  }

  @ReactMethod
  fun startSmsObserver() {
    observerCount += 1
    log("startSmsObserver() count=$observerCount hasPermission=${hasReadSmsPermission()}")
    if (observerCount > 1) return

    if (!hasReadSmsPermission()) return
    if (smsObserver != null) return

    val handler = Handler(Looper.getMainLooper())

    smsObserver =
      object : ContentObserver(handler) {
        override fun onChange(selfChange: Boolean) {
          super.onChange(selfChange)
          log("ContentObserver.onChange(selfChange=$selfChange)")
          emitSmsChanged()
        }

        override fun onChange(selfChange: Boolean, uri: Uri?) {
          super.onChange(selfChange, uri)
          log("ContentObserver.onChange(selfChange=$selfChange, uri=$uri)")
          emitSmsChanged()
        }
      }

    try {
      reactContext.contentResolver.registerContentObserver(
        Telephony.Sms.CONTENT_URI,
        true,
        smsObserver as ContentObserver,
      )
      log("ContentObserver registered")
    } catch (_: Exception) {
      // Ignore: observer just won't run.
      log("ContentObserver register failed")
      smsObserver = null
      observerCount = 0
    }
  }

  @ReactMethod
  fun consumePendingBackgroundSms(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(SmsBackgroundStore.PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(SmsBackgroundStore.KEY_PENDING_SMS, "[]") ?: "[]"
      prefs.edit().remove(SmsBackgroundStore.KEY_PENDING_SMS).apply()
      log("consumePendingBackgroundSms() returning raw length=${raw.length}")
      promise.resolve(raw)
    } catch (e: Exception) {
      log("consumePendingBackgroundSms() failed: ${e.message}")
      promise.resolve("[]")
    }
  }

  @ReactMethod
  fun stopSmsObserver() {
    if (observerCount > 0) observerCount -= 1
    log("stopSmsObserver() count=$observerCount")
    if (observerCount > 0) return

    val observer = smsObserver ?: return
    try {
      reactContext.contentResolver.unregisterContentObserver(observer)
      log("ContentObserver unregistered")
    } catch (_: Exception) {
      // Ignore.
      log("ContentObserver unregister failed")
    } finally {
      smsObserver = null
      observerCount = 0
    }
  }

  // Required for NativeEventEmitter on iOS/Android to avoid warnings.
  @ReactMethod
  fun addListener(eventName: String) {}

  // Required for NativeEventEmitter on iOS/Android to avoid warnings.
  @ReactMethod
  fun removeListeners(count: Int) {}

  override fun invalidate() {
    stopSmsObserver()
    SmsEventBridge.unregisterReactContext(reactContext)
    super.invalidate()
  }

  private fun emitSmsChanged() {
    log("emitSmsChanged()")
    SmsEventBridge.emitSmsChanged()
  }

  private fun hasReadSmsPermission(): Boolean {
    log("logs.info SMS inbox read path disabled for Play Store compliance")
    return false
  }

  private fun log(message: String) {
    if (!BuildConfig.DEBUG) return
    Log.d(NAME, message)
  }
}
