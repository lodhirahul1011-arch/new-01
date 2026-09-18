package com.dvaari.dvari.nativecall

import android.content.Context
import android.util.Log
import com.dvaari.dvari.BuildConfig

object NativeCallStore {
  private const val TAG = "NativeCallStore"
  private const val PREFS = "dvaari_native_call"
  private const val KEY_ACCESS_TOKEN = "accessToken"
  private const val KEY_REFRESH_TOKEN = "refreshToken"
  private const val KEY_AUTH_UPDATED_AT = "authUpdatedAt"
  private const val KEY_ACTIVE_CALL_ID = "activeCallId"
  val API_BASE_URL: String = BuildConfig.API_BASE_URL

  data class AuthTokens(
    val accessToken: String,
    val refreshToken: String,
    val updatedAt: Long,
  )

  fun saveTokens(context: Context, accessToken: String?, refreshToken: String?) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_ACCESS_TOKEN, accessToken.orEmpty())
        .putString(KEY_REFRESH_TOKEN, refreshToken.orEmpty())
        .putLong(KEY_AUTH_UPDATED_AT, System.currentTimeMillis())
        .apply()
      Log.i(TAG, "logs.info native call auth tokens saved")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error failed to save native call auth tokens", error)
    }
  }

  fun clearTokens(context: Context) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY_ACCESS_TOKEN)
        .remove(KEY_REFRESH_TOKEN)
        .remove(KEY_AUTH_UPDATED_AT)
        .apply()
      Log.i(TAG, "logs.info native call auth tokens cleared")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error failed to clear native call auth tokens", error)
    }
  }

  fun getAuthTokens(context: Context): AuthTokens {
    return try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val tokens = AuthTokens(
        accessToken = prefs.getString(KEY_ACCESS_TOKEN, "").orEmpty().trim(),
        refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "").orEmpty().trim(),
        updatedAt = prefs.getLong(KEY_AUTH_UPDATED_AT, 0L),
      )
      Log.i(
        TAG,
        "logs.info native call auth tokens read hasAccess=${tokens.accessToken.isNotBlank()} hasRefresh=${tokens.refreshToken.isNotBlank()} updatedAt=${tokens.updatedAt}",
      )
      tokens
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error failed to read native call auth tokens", error)
      AuthTokens("", "", 0L)
    }
  }

  fun getAccessToken(context: Context): String {
    return try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_ACCESS_TOKEN, "")
        .orEmpty()
        .trim()
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error failed to read native call access token", error)
      ""
    }
  }

  fun getRefreshToken(context: Context): String {
    return try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_REFRESH_TOKEN, "")
        .orEmpty()
        .trim()
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error failed to read native call refresh token", error)
      ""
    }
  }

  fun markActiveCall(context: Context, callId: String) {
    try {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_ACTIVE_CALL_ID, callId)
        .apply()
      Log.i(TAG, "native active call marked: $callId")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to mark native active call", error)
    }
  }

  fun clearActiveCall(context: Context, callId: String? = null) {
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val stored = prefs.getString(KEY_ACTIVE_CALL_ID, "").orEmpty()
      if (callId.isNullOrBlank() || stored == callId) {
        prefs.edit().remove(KEY_ACTIVE_CALL_ID).apply()
      }
      Log.i(TAG, "native active call cleared: ${callId.orEmpty()}")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to clear native active call", error)
    }
  }

  fun getActiveCallId(context: Context): String {
    return try {
      val activeCallId = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getString(KEY_ACTIVE_CALL_ID, "")
        .orEmpty()
        .trim()
      Log.i(TAG, "native active call read: $activeCallId")
      activeCallId
    } catch (error: Throwable) {
      Log.e(TAG, "failed to read native active call", error)
      ""
    }
  }

  fun hasDifferentActiveCall(context: Context, nextCallId: String?): Boolean {
    return try {
      val stored = getActiveCallId(context)
      val next = nextCallId.orEmpty().trim()
      val busy = stored.isNotBlank() && stored != next
      Log.i(TAG, "native active call busy check stored=$stored next=$next busy=$busy")
      busy
    } catch (error: Throwable) {
      Log.e(TAG, "failed to check native active call busy state", error)
      false
    }
  }
}
