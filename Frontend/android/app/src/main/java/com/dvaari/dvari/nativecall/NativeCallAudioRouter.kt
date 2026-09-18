package com.dvaari.dvari.nativecall

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log

object NativeCallAudioRouter {
  private const val TAG = "NativeCallAudioRouter"

  fun activateEarpiece(context: Context) {
    val audioManager = context.getSystemService(AudioManager::class.java) ?: return
    try {
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      audioManager.isSpeakerphoneOn = false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val bluetooth = if (hasBluetoothPermission(context)) {
          audioManager.availableCommunicationDevices.firstOrNull { isBluetooth(it) }
        } else {
          null
        }
        if (bluetooth != null) audioManager.setCommunicationDevice(bluetooth) else audioManager.clearCommunicationDevice()
      } else if (audioManager.isBluetoothScoAvailableOffCall) {
        audioManager.startBluetoothSco()
        audioManager.isBluetoothScoOn = true
      }
      Log.i(TAG, "native call route set to earpiece")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to activate native earpiece route", error)
    }
  }

  fun activateSpeaker(context: Context) {
    val audioManager = context.getSystemService(AudioManager::class.java) ?: return
    try {
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val speaker = audioManager.availableCommunicationDevices.firstOrNull {
          it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        }
        if (speaker != null) audioManager.setCommunicationDevice(speaker)
      }
      audioManager.isSpeakerphoneOn = true
      Log.i(TAG, "native call route set to speaker")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to activate native speaker route", error)
    }
  }

  fun release(context: Context) {
    val audioManager = context.getSystemService(AudioManager::class.java) ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.clearCommunicationDevice()
      }
      audioManager.stopBluetoothSco()
      audioManager.isBluetoothScoOn = false
      audioManager.isSpeakerphoneOn = false
      audioManager.mode = AudioManager.MODE_NORMAL
      Log.i(TAG, "native call audio route released")
    } catch (error: Throwable) {
      Log.e(TAG, "failed to release native call audio route", error)
    }
  }

  private fun hasBluetoothPermission(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
  }

  private fun isBluetooth(device: AudioDeviceInfo): Boolean {
    return device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
      device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        (device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
          device.type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
          device.type == AudioDeviceInfo.TYPE_BLE_BROADCAST))
  }
}
