package com.dvaari.dvari.nativecall

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

object NativeCallAlert {
  private const val TAG = "NativeCallAlert"
  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private val autoStop = Runnable { stopInternal() }

  fun start(context: Context) {
    handler.post {
      try {
        handler.removeCallbacks(autoStop)
        val ringerMode = getRingerMode(context)
        if (ringerMode != AudioManager.RINGER_MODE_SILENT) {
          startVibration(context)
        } else {
          Log.i(TAG, "native call vibration skipped because phone is silent")
        }
        if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
          startSound(context)
        } else {
          Log.i(TAG, "native call ringtone skipped because phone ringer mode=$ringerMode")
        }
        handler.postDelayed(autoStop, 45_000)
        Log.i(TAG, "native call alert started")
      } catch (error: Throwable) {
        Log.e(TAG, "failed to start native call alert", error)
      }
    }
  }

  fun stop(context: Context) {
    try {
      if (Looper.myLooper() == Looper.getMainLooper()) {
        Log.i(TAG, "native call alert stop requested on main thread")
        stopInternal()
      } else {
        Log.i(TAG, "native call alert stop requested from background thread")
        handler.postAtFrontOfQueue { stopInternal() }
      }
    } catch (error: Throwable) {
      Log.e(TAG, "failed to request native call alert stop", error)
    }
  }

  private fun startSound(context: Context) {
    if (player?.isPlaying == true || ringtone?.isPlaying == true) return
    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      ?: return
    try {
      val nextPlayer = MediaPlayer()
      nextPlayer.setDataSource(context, uri)
      nextPlayer.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      nextPlayer.isLooping = true
      nextPlayer.prepare()
      nextPlayer.start()
      player = nextPlayer
    } catch (error: Throwable) {
      Log.e(TAG, "media player ringtone failed", error)
      ringtone = RingtoneManager.getRingtone(context, uri)
      ringtone?.play()
    }
  }

  private fun startVibration(context: Context) {
    val nextVibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
      manager.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    vibrator = nextVibrator
    if (!nextVibrator.hasVibrator()) {
      Log.e(TAG, "native call vibration unavailable on this device")
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
    Log.i(TAG, "native call vibration started")
  }

  private fun callAlertAudioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
  }

  private fun getRingerMode(context: Context): Int {
    return try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      val mode = audioManager?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
      Log.i(TAG, "native call ringer mode checked: $mode")
      mode
    } catch (error: Throwable) {
      Log.e(TAG, "failed to check native call ringer mode", error)
      AudioManager.RINGER_MODE_NORMAL
    }
  }

  private fun stopInternal() {
    handler.removeCallbacks(autoStop)
    try {
      player?.stop()
      player?.release()
    } catch (_: Throwable) {
    } finally {
      player = null
    }
    try {
      ringtone?.stop()
    } catch (_: Throwable) {
    } finally {
      ringtone = null
    }
    try {
      vibrator?.cancel()
    } catch (_: Throwable) {
    } finally {
      vibrator = null
    }
    Log.i(TAG, "native call alert stopped")
  }
}
