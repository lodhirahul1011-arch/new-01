package com.dvaari.dvari.nativecall

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class NativeCallState(
  val id: String,
  val state: String,
)

data class NativeIceCandidate(
  val from: String,
  val candidate: String,
  val sdpMid: String?,
  val sdpMLineIndex: Int?,
)

data class NativeSignalingState(
  val answerSdp: String,
  val iceCandidates: List<NativeIceCandidate>,
)

class NativeTabletCallClient(private val context: Context) {
  private val tag = "NativeTabletCallClient"

  private fun token(): String = NativeCallStore.getAccessToken(context)
  private fun refreshToken(): String = NativeCallStore.getRefreshToken(context)

  private fun endpoint(path: String): String {
    return "${NativeCallStore.API_BASE_URL}$path"
  }

  private fun request(
    method: String,
    path: String,
    body: JSONObject? = null,
    retryAfterRefresh: Boolean = true,
  ): JSONObject {
    var accessToken = token()
    if (accessToken.isBlank()) {
      Log.i(tag, "native access token missing; trying refresh before $path")
      accessToken = refreshAccessToken()
      if (accessToken.isBlank()) {
        Log.e(tag, "missing native access token for $path")
        throw IllegalStateException("missing_native_access_token")
      }
    }

    val connection = URL(endpoint(path)).openConnection() as HttpURLConnection
    connection.requestMethod = method
    connection.connectTimeout = 10_000
    connection.readTimeout = 10_000
    connection.setRequestProperty("Authorization", "Bearer $accessToken")
    connection.setRequestProperty("Accept", "application/json")
    connection.setRequestProperty("Cache-Control", "no-cache")
    connection.setRequestProperty("Pragma", "no-cache")

    if (body != null) {
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      OutputStreamWriter(connection.outputStream).use { writer ->
        writer.write(body.toString())
      }
    }

    val status = connection.responseCode
    val stream = if (status in 200..299) connection.inputStream else connection.errorStream
    val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
    connection.disconnect()

    if (status == 401 && retryAfterRefresh) {
      Log.i(tag, "native call request unauthorized; refreshing token and retrying $method $path")
      val refreshedAccessToken = refreshAccessToken()
      if (refreshedAccessToken.isNotBlank()) {
        return request(method, path, body, retryAfterRefresh = false)
      }
    }

    if (status !in 200..299) {
      Log.e(tag, "request failed $method $path status=$status body=$text")
      throw IllegalStateException("native_call_http_$status")
    }

    return if (text.isBlank()) JSONObject() else JSONObject(text)
  }

  private fun refreshAccessToken(): String {
    val currentRefreshToken = refreshToken()
    if (currentRefreshToken.isBlank()) {
      Log.e(tag, "missing native refresh token")
      return ""
    }

    val connection = URL(endpoint("/api/v1/auth/refresh")).openConnection() as HttpURLConnection
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
        Log.e(tag, "native token refresh failed status=$status body=$text")
        return ""
      }

      val payload = if (text.isBlank()) JSONObject() else JSONObject(text)
      val nextAccessToken = payload.optString("accessToken", "").trim()
      val nextRefreshToken = payload.optString("refreshToken", currentRefreshToken).trim()
      if (nextAccessToken.isBlank()) {
        Log.e(tag, "native token refresh response missing access token")
        return ""
      }

      NativeCallStore.saveTokens(context, nextAccessToken, nextRefreshToken)
      Log.i(tag, "native access token refreshed for background call")
      nextAccessToken
    } catch (error: Throwable) {
      Log.e(tag, "native token refresh failed", error)
      ""
    } finally {
      connection.disconnect()
    }
  }

  fun answer(callId: String) {
    Log.i(tag, "answering native call $callId")
    request(
      "POST",
      "/api/v1/tablet/calls/${encode(callId)}/answer",
      JSONObject().put("liveVideoRequested", false),
    )
  }

  fun reject(callId: String, reason: String = "rejected_from_native_call") {
    Log.i(tag, "rejecting native call $callId")
    request(
      "POST",
      "/api/v1/tablet/calls/${encode(callId)}/reject",
      JSONObject().put("reason", reason),
    )
  }

  fun end(callId: String, reason: String = "ended_from_native_call") {
    Log.i(tag, "ending native call $callId")
    request(
      "POST",
      "/api/v1/tablet/calls/${encode(callId)}/end",
      JSONObject().put("reason", reason),
    )
  }

  fun getCall(callId: String): NativeCallState {
    val data = request(
      "GET",
      "/api/v1/tablet/calls/${encode(callId)}?t=${System.currentTimeMillis()}",
    ).optJSONObject("data") ?: JSONObject()
    return NativeCallState(
      id = data.optString("id", callId),
      state = data.optString("state", ""),
    )
  }

  fun getSignaling(callId: String): NativeSignalingState {
    val data = request(
      "GET",
      "/api/v1/tablet/calls/${encode(callId)}/signaling",
    ).optJSONObject("data") ?: JSONObject()
    val candidates = mutableListOf<NativeIceCandidate>()
    val array = data.optJSONArray("iceCandidates") ?: JSONArray()
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      candidates.add(
        NativeIceCandidate(
          from = item.optString("from", ""),
          candidate = item.optString("candidate", ""),
          sdpMid = item.optString("sdpMid", "").ifBlank { null },
          sdpMLineIndex = if (item.has("sdpMLineIndex")) item.optInt("sdpMLineIndex") else null,
        ),
      )
    }
    return NativeSignalingState(
      answerSdp = data.optString("answerSdp", ""),
      iceCandidates = candidates,
    )
  }

  fun sendOffer(callId: String, sdp: String) {
    Log.i(tag, "sending native offer for $callId")
    sendSignal(
      callId,
      JSONObject()
        .put("signalType", "offer")
        .put("sdp", normalizeSdp(sdp)),
    )
  }

  fun sendIceCandidate(callId: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int?) {
    val payload = JSONObject()
      .put("signalType", "ice_candidate")
      .put("candidate", candidate)
      .put("sdpMid", sdpMid.orEmpty())
    if (sdpMLineIndex != null) {
      payload.put("sdpMLineIndex", sdpMLineIndex)
    }
    sendSignal(callId, payload)
  }

  private fun sendSignal(callId: String, payload: JSONObject) {
    request("POST", "/api/v1/tablet/calls/${encode(callId)}/signal", payload)
  }

  private fun normalizeSdp(sdp: String): String {
    val lines = sdp.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return lines.filter { it.isNotBlank() }.joinToString("\r\n") + "\r\n"
  }

  private fun encode(value: String): String {
    return java.net.URLEncoder.encode(value, "UTF-8")
  }
}
