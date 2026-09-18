package com.dvaari.dvari.nativecall

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

class NativeActiveCallActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var callId: String
  private lateinit var callerName: String
  private lateinit var statusText: TextView
  private var connectedAt = 0L
  private var ended = false

  private val tick = object : Runnable {
    override fun run() {
      if (connectedAt > 0L && !ended) {
        val elapsed = ((System.currentTimeMillis() - connectedAt) / 1000).toInt()
        statusText.text = formatDuration(elapsed)
      }
      handler.postDelayed(this, 1000)
    }
  }

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val state = intent.getStringExtra(NativeCallUiEvents.EXTRA_STATE).orEmpty()
      val error = intent.getStringExtra(NativeCallUiEvents.EXTRA_ERROR).orEmpty()
      Log.i(TAG, "native active call UI state=$state")
      when (state) {
        "connected" -> {
          if (connectedAt == 0L) connectedAt = System.currentTimeMillis()
          statusText.text = formatDuration(0)
        }
        "reconnecting" -> statusText.text = "Reconnecting..."
        "error" -> statusText.text = error.ifBlank { "Unable to connect the call." }
        "ended" -> {
          ended = true
          statusText.text = "Call ended"
          handler.postDelayed({ finish() }, 700)
        }
        else -> statusText.text = "Connecting..."
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureLockScreen()
    callId = intent.getStringExtra(NativeCallActions.EXTRA_CALL_ID).orEmpty()
    callerName = intent.getStringExtra(NativeCallActions.EXTRA_CALLER_NAME).orEmpty().ifBlank { "Visitor at Door" }
    Log.i(TAG, "native active call activity opened: $callId")
    setContentView(buildView())
    registerReceiverCompat()
    NativeCallNotifier.cancelIncomingCall(applicationContext, callId)
    NativeCallNotifier.showActiveCall(applicationContext, callId, callerName)
    NativeAudioCallManager.start(applicationContext, callId)
    handler.post(tick)
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      unregisterReceiver(receiver)
    } catch (_: Throwable) {
    }
    handler.removeCallbacks(tick)
  }

  private fun buildView(): FrameLayout {
    val root = FrameLayout(this)
    root.addView(DoodleBackgroundView(this), FrameLayout.LayoutParams(-1, -1))

    val content = LinearLayout(this)
    content.orientation = LinearLayout.VERTICAL
    content.gravity = Gravity.CENTER_HORIZONTAL
    content.setPadding(dp(28), dp(74), dp(28), dp(32))
    root.addView(content, FrameLayout.LayoutParams(-1, -1))

    val title = TextView(this)
    title.text = callerName
    title.applyCallText(26f, android.graphics.Color.WHITE, android.graphics.Typeface.BOLD)
    content.addView(title, LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT))

    statusText = TextView(this)
    statusText.text = "Connecting..."
    statusText.applyCallText(18f, 0x94FFFFFF.toInt(), android.graphics.Typeface.BOLD)
    val statusParams = LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT)
    statusParams.topMargin = dp(8)
    content.addView(statusText, statusParams)

    val spacerTop = FrameLayout(this)
    content.addView(spacerTop, LinearLayout.LayoutParams(1, 0, 1f))

    val avatarShell = FrameLayout(this)
    avatarShell.background = android.graphics.drawable.GradientDrawable().apply {
      shape = android.graphics.drawable.GradientDrawable.OVAL
      setColor(NativeCallColors.AVATAR)
    }
    val avatar = TextView(this)
    avatar.text = "V"
    avatar.applyCallText(92f, NativeCallColors.CYAN, android.graphics.Typeface.BOLD)
    avatarShell.addView(avatar, FrameLayout.LayoutParams(-1, -1))
    content.addView(avatarShell, LinearLayout.LayoutParams(dp(216), dp(216)))

    val spacerBottom = FrameLayout(this)
    content.addView(spacerBottom, LinearLayout.LayoutParams(1, 0, 1f))

    val controls = LinearLayout(this)
    controls.orientation = LinearLayout.HORIZONTAL
    controls.gravity = Gravity.CENTER
    controls.weightSum = 3f
    controls.setPadding(dp(22), dp(14), dp(22), dp(14))
    controls.background = android.graphics.drawable.GradientDrawable().apply {
      cornerRadius = dp(20).toFloat()
      setColor(0xF50D171A.toInt())
      setStroke(1, 0x10FFFFFF)
    }
    content.addView(controls, LinearLayout.LayoutParams(-1, dp(100)))

    controls.addView(control("mute", NativeCallColors.PANEL) {
      NativeAudioCallManager.toggleMute()
    }, LinearLayout.LayoutParams(0, -1, 1f))
    controls.addView(control("speaker", NativeCallColors.PANEL) {
      NativeAudioCallManager.toggleSpeaker(applicationContext)
    }, LinearLayout.LayoutParams(0, -1, 1f))
    controls.addView(control("hangup", NativeCallColors.RED) {
      endCall()
    }, LinearLayout.LayoutParams(0, -1, 1f))

    return root
  }

  private fun control(iconType: String, color: Int, onClick: () -> Unit): FrameLayout {
    val wrap = FrameLayout(this)
    val button = CircleButton(this, color, iconType)
    button.setOnClickListener { onClick() }
    val params = FrameLayout.LayoutParams(dp(70), dp(70), Gravity.CENTER)
    wrap.addView(button, params)
    Log.i(TAG, "native active call control created: $iconType")
    return wrap
  }

  private fun endCall() {
    if (ended) return
    ended = true
    statusText.text = "Call ended"
    Log.i(TAG, "hangup tapped on native active call: $callId")
    NativeAudioCallManager.endNativeCall(applicationContext, callId, notifyBackend = true)
    NativeCallNotifier.cancelActiveCall(applicationContext, callId)
    NativeCallStore.clearActiveCall(applicationContext, callId)
    handler.postDelayed({ finish() }, 250)
  }

  private fun registerReceiverCompat() {
    val filter = IntentFilter(NativeCallUiEvents.ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(receiver, filter)
    }
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

  private fun formatDuration(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return "%02d:%02d".format(mins, secs)
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val TAG = "NativeActiveCallActivity"
    fun intent(context: Context, callId: String, callerName: String?, callerPhone: String?, callType: String?): Intent {
      return Intent(context, NativeActiveCallActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        .putExtra(NativeCallActions.EXTRA_CALL_ID, callId)
        .putExtra(NativeCallActions.EXTRA_CALLER_NAME, callerName.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALLER_PHONE, callerPhone.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALL_TYPE, callType.orEmpty())
    }
  }
}
