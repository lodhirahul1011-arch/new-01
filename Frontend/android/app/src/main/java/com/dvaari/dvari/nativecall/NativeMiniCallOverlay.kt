package com.dvaari.dvari.nativecall

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

object NativeMiniCallOverlay {
  private const val TAG = "NativeMiniCallOverlay"
  private val handler = Handler(Looper.getMainLooper())
  private var overlayView: View? = null
  private var currentCallId = ""
  private val actionInProgress = AtomicBoolean(false)

  fun canDrawOverlays(context: Context): Boolean {
    return try {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    } catch (error: Throwable) {
      Log.e(TAG, "failed to check overlay permission", error)
      false
    }
  }

  fun overlaySettingsIntent(context: Context): Intent {
    return Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  fun show(
    context: Context,
    callId: String,
    callerName: String,
    callerPhone: String?,
    callType: String?,
  ): Boolean {
    val appContext = context.applicationContext
    if (callId.isBlank()) {
      Log.e(TAG, "cannot show mini overlay without call id")
      return false
    }
    if (!canDrawOverlays(appContext)) {
      Log.e(TAG, "mini overlay permission missing")
      return false
    }

    val overlayShown = AtomicBoolean(false)
    val latch = CountDownLatch(1)
    val showOverlay = Runnable {
      try {
        hide(appContext, callId = null)
        val manager = appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val nextView = buildView(appContext, callId, callerName, callerPhone, callType)
        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          overlayType(),
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
          PixelFormat.TRANSLUCENT,
        ).apply {
          gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
          x = 0
          y = statusBarOffset(appContext)
        }
        manager.addView(nextView, params)
        overlayView = nextView
        currentCallId = callId
        actionInProgress.set(false)
        overlayShown.set(true)
        Log.i(TAG, "mini call overlay shown: $callId")
      } catch (error: Throwable) {
        Log.e(TAG, "failed to show mini call overlay", error)
      } finally {
        latch.countDown()
      }
    }

    if (Looper.myLooper() == Looper.getMainLooper()) {
      Log.i(TAG, "showing mini call overlay on main thread: $callId")
      showOverlay.run()
      return overlayShown.get()
    }

    handler.post(showOverlay)
    return try {
      val completed = latch.await(750, TimeUnit.MILLISECONDS)
      if (!completed) {
        Log.e(TAG, "mini call overlay timed out before it could be shown: $callId")
      }
      overlayShown.get()
    } catch (error: Throwable) {
      Log.e(TAG, "mini call overlay wait failed", error)
      false
    }
  }

  fun hide(context: Context, callId: String? = null) {
    val hideOverlay = Runnable {
      try {
        if (!callId.isNullOrBlank() && currentCallId != callId) {
          Log.i(TAG, "skip hiding mini overlay for different call: $callId")
          return@Runnable
        }
        val view = overlayView
        if (view == null) {
          Log.i(TAG, "mini call overlay already hidden")
          return@Runnable
        }
        val manager = context.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        manager.removeView(view)
        overlayView = null
        currentCallId = ""
        actionInProgress.set(false)
        Log.i(TAG, "mini call overlay hidden")
      } catch (error: Throwable) {
        Log.e(TAG, "failed to hide mini call overlay", error)
      }
    }

    if (Looper.myLooper() == Looper.getMainLooper()) {
      Log.i(TAG, "hiding mini call overlay on main thread")
      hideOverlay.run()
    } else {
      handler.post(hideOverlay)
    }
  }

  private fun buildView(
    context: Context,
    callId: String,
    callerName: String,
    callerPhone: String?,
    callType: String?,
  ): View {
    val root = FrameLayout(context)
    root.setPadding(dp(context, 8), dp(context, 8), dp(context, 8), 0)
    root.setOnClickListener {
      openFullScreenIncomingCall(context, callId, callerName, callerPhone, callType)
    }

    val card = LinearLayout(context)
    card.orientation = LinearLayout.VERTICAL
    card.setPadding(dp(context, 14), dp(context, 12), dp(context, 14), dp(context, 14))
    card.setOnClickListener {
      openFullScreenIncomingCall(context, callId, callerName, callerPhone, callType)
    }
    card.background = GradientDrawable().apply {
      cornerRadius = dp(context, 28).toFloat()
      setColor(0xFF38393D.toInt())
    }
    root.addView(card, FrameLayout.LayoutParams(-1, dp(context, 138), Gravity.TOP))

    val infoRow = LinearLayout(context)
    infoRow.orientation = LinearLayout.HORIZONTAL
    infoRow.gravity = Gravity.CENTER_VERTICAL
    card.addView(infoRow, LinearLayout.LayoutParams(-1, 0, 1f))

    val avatar = TextView(context)
    avatar.text = "V"
    avatar.applyCallText(25f, NativeCallColors.CYAN, Typeface.BOLD)
    avatar.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(NativeCallColors.AVATAR)
    }
    infoRow.addView(avatar, LinearLayout.LayoutParams(dp(context, 48), dp(context, 48)))

    val textColumn = LinearLayout(context)
    textColumn.orientation = LinearLayout.VERTICAL
    textColumn.gravity = Gravity.CENTER_VERTICAL
    val textParams = LinearLayout.LayoutParams(0, -1, 1f)
    textParams.leftMargin = dp(context, 12)
    infoRow.addView(textColumn, textParams)

