package com.dvaari.dvari.nativecall

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.atomic.AtomicBoolean

class IncomingCallActivity : Activity() {
  private val actionInProgress = AtomicBoolean(false)
  private lateinit var callId: String
  private lateinit var callerName: String
  private var callerPhone: String? = null
  private var callType: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureLockScreen()
    callId = intent.getStringExtra(NativeCallActions.EXTRA_CALL_ID).orEmpty()
    callerName = intent.getStringExtra(NativeCallActions.EXTRA_CALLER_NAME).orEmpty().ifBlank { "Visitor at Door" }
    callerPhone = intent.getStringExtra(NativeCallActions.EXTRA_CALLER_PHONE)
    callType = intent.getStringExtra(NativeCallActions.EXTRA_CALL_TYPE)
    Log.i(TAG, "native incoming call activity opened: $callId")
    NativeCallAlert.start(applicationContext)
    setContentView(buildView())
  }

  private fun buildView(): FrameLayout {
    val root = FrameLayout(this)
    root.addView(DoodleBackgroundView(this), FrameLayout.LayoutParams(-1, -1))

    val content = LinearLayout(this)
    content.orientation = LinearLayout.VERTICAL
    content.gravity = Gravity.CENTER_HORIZONTAL
    content.setPadding(dp(28), dp(72), dp(28), dp(36))
    root.addView(content, FrameLayout.LayoutParams(-1, -1))

    val title = TextView(this)
    title.text = callerName
    title.applyCallText(34f, android.graphics.Color.WHITE, android.graphics.Typeface.BOLD)
    content.addView(title, LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT))

    val subtitle = TextView(this)
    subtitle.text = callerPhone?.takeIf { it.isNotBlank() } ?: if (callType == "delivery") "Delivery audio call" else "Doorbell audio call"
    subtitle.applyCallText(18f, 0xA3FFFFFF.toInt(), android.graphics.Typeface.BOLD)
    val subParams = LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT)
    subParams.topMargin = dp(8)
    content.addView(subtitle, subParams)

    val status = TextView(this)
    status.text = "Incoming voice call"
    status.applyCallText(15f, 0x80FFFFFF.toInt(), android.graphics.Typeface.BOLD)
    val statusParams = LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT)
    statusParams.topMargin = dp(10)
    content.addView(status, statusParams)

    val spacerTop = FrameLayout(this)
    content.addView(spacerTop, LinearLayout.LayoutParams(1, 0, 1f))

    val avatar = TextView(this)
    avatar.text = "V"
    avatar.applyCallText(92f, NativeCallColors.CYAN, android.graphics.Typeface.BOLD)
    avatar.setBackgroundColor(android.graphics.Color.TRANSPARENT)
    val avatarShell = FrameLayout(this)
    avatarShell.setBackgroundColor(NativeCallColors.AVATAR)
    avatarShell.clipToOutline = true
    avatarShell.background = android.graphics.drawable.GradientDrawable().apply {
      shape = android.graphics.drawable.GradientDrawable.OVAL
      setColor(NativeCallColors.AVATAR)
    }
    avatarShell.addView(avatar, FrameLayout.LayoutParams(-1, -1))
    val avatarParams = LinearLayout.LayoutParams(dp(216), dp(216))
    content.addView(avatarShell, avatarParams)

    val spacerBottom = FrameLayout(this)
    content.addView(spacerBottom, LinearLayout.LayoutParams(1, 0, 1f))

    val actions = LinearLayout(this)
    actions.orientation = LinearLayout.HORIZONTAL
    actions.gravity = Gravity.CENTER
    actions.weightSum = 2f
    content.addView(actions, LinearLayout.LayoutParams(-1, dp(132)))

    actions.addView(actionColumn("Decline", NativeCallColors.RED, "decline") { decline() }, LinearLayout.LayoutParams(0, -1, 1f))
    actions.addView(actionColumn("Answer", NativeCallColors.GREEN, "answer") { answer() }, LinearLayout.LayoutParams(0, -1, 1f))

    return root
  }

  private fun actionColumn(label: String, color: Int, icon: String, onClick: () -> Unit): LinearLayout {
    val column = LinearLayout(this)
    column.orientation = LinearLayout.VERTICAL
    column.gravity = Gravity.CENTER
    val button = CircleButton(this, color, icon)
    button.setOnClickListener { onClick() }
    column.addView(button, LinearLayout.LayoutParams(dp(78), dp(78)))
    val text = TextView(this)
    text.text = label
    text.applyCallText(16f, 0xADFFFFFF.toInt(), android.graphics.Typeface.BOLD)
    val textParams = LinearLayout.LayoutParams(-1, -2)
    textParams.topMargin = dp(14)
    column.addView(text, textParams)
    return column
  }

  private fun answer() {
    if (!actionInProgress.compareAndSet(false, true)) {
      Log.i(TAG, "native answer ignored because action is already in progress: $callId")
      return
    }
    Log.i(TAG, "answer tapped on native incoming call: $callId")
    NativeCallActionHandler.answer(applicationContext, callId, callerName, callerPhone, callType, launchActiveUi = true)
    finish()
  }

  private fun decline() {
    if (!actionInProgress.compareAndSet(false, true)) {
      Log.i(TAG, "native decline ignored because action is already in progress: $callId")
      return
    }
    Log.i(TAG, "decline tapped on native incoming call: $callId")
    NativeCallActionHandler.decline(applicationContext, callId)
    finish()
  }

  private fun configureLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
      )
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val TAG = "IncomingCallActivity"
    fun intent(context: Context, callId: String, callerName: String?, callerPhone: String?, callType: String?): Intent {
      return Intent(context, IncomingCallActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        .putExtra(NativeCallActions.EXTRA_CALL_ID, callId)
        .putExtra(NativeCallActions.EXTRA_CALLER_NAME, callerName.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALLER_PHONE, callerPhone.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALL_TYPE, callType.orEmpty())
    }
  }
}
