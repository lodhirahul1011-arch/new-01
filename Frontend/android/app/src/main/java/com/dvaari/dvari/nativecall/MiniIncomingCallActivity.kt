package com.dvaari.dvari.nativecall

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.atomic.AtomicBoolean

class MiniIncomingCallActivity : Activity() {
  private val actionInProgress = AtomicBoolean(false)
  private lateinit var callId: String
  private lateinit var callerName: String
  private var callerPhone: String? = null
  private var callType: String? = null

  private val endReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val state = intent.getStringExtra(NativeCallUiEvents.EXTRA_STATE).orEmpty()
      if (state == "ended") {
        Log.i(TAG, "mini native incoming call closed by call ended event: $callId")
        finish()
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureWindow()
    callId = intent.getStringExtra(NativeCallActions.EXTRA_CALL_ID).orEmpty()
    callerName = intent.getStringExtra(NativeCallActions.EXTRA_CALLER_NAME).orEmpty().ifBlank { "Visitor at Door" }
    callerPhone = intent.getStringExtra(NativeCallActions.EXTRA_CALLER_PHONE)
    callType = intent.getStringExtra(NativeCallActions.EXTRA_CALL_TYPE)
    Log.i(TAG, "mini native incoming call opened: $callId")
    registerReceiverCompat()
    setContentView(buildView())
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      unregisterReceiver(endReceiver)
    } catch (error: Throwable) {
      Log.e(TAG, "failed to unregister mini call receiver", error)
    }
  }

  private fun buildView(): View {
    val root = FrameLayout(this)
    root.setPadding(dp(8), dp(10), dp(8), 0)

    val card = LinearLayout(this)
    card.orientation = LinearLayout.VERTICAL
    card.setPadding(dp(14), dp(12), dp(14), dp(14))
    card.background = GradientDrawable().apply {
      cornerRadius = dp(28).toFloat()
      setColor(0xFF38393D.toInt())
    }
    root.addView(card, FrameLayout.LayoutParams(-1, dp(138), Gravity.TOP))

    val infoRow = LinearLayout(this)
    infoRow.orientation = LinearLayout.HORIZONTAL
    infoRow.gravity = Gravity.CENTER_VERTICAL
    card.addView(infoRow, LinearLayout.LayoutParams(-1, 0, 1f))

    val avatar = TextView(this)
    avatar.text = "V"
    avatar.applyCallText(25f, NativeCallColors.CYAN, Typeface.BOLD)
    avatar.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(NativeCallColors.AVATAR)
    }
    infoRow.addView(avatar, LinearLayout.LayoutParams(dp(48), dp(48)))

    val textColumn = LinearLayout(this)
    textColumn.orientation = LinearLayout.VERTICAL
    textColumn.gravity = Gravity.CENTER_VERTICAL
    val textColumnParams = LinearLayout.LayoutParams(0, -1, 1f)
    textColumnParams.leftMargin = dp(12)
    infoRow.addView(textColumn, textColumnParams)

    val titleRow = LinearLayout(this)
    titleRow.orientation = LinearLayout.HORIZONTAL
    titleRow.gravity = Gravity.CENTER_VERTICAL
    textColumn.addView(titleRow, LinearLayout.LayoutParams(-1, -2))

    val title = TextView(this)
    title.text = callerName
    title.applyCallText(18f, Color.WHITE, Typeface.BOLD)
    title.gravity = Gravity.LEFT
    title.maxLines = 1
    title.ellipsize = android.text.TextUtils.TruncateAt.END
    titleRow.addView(title, LinearLayout.LayoutParams(0, -2, 1f))

    val now = TextView(this)
    now.text = "now"
    now.applyCallText(13f, 0xB8FFFFFF.toInt(), Typeface.BOLD)
    titleRow.addView(now, LinearLayout.LayoutParams(-2, -2))

    val body = TextView(this)
    body.text = "Incoming voice call"
    body.applyCallText(16f, Color.WHITE, Typeface.BOLD)
    body.gravity = Gravity.LEFT
    body.maxLines = 1
    body.ellipsize = android.text.TextUtils.TruncateAt.END
    textColumn.addView(body, LinearLayout.LayoutParams(-1, -2))

    val actions = LinearLayout(this)
    actions.orientation = LinearLayout.HORIZONTAL
    val actionParams = LinearLayout.LayoutParams(-1, dp(48))
    actionParams.topMargin = dp(12)
    card.addView(actions, actionParams)

    actions.addView(actionButton("Decline", 0xFFEF6961.toInt()) { decline() }, LinearLayout.LayoutParams(0, -1, 1f))
    val gap = View(this)
    actions.addView(gap, LinearLayout.LayoutParams(dp(16), 1))
    actions.addView(actionButton("Answer", 0xFF5CC180.toInt()) { answer() }, LinearLayout.LayoutParams(0, -1, 1f))

    return root
  }

  private fun actionButton(label: String, color: Int, onClick: () -> Unit): TextView {
    return TextView(this).apply {
      text = label
      applyCallText(17f, Color.WHITE, Typeface.BOLD)
      background = GradientDrawable().apply {
        cornerRadius = dp(24).toFloat()
        setColor(color)
      }
      setOnClickListener { onClick() }
    }
  }

  private fun answer() {
    if (!actionInProgress.compareAndSet(false, true)) {
      Log.i(TAG, "mini native answer ignored because action is already in progress: $callId")
      return
    }
    Log.i(TAG, "answer tapped on mini native incoming call: $callId")
    NativeCallActionHandler.answer(applicationContext, callId, callerName, callerPhone, callType, launchActiveUi = true)
    finish()
  }

  private fun decline() {
    if (!actionInProgress.compareAndSet(false, true)) {
      Log.i(TAG, "mini native decline ignored because action is already in progress: $callId")
      return
    }
    Log.i(TAG, "decline tapped on mini native incoming call: $callId")
    NativeCallActionHandler.decline(applicationContext, callId)
    finish()
  }

  private fun configureWindow() {
    window.setGravity(Gravity.TOP or Gravity.CENTER_HORIZONTAL)
    window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
    window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
    window.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL)
  }

  private fun registerReceiverCompat() {
    val filter = IntentFilter(NativeCallUiEvents.ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(endReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(endReceiver, filter)
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val TAG = "MiniIncomingCallActivity"
    fun intent(context: Context, callId: String, callerName: String?, callerPhone: String?, callType: String?): Intent {
      return Intent(context, MiniIncomingCallActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        .putExtra(NativeCallActions.EXTRA_CALL_ID, callId)
        .putExtra(NativeCallActions.EXTRA_CALLER_NAME, callerName.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALLER_PHONE, callerPhone.orEmpty())
        .putExtra(NativeCallActions.EXTRA_CALL_TYPE, callType.orEmpty())
    }
  }
}
