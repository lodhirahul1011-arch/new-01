package com.dvaari.dvari.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.dvaari.dvari.BuildConfig
import org.json.JSONArray
import org.json.JSONObject

class SmsBroadcastReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != "android.provider.Telephony.SMS_RECEIVED") {
      return
    }

    try {
      val pdus = intent.extras?.get("pdus") as? Array<*> ?: return
      val format = intent.extras?.getString("format")

      val items = mutableListOf<JSONObject>()
      for (pdu in pdus) {
        val bytes = pdu as? ByteArray ?: continue
        val message =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            @Suppress("DEPRECATION")
            android.telephony.SmsMessage.createFromPdu(bytes, format)
          } else {
            @Suppress("DEPRECATION")
            android.telephony.SmsMessage.createFromPdu(bytes)
          } ?: continue

        val body = message.messageBody.orEmpty()
        val address = message.originatingAddress.orEmpty()
        val timestamp = message.timestampMillis

        if (body.isBlank()) continue

        items.add(
          JSONObject().apply {
            put("body", body)
            put("address", address)
            put("date", timestamp)
          }
        )
      }

      if (items.isEmpty()) return

      val prefs = context.getSharedPreferences(SmsBackgroundStore.PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(SmsBackgroundStore.KEY_PENDING_SMS, "[]") ?: "[]"
      val existing = try {
        JSONArray(raw)
      } catch (_: Exception) {
        JSONArray()
      }

      for (item in items) {
        existing.put(item)
      }

      prefs.edit()
        .putString(SmsBackgroundStore.KEY_PENDING_SMS, existing.toString())
        .apply()

      if (BuildConfig.DEBUG) {
        Log.d("SmsReceiver", "Queued ${items.size} SMS event(s) from background receiver")
      }

      SmsEventBridge.emitSmsChanged()
    } catch (error: Exception) {
      if (BuildConfig.DEBUG) {
        Log.d("SmsReceiver", "onReceive failed: ${error.message}")
      }
    }
  }
}
