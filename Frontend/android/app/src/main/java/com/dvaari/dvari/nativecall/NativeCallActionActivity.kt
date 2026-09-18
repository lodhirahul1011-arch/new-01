package com.dvaari.dvari.nativecall

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log

class NativeCallActionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handle(intent)
    finish()
    overridePendingTransition(0, 0)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handle(intent)
    finish()
    overridePendingTransition(0, 0)
  }

  private fun handle(intent: Intent?) {
    val action = intent?.getStringExtra(NativeCallActions.ACTION).orEmpty()
    val callId = intent?.getStringExtra(NativeCallActions.EXTRA_CALL_ID).orEmpty()
    val callerName = intent?.getStringExtra(NativeCallActions.EXTRA_CALLER_NAME).orEmpty().ifBlank { "Visitor at Door" }
    val callerPhone = intent?.getStringExtra(NativeCallActions.EXTRA_CALLER_PHONE)
    val callType = intent?.getStringExtra(NativeCallActions.EXTRA_CALL_TYPE)

    Log.i(TAG, "native call action activity opened action=$action callId=$callId")
    when (action) {
      NativeCallActions.ANSWER -> NativeCallActionHandler.answer(
        applicationContext,
        callId,
        callerName,
        callerPhone,
        callType,
        launchActiveUi = true,
      )
      NativeCallActions.DECLINE -> NativeCallActionHandler.decline(applicationContext, callId)
      else -> Log.e(TAG, "unknown native call action activity action=$action")
    }
  }

  companion object {
    private const val TAG = "NativeCallActionActivity"

    fun intent(
      context: Context,
      action: String,
      callId: String,
      callerName: String?,
      callerPhone: String?,
      callType: String?,
    ): Intent {
      return Intent(context, NativeCallActionActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        .putExtra(NativeCallActions.ACTION, action)
        .putExtra(NativeCallActions.EXTRA_CALL_ID, callId)
        .putExtra(NativeCallActions.EXTRA_CALLER_NAME, callerName.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALLER_PHONE, callerPhone.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALL_TYPE, callType.orEmpty())
    }
  }
}
