package com.dvaari.dvari

import android.Manifest
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.content.pm.PackageManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LiveFeedAudioModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LiveFeedAudio"

  private fun hasBluetoothConnectPermission(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      reactContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
  }

  private fun isBluetoothDevice(device: AudioDeviceInfo): Boolean {
    return when (device.type) {
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> true
      else -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
            device.type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
            device.type == AudioDeviceInfo.TYPE_BLE_BROADCAST
        } else {
          false
        }
      }
    }
  }

  @ReactMethod
  fun activateMediaSpeaker() {
    activateCallSpeaker()
  }

  @ReactMethod
  fun activateCallEarpiece() {
    val audioManager = reactContext.getSystemService(AudioManager::class.java) ?: return

    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    audioManager.isSpeakerphoneOn = false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val bluetoothDevice = if (hasBluetoothConnectPermission()) {
          audioManager.availableCommunicationDevices.firstOrNull { device ->
            isBluetoothDevice(device)
          }
        } else {
          null
        }

        if (bluetoothDevice != null) {
          audioManager.setCommunicationDevice(bluetoothDevice)
        } else {
          audioManager.clearCommunicationDevice()
        }
      } catch (_: Throwable) {
        // Keep the default communication route if Bluetooth route selection is unavailable.
        audioManager.clearCommunicationDevice()
      }
    } else {
      try {
        if (audioManager.isBluetoothScoAvailableOffCall) {
          audioManager.startBluetoothSco()
          audioManager.isBluetoothScoOn = true
        }
      } catch (_: Throwable) {
        // Keep the default communication route if SCO cannot start.
        audioManager.isBluetoothScoOn = false
      }
    }

    reactApplicationContext.currentActivity?.setVolumeControlStream(AudioManager.STREAM_VOICE_CALL)
  }

  @ReactMethod
  fun activateCallSpeaker() {
    val audioManager = reactContext.getSystemService(AudioManager::class.java) ?: return

    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val speakerDevice = audioManager.availableCommunicationDevices.firstOrNull { device ->
          device.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        }

        if (speakerDevice != null) {
          audioManager.setCommunicationDevice(speakerDevice)
        }
      } catch (_: Throwable) {
        // Fall back to the legacy speakerphone switch below.
      }
    }

    audioManager.isSpeakerphoneOn = true
    reactApplicationContext.currentActivity?.setVolumeControlStream(AudioManager.STREAM_VOICE_CALL)
  }

  @ReactMethod
  fun releaseMediaSpeaker() {
    val audioManager = reactContext.getSystemService(AudioManager::class.java) ?: return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        audioManager.clearCommunicationDevice()
      } catch (_: Throwable) {
        // ignore
      }
    }

    try {
      audioManager.stopBluetoothSco()
    } catch (_: Throwable) {
      // ignore
    }

    audioManager.isBluetoothScoOn = false
    audioManager.isSpeakerphoneOn = false
    audioManager.mode = AudioManager.MODE_NORMAL
    reactApplicationContext.currentActivity?.setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE)
  }
}
