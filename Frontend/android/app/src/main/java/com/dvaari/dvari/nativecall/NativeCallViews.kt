package com.dvaari.dvari.nativecall

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Path
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.TextView
import kotlin.math.min

object NativeCallColors {
  const val BG = 0xFF0B1518.toInt()
  const val AVATAR = 0xFF073544.toInt()
  const val CYAN = 0xFF55C7F4.toInt()
  const val RED = 0xFFF00646.toInt()
  const val GREEN = 0xFF20B461.toInt()
  const val PANEL = 0xFF172326.toInt()
}

class DoodleBackgroundView(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    alpha = 26
    style = Paint.Style.STROKE
    strokeWidth = 4f
    strokeCap = Paint.Cap.ROUND
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    canvas.drawColor(NativeCallColors.BG)
    val stepX = width / 3f
    val stepY = height / 6f
    for (row in 0..6) {
      for (col in 0..3) {
        val x = col * stepX + if (row % 2 == 0) 20f else stepX / 2f
        val y = row * stepY + 40f
        canvas.save()
        canvas.rotate(if ((row + col) % 2 == 0) -16f else 14f, x, y)
        canvas.drawCircle(x, y, 42f, paint)
        canvas.drawLine(x - 22f, y, x + 22f, y, paint)
        canvas.drawLine(x + 8f, y - 18f, x + 28f, y, paint)
        canvas.drawLine(x + 8f, y + 18f, x + 28f, y, paint)
        canvas.drawRect(RectF(x + 54f, y - 28f, x + 94f, y + 12f), paint)
        canvas.restore()
      }
    }
  }
}

class CircleButton(context: Context, color: Int, private val iconType: String) : View(context) {
  init {
    Log.i(TAG, "native call icon button created: $iconType")
  }

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color
    style = Paint.Style.FILL
  }
  private val icon = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = Color.WHITE
    style = Paint.Style.STROKE
    strokeWidth = 10f
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val iconFill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    this.color = Color.WHITE
    style = Paint.Style.FILL
  }

  override fun onDraw(canvas: Canvas) {
    try {
      val radius = min(width, height) / 2f
      canvas.drawCircle(width / 2f, height / 2f, radius, fill)
      when (iconType) {
        "answer" -> drawPhone(canvas, -18f)
        "decline" -> drawPhone(canvas, 135f)
        "hangup" -> drawHangup(canvas)
        "mute" -> drawMic(canvas)
        "speaker" -> drawSpeaker(canvas)
        else -> Log.e(TAG, "unknown native call icon type: $iconType")
      }
    } catch (error: Throwable) {
      Log.e(TAG, "failed to draw native call icon: $iconType", error)
    }
  }

  private fun drawPhone(canvas: Canvas, rotation: Float) {
    val cx = width / 2f
    val cy = height / 2f
    canvas.save()
    canvas.rotate(rotation, cx, cy)
    val handset = Path().apply {
      moveTo(cx - 23f, cy + 8f)
      cubicTo(cx - 14f, cy + 22f, cx + 14f, cy + 22f, cx + 23f, cy + 8f)
      cubicTo(cx + 26f, cy + 3f, cx + 23f, cy - 2f, cx + 17f, cy - 4f)
      lineTo(cx + 10f, cy - 6f)
      cubicTo(cx + 5f, cy - 7f, cx + 2f, cy - 4f, cx + 2f, cy + 1f)
      lineTo(cx + 2f, cy + 8f)
      cubicTo(cx - 1f, cy + 9f, cx + 1f, cy + 9f, cx - 2f, cy + 9f)
      cubicTo(cx - 5f, cy + 9f, cx - 3f, cy + 9f, cx - 6f, cy + 8f)
      lineTo(cx - 6f, cy + 1f)
      cubicTo(cx - 6f, cy - 4f, cx - 10f, cy - 7f, cx - 15f, cy - 6f)
      lineTo(cx - 22f, cy - 4f)
      cubicTo(cx - 28f, cy - 2f, cx - 30f, cy + 3f, cx - 23f, cy + 8f)
      close()
    }
    canvas.drawPath(handset, iconFill)
    canvas.restore()
  }

  private fun drawHangup(canvas: Canvas) {
    val cx = width / 2f
    val cy = height / 2f
    val handset = Path().apply {
      moveTo(cx - 28f, cy + 10f)
      cubicTo(cx - 14f, cy - 7f, cx + 14f, cy - 7f, cx + 28f, cy + 10f)
      cubicTo(cx + 32f, cy + 15f, cx + 30f, cy + 22f, cx + 24f, cy + 24f)
      lineTo(cx + 15f, cy + 27f)
      cubicTo(cx + 10f, cy + 28f, cx + 6f, cy + 25f, cx + 6f, cy + 20f)
      lineTo(cx + 6f, cy + 14f)
      cubicTo(cx + 2f, cy + 13f, cx - 2f, cy + 13f, cx - 6f, cy + 14f)
      lineTo(cx - 6f, cy + 20f)
      cubicTo(cx - 6f, cy + 25f, cx - 10f, cy + 28f, cx - 15f, cy + 27f)
      lineTo(cx - 24f, cy + 24f)
      cubicTo(cx - 30f, cy + 22f, cx - 32f, cy + 15f, cx - 28f, cy + 10f)
      close()
    }
    canvas.drawPath(handset, iconFill)
  }

  private fun drawSpeaker(canvas: Canvas) {
    val cx = width / 2f
    val cy = height / 2f
    val body = Path().apply {
      moveTo(cx - 28f, cy - 8f)
      lineTo(cx - 16f, cy - 8f)
      lineTo(cx + 4f, cy - 24f)
      lineTo(cx + 4f, cy + 24f)
      lineTo(cx - 16f, cy + 8f)
      lineTo(cx - 28f, cy + 8f)
      close()
    }
    canvas.drawPath(body, iconFill)
    icon.strokeWidth = 5f
    canvas.drawArc(RectF(cx + 8f, cy - 18f, cx + 34f, cy + 18f), -48f, 96f, false, icon)
    canvas.drawArc(RectF(cx + 14f, cy - 30f, cx + 50f, cy + 30f), -48f, 96f, false, icon)
  }

  private fun drawMic(canvas: Canvas) {
    val cx = width / 2f
    val cy = height / 2f
    icon.strokeWidth = 5f
    canvas.drawRoundRect(RectF(cx - 10f, cy - 30f, cx + 10f, cy + 12f), 10f, 10f, icon)
    canvas.drawArc(RectF(cx - 24f, cy - 4f, cx + 24f, cy + 38f), 18f, 144f, false, icon)
    canvas.drawLine(cx, cy + 38f, cx, cy + 50f, icon)
    canvas.drawLine(cx - 14f, cy + 50f, cx + 14f, cy + 50f, icon)
  }

  companion object {
    private const val TAG = "NativeCallViews"
  }
}

fun TextView.applyCallText(sizeSp: Float, color: Int, weight: Int = android.graphics.Typeface.BOLD) {
  textSize = sizeSp
  setTextColor(color)
  gravity = Gravity.CENTER
  typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, weight)
  includeFontPadding = true
}