    val titleRow = LinearLayout(context)
    titleRow.orientation = LinearLayout.HORIZONTAL
    titleRow.gravity = Gravity.CENTER_VERTICAL
    textColumn.addView(titleRow, LinearLayout.LayoutParams(-1, -2))

    val title = TextView(context)
    title.text = callerName.ifBlank { "Visitor at Door" }
    title.applyCallText(18f, Color.WHITE, Typeface.BOLD)
    title.gravity = Gravity.LEFT
    title.maxLines = 1
    title.ellipsize = android.text.TextUtils.TruncateAt.END
    titleRow.addView(title, LinearLayout.LayoutParams(0, -2, 1f))

    val now = TextView(context)
    now.text = "now"
    now.applyCallText(13f, 0xB8FFFFFF.toInt(), Typeface.BOLD)
    titleRow.addView(now, LinearLayout.LayoutParams(-2, -2))

    val body = TextView(context)
    body.text = "Incoming voice call"
    body.applyCallText(16f, Color.WHITE, Typeface.BOLD)
    body.gravity = Gravity.LEFT
    body.maxLines = 1
    body.ellipsize = android.text.TextUtils.TruncateAt.END
    textColumn.addView(body, LinearLayout.LayoutParams(-1, -2))

    val actions = LinearLayout(context)
    actions.orientation = LinearLayout.HORIZONTAL
    val actionParams = LinearLayout.LayoutParams(-1, dp(context, 48))
    actionParams.topMargin = dp(context, 12)
    card.addView(actions, actionParams)

    actions.addView(actionButton(context, "Decline", 0xFFEF6961.toInt()) {
      decline(context, callId)
    }, LinearLayout.LayoutParams(0, -1, 1f))
    actions.addView(View(context), LinearLayout.LayoutParams(dp(context, 16), 1))
    actions.addView(actionButton(context, "Answer", 0xFF5CC180.toInt()) {
      answer(context, callId, callerName, callerPhone, callType)
    }, LinearLayout.LayoutParams(0, -1, 1f))

    return root
  }

  private fun actionButton(context: Context, label: String, color: Int, onClick: () -> Unit): TextView {
    return TextView(context).apply {
      text = label
      applyCallText(17f, Color.WHITE, Typeface.BOLD)
      background = GradientDrawable().apply {
        cornerRadius = dp(context, 24).toFloat()
        setColor(color)
      }
      setOnClickListener { view ->
        Log.i(TAG, "mini overlay action tapped: $label")
        view.isPressed = true
        onClick()
      }
    }
  }

  private fun openFullScreenIncomingCall(
    context: Context,
    callId: String,
    callerName: String,
    callerPhone: String?,
    callType: String?,
  ) {
    val appContext = context.applicationContext
    try {
      Log.i(TAG, "mini overlay body tapped; opening full-screen incoming call: $callId")
      hide(appContext, callId)
      appContext.startActivity(
        IncomingCallActivity.intent(appContext, callId, callerName, callerPhone, callType),
      )
    } catch (error: Throwable) {
      Log.e(TAG, "failed to open full-screen incoming call from mini overlay", error)
    }
  }

  private fun answer(
    context: Context,
    callId: String,
    callerName: String,
    callerPhone: String?,
    callType: String?,
  ) {
    val appContext = context.applicationContext
    if (!actionInProgress.compareAndSet(false, true)) {
      Log.i(TAG, "mini overlay answer ignored because action is already in progress: $callId")
      return
    }
    try {
      Log.i(TAG, "answer tapped on mini overlay: $callId")
      NativeCallActionHandler.answer(appContext, callId, callerName, callerPhone, callType, launchActiveUi = true)
      hide(appContext, callId)
    } catch (error: Throwable) {
      Log.e(TAG, "mini overlay answer failed", error)
    }
  }

  private fun decline(context: Context, callId: String) {
    val appContext = context.applicationContext
    if (!actionInProgress.compareAndSet(false, true)) {
      Log.i(TAG, "mini overlay decline ignored because action is already in progress: $callId")
      return
    }
    try {
      Log.i(TAG, "decline tapped on mini overlay: $callId")
      NativeCallActionHandler.decline(appContext, callId)
      hide(appContext, callId)
    } catch (error: Throwable) {
      Log.e(TAG, "mini overlay decline failed", error)
    }
  }

  private fun overlayType(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
  }

  private fun dp(context: Context, value: Int): Int {
    return (value * context.resources.displayMetrics.density).toInt()
  }

  private fun statusBarOffset(context: Context): Int {
    return try {
      val resourceId = context.resources.getIdentifier("status_bar_height", "dimen", "android")
      val statusBarHeight = if (resourceId > 0) {
        context.resources.getDimensionPixelSize(resourceId)
      } else {
        0
      }
      val offset = statusBarHeight + dp(context, 10)
      Log.i(TAG, "mini overlay top offset calculated: $offset")
      offset
    } catch (error: Throwable) {
      Log.e(TAG, "failed to calculate mini overlay top offset", error)
      dp(context, 34)
    }
  }
}
