package com.dvaari.dvari.nativecall

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.util.Log
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

object NativeAudioCallManager {
  private const val TAG = "NativeAudioCallManager"
  private val terminalStates = setOf("declined", "ended", "missed", "failed", "paused")
  private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
  private var factoryInitialized = false
  private var factory: PeerConnectionFactory? = null
  private var peerConnection: PeerConnection? = null
  private var audioSource: AudioSource? = null
  private var audioTrack: AudioTrack? = null
  private var pollFuture: ScheduledFuture<*>? = null
  @Volatile private var currentCallId = ""
  private var sentOfferSdp = ""
  private var appliedAnswerSdp = ""
  private var muted = false
  private var speaker = false
  private val appliedIce = mutableSetOf<String>()

  fun start(context: Context, callId: String) {
    val appContext = context.applicationContext
    executor.execute {
      try {
        if (currentCallId == callId && peerConnection != null) {
          Log.i(TAG, "native audio call already active: $callId")
          return@execute
        }
        cleanup(appContext, notifyEnded = false)
        currentCallId = callId
        NativeCallStore.markActiveCall(appContext, callId)
        NativeCallAudioRouter.activateEarpiece(appContext)
        ensureFactory(appContext)
        ensurePeerConnection(appContext, callId)
        schedulePoll(appContext, 40)
        broadcast(appContext, "connecting", "")
        Log.i(TAG, "native audio call started: $callId")
      } catch (error: Throwable) {
        Log.e(TAG, "failed to start native audio call", error)
        broadcast(appContext, "error", error.message.orEmpty())
      }
    }
  }

  fun endNativeCall(context: Context, callId: String, notifyBackend: Boolean) {
    val appContext = context.applicationContext
    executor.execute {
      try {
        if (notifyBackend && callId.isNotBlank()) {
          NativeTabletCallClient(appContext).end(callId)
        }
      } catch (error: Throwable) {
        Log.e(TAG, "failed to notify backend for native call end", error)
      } finally {
        cleanup(appContext, notifyEnded = true)
        NativeCallNotifier.cancelIncomingCall(appContext, callId)
        NativeCallNotifier.cancelActiveCall(appContext, callId)
        NativeCallStore.clearActiveCall(appContext, callId)
      }
    }
  }

  fun isManagingCall(callId: String?): Boolean {
    val normalizedCallId = callId.orEmpty().trim()
    val managing = normalizedCallId.isNotBlank() && currentCallId == normalizedCallId && peerConnection != null
    Log.i(TAG, "native active manager check callId=$normalizedCallId currentCallId=$currentCallId managing=$managing")
    return managing
  }

  fun hasActiveCall(): Boolean {
    val active = currentCallId.isNotBlank() && peerConnection != null
    Log.i(TAG, "native manager active check currentCallId=$currentCallId active=$active")
    return active
  }

  fun toggleMute() {
    executor.execute {
      muted = !muted
      audioTrack?.setEnabled(!muted)
      Log.i(TAG, "native mute toggled: $muted")
    }
  }

  fun toggleSpeaker(context: Context) {
    val appContext = context.applicationContext
    executor.execute {
      speaker = !speaker
      if (speaker) {
        NativeCallAudioRouter.activateSpeaker(appContext)
      } else {
        NativeCallAudioRouter.activateEarpiece(appContext)
      }
      Log.i(TAG, "native speaker toggled: $speaker")
    }
  }

