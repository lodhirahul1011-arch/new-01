package com.dvaari.dvari.deliverynotifications

import android.content.Context
import android.util.Log
import com.dvaari.dvari.nativecall.NativeCallStore
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.ZoneId

class DeliveryNotificationApiClient(private val context: Context) {
  private val tag = "DeliveryNotifApiClient"

  fun postNotification(
    hashedNotificationId: String,
    sourcePackage: String,
    postedAtMillis: Long,
    parsed: ParsedDeliveryNotification,
  ): JSONObject {
    val payload = JSONObject()
      .put("hashedNotificationId", hashedNotificationId)
      .put("sourcePackage", sourcePackage)
      .put("notificationPostedAt", java.time.Instant.ofEpochMilli(postedAtMillis).toString())
      .put("merchantName", parsed.merchantName)
      .put("productTitle", parsed.productTitle)
      .put("courierName", parsed.courierName)
      .put("orderTrackingId", parsed.orderTrackingId)
      .put("deliveryDate", parsed.deliveryDateIso)
      .put("deliveryTimeWindow", parsed.deliveryTimeWindow)
      .put("deliveryStatus", parsed.deliveryStatus)
      .put("needsConfirmation", parsed.needsConfirmation)
      .put("confidence", parsed.confidence)
      .put("timezone", ZoneId.systemDefault().id)
      .put("reminderLeadMinutes", DeliveryNotificationPrefs.getReminderLeadMinutes(context))
      .put("keywordMatches", org.json.JSONArray(parsed.keywordMatches))

    if (parsed.productTitle.isBlank()) {
      Log.e(tag, "logs.error posting delivery notification without product title")
    } else {
      Log.i(tag, "logs.info posting structured delivery notification productTitleLength=${parsed.productTitle.length}")
    }
    return request("POST", "/api/v1/sms/delivery-notifications", payload)
  }

  private fun request(
    method: String,
    path: String,
    body: JSONObject,
    retryAfterRefresh: Boolean = true,
  ): JSONObject {
    var accessToken = NativeCallStore.getAccessToken(context)
    if (accessToken.isBlank()) {
      accessToken = refreshAccessToken()
    }
    if (accessToken.isBlank()) {
      Log.e(tag, "logs.error missing native auth token for delivery notification")
      throw IllegalStateException("missing_native_access_token")
    }

    val connection = URL("${NativeCallStore.API_BASE_URL}$path").openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = method
      connection.connectTimeout = 10_000
      connection.readTimeout = 10_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $accessToken")
      connection.setRequestProperty("Accept", "application/json")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Cache-Control", "no-cache")
      connection.setRequestProperty("Pragma", "no-cache")
      OutputStreamWriter(connection.outputStream).use { writer ->
        writer.write(body.toString())
      }

      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()

      if (status == 401 && retryAfterRefresh) {
        Log.i(tag, "logs.info delivery notification unauthorized; refreshing token")
        val refreshed = refreshAccessToken()
        if (refreshed.isNotBlank()) {
          return request(method, path, body, retryAfterRefresh = false)
        }
      }

      if (status !in 200..299) {
        Log.e(tag, "logs.error delivery notification request failed status=$status body=$text")
        throw IllegalStateException("delivery_notification_http_$status")
      }

      if (text.isBlank()) JSONObject() else JSONObject(text)
    } finally {
      connection.disconnect()
    }
  }

  private fun refreshAccessToken(): String {
    val currentRefreshToken = NativeCallStore.getRefreshToken(context)
    if (currentRefreshToken.isBlank()) {
      Log.e(tag, "logs.error missing refresh token for delivery notification")
      return ""
    }

    val connection = URL("${NativeCallStore.API_BASE_URL}/api/v1/auth/refresh").openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 10_000
      connection.readTimeout = 10_000
      connection.doOutput = true
      connection.setRequestProperty("Accept", "application/json")
      connection.setRequestProperty("Content-Type", "application/json")
      OutputStreamWriter(connection.outputStream).use { writer ->
        writer.write(JSONObject().put("refreshToken", currentRefreshToken).toString())
      }

      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      if (status !in 200..299) {
        Log.e(tag, "logs.error delivery notification token refresh failed status=$status")
        return ""
      }

      val payload = if (text.isBlank()) JSONObject() else JSONObject(text)
      val nextAccessToken = payload.optString("accessToken", "").trim()
      val nextRefreshToken = payload.optString("refreshToken", currentRefreshToken).trim()
      if (nextAccessToken.isBlank()) {
        Log.e(tag, "logs.error delivery notification refresh missing access token")
        return ""
      }

      NativeCallStore.saveTokens(context, nextAccessToken, nextRefreshToken)
      Log.i(tag, "logs.info delivery notification auth token refreshed")
      nextAccessToken
    } catch (error: Throwable) {
      Log.e(tag, "logs.error delivery notification token refresh failed", error)
      ""
    } finally {
      connection.disconnect()
    }
  }
}
