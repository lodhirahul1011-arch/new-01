package com.dvaari.dvari.deliverynotifications

import android.content.Intent
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class DeliveryNotificationModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  @ReactMethod
  fun isNotificationAccessEnabled(promise: Promise) {
    try {
      val enabled = DeliveryNotificationPrefs.isNotificationAccessEnabled(reactContext.applicationContext)
      Log.i(TAG, "logs.info notification access checked enabled=$enabled")
      promise.resolve(enabled)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error notification access check failed", error)
      promise.reject("DELIVERY_NOTIFICATION_ACCESS_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun openNotificationAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      Log.i(TAG, "logs.info notification access settings opened")
      promise.resolve(true)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error notification access settings failed", error)
      promise.reject("DELIVERY_NOTIFICATION_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun isFeatureEnabled(promise: Promise) {
    try {
      promise.resolve(DeliveryNotificationPrefs.isFeatureEnabled(reactContext.applicationContext))
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery notification feature check failed", error)
      promise.reject("DELIVERY_NOTIFICATION_FEATURE_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun setFeatureEnabled(enabled: Boolean, promise: Promise) {
    try {
      DeliveryNotificationPrefs.setFeatureEnabled(reactContext.applicationContext, enabled)
      if (!enabled) {
        DeliveryReminderScheduler.cancelAll(reactContext.applicationContext)
      }
      Log.i(TAG, "logs.info delivery notification feature updated enabled=$enabled")
      promise.resolve(enabled)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery notification feature update failed", error)
      promise.reject("DELIVERY_NOTIFICATION_FEATURE_UPDATE_FAILED", error)
    }
  }

  @ReactMethod
  fun getReminderLeadMinutes(promise: Promise) {
    try {
      promise.resolve(DeliveryNotificationPrefs.getReminderLeadMinutes(reactContext.applicationContext))
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder lead read failed", error)
      promise.reject("DELIVERY_REMINDER_LEAD_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun setReminderLeadMinutes(minutes: Int, promise: Promise) {
    try {
      DeliveryNotificationPrefs.setReminderLeadMinutes(reactContext.applicationContext, minutes)
      Log.i(TAG, "logs.info delivery reminder lead updated minutes=$minutes")
      promise.resolve(DeliveryNotificationPrefs.getReminderLeadMinutes(reactContext.applicationContext))
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder lead update failed", error)
      promise.reject("DELIVERY_REMINDER_LEAD_UPDATE_FAILED", error)
    }
  }

  @ReactMethod
  fun getKeywords(promise: Promise) {
    try {
      val result = Arguments.createArray()
      DeliveryNotificationPrefs.getKeywords(reactContext.applicationContext).forEach(result::pushString)
      Log.i(TAG, "logs.info delivery notification keywords read")
      promise.resolve(result)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery notification keywords read failed", error)
      promise.reject("DELIVERY_NOTIFICATION_KEYWORDS_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun setKeywords(keywords: ReadableArray, promise: Promise) {
    try {
      val values = mutableListOf<String>()
      for (index in 0 until keywords.size()) {
        val value = keywords.getString(index)
        if (!value.isNullOrBlank()) values.add(value)
      }
      DeliveryNotificationPrefs.setKeywords(reactContext.applicationContext, values)
      Log.i(TAG, "logs.info delivery notification keywords updated")
      promise.resolve(true)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery notification keywords update failed", error)
      promise.reject("DELIVERY_NOTIFICATION_KEYWORDS_UPDATE_FAILED", error)
    }
  }

  @ReactMethod
  fun getMonitoredSources(promise: Promise) {
    try {
      val result = Arguments.createArray()
      DeliveryNotificationPrefs.monitoredSourceDescriptions.forEach(result::pushString)
      Log.i(TAG, "logs.info delivery notification monitored sources read")
      promise.resolve(result)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery notification monitored sources read failed", error)
      promise.reject("DELIVERY_NOTIFICATION_MONITORED_SOURCES_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun scheduleReminder(scheduleId: String, title: String, scheduledForIso: String, leadMinutes: Int, promise: Promise) {
    try {
      val scheduled = DeliveryReminderScheduler.schedule(
        reactContext.applicationContext,
        scheduleId,
        title,
        scheduledForIso,
        leadMinutes,
      )
      Log.i(TAG, "logs.info delivery reminder requested scheduleId=$scheduleId")
      promise.resolve(scheduled)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder request failed", error)
      promise.reject("DELIVERY_REMINDER_SCHEDULE_FAILED", error)
    }
  }

  @ReactMethod
  fun cancelReminder(scheduleId: String, promise: Promise) {
    try {
      DeliveryReminderScheduler.cancel(reactContext.applicationContext, scheduleId)
      promise.resolve(true)
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder cancel failed", error)
      promise.reject("DELIVERY_REMINDER_CANCEL_FAILED", error)
    }
  }

  companion object {
    const val NAME = "DeliveryNotificationModule"
    private const val TAG = "DeliveryNotifModule"
  }
}