  private fun poll(context: Context) {
    try {
      val callId = currentCallId
      if (callId.isBlank()) return

      val client = NativeTabletCallClient(context)
      val call = client.getCall(callId)
      if (terminalStates.contains(call.state)) {
        Log.i(TAG, "native call terminal remote state=${call.state} callId=$callId")
        finishRemoteEndedCall(context, callId)
        return
      }

      val pc = ensurePeerConnection(context, callId)
      val signaling = client.getSignaling(callId)

      if (sentOfferSdp.isBlank()) {
        pc.createOffer(object : SimpleSdpObserver() {
          override fun onCreateSuccess(description: SessionDescription) {
            executor.execute {
              try {
                if (currentCallId != callId || peerConnection == null) return@execute
                pc.setLocalDescription(object : SimpleSdpObserver() {
                  override fun onSetSuccess() {
                    executor.execute {
                      try {
                        val sdp = pc.localDescription?.description ?: description.description
                        client.sendOffer(callId, sdp)
                        sentOfferSdp = sdp.ifBlank { "__empty_offer__" }
                        broadcast(context, "connecting", "")
                        schedulePoll(context, 220)
                      } catch (error: Throwable) {
                        Log.e(TAG, "failed to send native offer", error)
                        schedulePoll(context, 700)
                      }
                    }
                  }
                }, description)
              } catch (error: Throwable) {
                Log.e(TAG, "failed to set native local description", error)
                schedulePoll(context, 700)
              }
            }
          }
        }, offerConstraints())
        return
      }

      if (signaling.answerSdp.isNotBlank() && appliedAnswerSdp != signaling.answerSdp) {
        pc.setRemoteDescription(
          object : SimpleSdpObserver() {
            override fun onSetSuccess() {
              executor.execute {
                appliedAnswerSdp = signaling.answerSdp
                broadcast(context, "connected", "")
                if (speaker) NativeCallAudioRouter.activateSpeaker(context) else NativeCallAudioRouter.activateEarpiece(context)
                Log.i(TAG, "native answer SDP applied: $callId")
              }
            }
          },
          SessionDescription(SessionDescription.Type.ANSWER, signaling.answerSdp),
        )
      }

      for (candidate in signaling.iceCandidates) {
        if (candidate.from != "tablet" || candidate.candidate.isBlank()) continue
        val key = "${candidate.from}|${candidate.sdpMid}|${candidate.sdpMLineIndex}|${candidate.candidate}"
        if (appliedIce.contains(key)) continue
        try {
          pc.addIceCandidate(
            IceCandidate(candidate.sdpMid, candidate.sdpMLineIndex ?: 0, candidate.candidate),
          )
          appliedIce.add(key)
        } catch (error: Throwable) {
          Log.e(TAG, "failed to apply native remote ICE", error)
        }
      }

      schedulePoll(context, if (call.state == "answered") 650 else 220)
    } catch (error: Throwable) {
      Log.e(TAG, "native audio poll failed", error)
      broadcast(context, "reconnecting", "")
      schedulePoll(context, 700)
    }
  }

  private fun ensureFactory(context: Context): PeerConnectionFactory {
    val existingFactory = factory
    if (existingFactory != null) return existingFactory

    if (!factoryInitialized) {
      PeerConnectionFactory.initialize(
        PeerConnectionFactory.InitializationOptions.builder(context)
          .setEnableInternalTracer(false)
          .createInitializationOptions(),
      )
      factoryInitialized = true
    }

    val audioModule = JavaAudioDeviceModule.builder(context).createAudioDeviceModule()
    val nextFactory = PeerConnectionFactory.builder()
      .setAudioDeviceModule(audioModule)
      .createPeerConnectionFactory()
    factory = nextFactory
    return nextFactory
  }

  private fun ensurePeerConnection(context: Context, callId: String): PeerConnection {
    val existing = peerConnection
    if (existing != null) return existing

    val nextFactory = ensureFactory(context)
    val iceServers = listOf(
      PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
      PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
    )
    val rtcConfig = PeerConnection.RTCConfiguration(iceServers)
    val pc = nextFactory.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
      override fun onIceCandidate(candidate: IceCandidate?) {
        if (candidate == null) return
        executor.execute {
          try {
            NativeTabletCallClient(context).sendIceCandidate(
              callId,
              candidate.sdp,
              candidate.sdpMid,
              candidate.sdpMLineIndex,
            )
          } catch (error: Throwable) {
            Log.e(TAG, "failed to send native ICE candidate", error)
          }
        }
      }

      override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
        Log.i(TAG, "native ICE state changed: $state")
        if (state == PeerConnection.IceConnectionState.CONNECTED || state == PeerConnection.IceConnectionState.COMPLETED) {
          broadcast(context, "connected", "")
        } else if (state == PeerConnection.IceConnectionState.FAILED || state == PeerConnection.IceConnectionState.DISCONNECTED) {
          broadcast(context, "reconnecting", "")
          schedulePoll(context, 700)
        }
      }

