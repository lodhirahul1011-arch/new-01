package com.dvaari.dvari

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CallRingtoneModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CallRingtone"

  companion object {
    private const val TAG = "CallRingtoneModule"
    private const val MAX_ALERT_DURATION_MS = 45_000L
    private var ringtone: Ringtone? = null
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val mainHandler = Handler(Looper.getMainLooper())
  }

  private val autoStopRunnable = Runnable {
    stopAlert()
  }

  private fun getDefaultRingtoneUri(): Uri? {
    return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
  }

  @ReactMethod
  fun playDefaultRingtone() {
    mainHandler.post {
      startAlert()
    }
  }

  private fun startAlert() {
    mainHandler.removeCallbacks(autoStopRunnable)
    val ringerMode = getRingerMode()
    if (ringerMode != AudioManager.RINGER_MODE_SILENT) {
      startVibration()
    } else {
      Log.i(TAG, "foreground call vibration skipped because phone is silent")
    }

    if (ringerMode != AudioManager.RINGER_MODE_NORMAL) {
      Log.i(TAG, "foreground call ringtone skipped because phone ringer mode=$ringerMode")
      mainHandler.postDelayed(autoStopRunnable, MAX_ALERT_DURATION_MS)
      return
    }

    if (mediaPlayer?.isPlaying == true || ringtone?.isPlaying == true) {
      Log.i(TAG, "foreground call ringtone already playing")
      return
    }

    val uri = getDefaultRingtoneUri()
    if (uri != null && startMediaPlayer(uri)) {
      mainHandler.postDelayed(autoStopRunnable, MAX_ALERT_DURATION_MS)
      return
    }

    startRingtoneFallback(uri)
    mainHandler.postDelayed(autoStopRunnable, MAX_ALERT_DURATION_MS)
  }

  private fun startMediaPlayer(uri: Uri): Boolean {
    return try {
      stopSoundOnly()

      val context = reactContext.applicationContext

      val player = MediaPlayer()
      player.setDataSource(context, uri)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        player.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
      } else {
        @Suppress("DEPRECATION")
        player.setAudioStreamType(AudioManager.STREAM_RING)
      }
      player.isLooping = true
      player.prepare()
      player.start()
      mediaPlayer = player
      Log.i(TAG, "foreground call media ringtone started")
      true
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call media ringtone failed", error)
      false
    }
  }

  private fun startRingtoneFallback(uri: Uri?) {
    try {
      val ringtoneUri = uri ?: return
      val nextRingtone = RingtoneManager.getRingtone(
        reactContext.applicationContext,
        ringtoneUri,
      ) ?: return

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        nextRingtone.audioAttributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        nextRingtone.isLooping = true
      }

      ringtone = nextRingtone
      nextRingtone.play()
      Log.i(TAG, "foreground call ringtone fallback started")
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call ringtone fallback failed", error)
    }
  }

  private fun startVibration() {
    try {
      val nextVibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = reactContext.applicationContext.getSystemService(
          Context.VIBRATOR_MANAGER_SERVICE,
        ) as VibratorManager
        manager.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        reactContext.applicationContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }

      vibrator = nextVibrator
      if (!nextVibrator.hasVibrator()) {
        Log.e(TAG, "foreground call vibration unavailable on this device")
        return
      }
      val pattern = longArrayOf(0, 900, 350, 900, 900)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        nextVibrator.vibrate(
          VibrationEffect.createWaveform(pattern, 1),
          callAlertAudioAttributes(),
        )
      } else {
        @Suppress("DEPRECATION")
        nextVibrator.vibrate(pattern, 1)
      }
      Log.i(TAG, "foreground call vibration started")
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call vibration failed", error)
    }
  }

  @ReactMethod
  fun stopDefaultRingtone() {
    mainHandler.postAtFrontOfQueue {
      stopAlert()
    }
  }

  private fun getRingerMode(): Int {
    return try {
      val audioManager = reactContext.applicationContext.getSystemService(
        Context.AUDIO_SERVICE,
      ) as? AudioManager
      val mode = audioManager?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
      Log.i(TAG, "foreground call ringer mode checked: $mode")
      mode
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call ringer mode check failed", error)
      AudioManager.RINGER_MODE_NORMAL
    }
  }

  private fun callAlertAudioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
  }

  private fun stopAlert() {
    mainHandler.removeCallbacks(autoStopRunnable)
    stopSoundOnly()

    try {
      vibrator?.cancel()
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call vibration stop failed", error)
    } finally {
      vibrator = null
    }
    Log.i(TAG, "foreground call alert stopped")
  }

  private fun stopSoundOnly() {
    try {
      mediaPlayer?.stop()
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call media stop failed", error)
    }
    try {
      mediaPlayer?.release()
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call media release failed", error)
    } finally {
      mediaPlayer = null
    }

    try {
      ringtone?.stop()
    } catch (error: Throwable) {
      Log.e(TAG, "foreground call ringtone stop failed", error)
    } finally {
      ringtone = null
    }
  }
}