      override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
        Log.i(TAG, "native peer connection state changed: $newState")
        if (newState == PeerConnection.PeerConnectionState.CONNECTED) {
          broadcast(context, "connected", "")
        } else if (newState == PeerConnection.PeerConnectionState.FAILED || newState == PeerConnection.PeerConnectionState.DISCONNECTED) {
          broadcast(context, "reconnecting", "")
          schedulePoll(context, 700)
        }
      }

      override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
      override fun onIceConnectionReceivingChange(receiving: Boolean) {}
      override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
      override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
      override fun onAddStream(stream: MediaStream?) {}
      override fun onRemoveStream(stream: MediaStream?) {}
      override fun onDataChannel(channel: DataChannel?) {}
      override fun onRenegotiationNeeded() {}
      override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
    }) ?: throw IllegalStateException("native_peer_connection_failed")

    val source = nextFactory.createAudioSource(MediaConstraints())
    val track = nextFactory.createAudioTrack("native_audio_$callId", source)
    track.setEnabled(!muted)
    pc.addTrack(track)
    audioSource = source
    audioTrack = track
    peerConnection = pc
    return pc
  }

  private fun offerConstraints(): MediaConstraints {
    val constraints = MediaConstraints()
    constraints.mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
    constraints.mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
    return constraints
  }

  private fun schedulePoll(context: Context, delayMs: Long) {
    if (currentCallId.isBlank()) return
    pollFuture?.cancel(false)
    pollFuture = executor.schedule({ poll(context.applicationContext) }, delayMs, TimeUnit.MILLISECONDS)
  }

  private fun cleanup(context: Context, notifyEnded: Boolean) {
    pollFuture?.cancel(false)
    pollFuture = null
    try {
      audioTrack?.dispose()
    } catch (_: Throwable) {
    }
    try {
      audioSource?.dispose()
    } catch (_: Throwable) {
    }
    try {
      peerConnection?.close()
      peerConnection?.dispose()
    } catch (_: Throwable) {
    }
    audioTrack = null
    audioSource = null
    peerConnection = null
    sentOfferSdp = ""
    appliedAnswerSdp = ""
    appliedIce.clear()
    currentCallId = ""
    muted = false
    speaker = false
    NativeCallAudioRouter.release(context)
    NativeCallAlert.stop(context)
    if (notifyEnded) {
      broadcast(context, "ended", "")
    }
    Log.i(TAG, "native audio call cleaned up")
  }

  private fun finishRemoteEndedCall(context: Context, callId: String) {
    cleanup(context, notifyEnded = true)
    NativeCallNotifier.cancelIncomingCall(context, callId)
    NativeCallNotifier.cancelActiveCall(context, callId)
    NativeCallStore.clearActiveCall(context, callId)
    Log.i(TAG, "native remote-ended call fully cleaned up: $callId")
  }

  private fun broadcast(context: Context, state: String, error: String) {
    val intent = Intent(NativeCallUiEvents.ACTION)
      .setPackage(context.packageName)
      .putExtra(NativeCallUiEvents.EXTRA_STATE, state)
      .putExtra(NativeCallUiEvents.EXTRA_ERROR, error)
    context.sendBroadcast(intent)
  }
}

open class SimpleSdpObserver : SdpObserver {
  override fun onCreateSuccess(description: SessionDescription) {}
  override fun onSetSuccess() {}
  override fun onCreateFailure(error: String) {
    Log.e("NativeAudioCallManager", "native SDP create failed: $error")
  }
  override fun onSetFailure(error: String) {
    Log.e("NativeAudioCallManager", "native SDP set failed: $error")
  }
}

object NativeCallUiEvents {
  const val ACTION = "com.dvaari.dvari.nativecall.UI_EVENT"
  const val EXTRA_STATE = "state"
  const val EXTRA_ERROR = "error"
}
