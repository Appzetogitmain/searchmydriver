import { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useSocket, useSocketEvent } from './useSocket';
import { C2S_EVENTS, S2C_EVENTS } from '../constants/socketEvents';
import useCallStore from '../store/useCallStore';
import useSocketStore from '../store/useSocketStore';
import { startRingtone, stopRingtone, startRingback, stopRingback, stopAllTones } from '../utils/callTones';

/** Used only if the server can't be asked for ICE servers. */
const FALLBACK_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
const ICE_CACHE_MS = 5 * 60 * 1000;
/** Client-side safety net; the server ends unanswered calls at 40s. */
const RING_TIMEOUT_MS = 45_000;
/** How long "disconnected" may last before we give up on the call. */
const MEDIA_DISCONNECT_GRACE_MS = 10_000;
const AUDIO_CONSTRAINTS = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

const OFFER_ERRORS = {
  busy: 'They are on another call. Try again shortly.',
  forbidden: 'You can only call the person on this booking.',
  ended: 'Call ended.',
  invalid: 'Could not start the call.',
  server: 'Could not start the call. Please try again.',
};

const END_MESSAGES = {
  no_answer: 'No answer',
  ended: 'Call ended',
  failed: 'Call dropped',
  peer_disconnected: 'Call dropped: the other side lost connection',
};

/** True when this browser/context can place an in-app call at all. */
export function canUseAppCalling() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.isSecureContext &&
      navigator.mediaDevices?.getUserMedia &&
      window.RTCPeerConnection,
  );
}

function newCallId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function getSocket() {
  return useSocketStore.getState().socket;
}

/** Emit with an ack; rejects on timeout or when the socket is offline. */
async function request(event, payload, timeoutMs = 8000) {
  const s = getSocket();
  if (!s?.connected) throw new Error('offline');
  return s.timeout(timeoutMs).emitWithAck(event, payload);
}

function micErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission is blocked. Allow it in your browser/app settings to make calls.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'Your microphone is being used by another app.';
  }
  return 'Could not access the microphone.';
}

/**
 * App-to-app calling over WebRTC, signalled through Socket.IO.
 * Mount exactly once (CallOverlay does) so the call survives navigation.
 */
export function useWebRTC() {
  const { isConnected } = useSocket();
  const isMuted = useCallStore((s) => s.isMuted);

  const [remoteStream, setRemoteStream] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const callIdRef = useRef(null);
  const bookingIdRef = useRef(null);
  const roleRef = useRef(null); // 'caller' | 'callee'
  /** Caller: our ICE candidates held until the server has registered the call. */
  const outgoingCandidatesRef = useRef([]);
  const offerAckedRef = useRef(false);
  /** Remote ICE candidates that arrived before the remote description was set. */
  const remoteCandidatesRef = useRef([]);
  /** Serialises signal handling so candidates never race the offer/answer. */
  const chainRef = useRef(Promise.resolve());
  const ringTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);
  const iceCacheRef = useRef({ servers: null, at: 0 });

  /* ---------------- helpers ---------------- */

  const teardown = useCallback(() => {
    stopAllTones();
    clearTimeout(ringTimerRef.current);
    clearTimeout(disconnectTimerRef.current);
    ringTimerRef.current = null;
    disconnectTimerRef.current = null;
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    callIdRef.current = null;
    bookingIdRef.current = null;
    roleRef.current = null;
    outgoingCandidatesRef.current = [];
    offerAckedRef.current = false;
    remoteCandidatesRef.current = [];
    setRemoteStream(null);
    useCallStore.getState().endCall();
  }, []);

  const sendSignal = useCallback((payload) => {
    getSocket()?.emit(C2S_EVENTS.CALL_SIGNAL, payload);
  }, []);

  const getIceServers = useCallback(async () => {
    const cache = iceCacheRef.current;
    if (cache.servers && Date.now() - cache.at < ICE_CACHE_MS) return cache.servers;
    try {
      const res = await request(C2S_EVENTS.CALL_ICE_SERVERS, {}, 5000);
      if (Array.isArray(res?.iceServers) && res.iceServers.length) {
        iceCacheRef.current = { servers: res.iceServers, at: Date.now() };
        return res.iceServers;
      }
    } catch {
      /* fall back below */
    }
    return FALLBACK_ICE_SERVERS;
  }, []);

  /** Local hang-up because the connection itself failed. */
  const failCall = useCallback((message) => {
    const callId = callIdRef.current;
    if (!callId) return;
    getSocket()?.emit(C2S_EVENTS.CALL_END, { callId, reason: 'failed' });
    teardown();
    toast.error(message);
  }, [teardown]);

  const addRemoteCandidate = useCallback(async (candidate) => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      remoteCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      console.warn('[call] could not add ICE candidate', e);
    }
  }, []);

  const flushRemoteCandidates = useCallback(async () => {
    const queued = remoteCandidatesRef.current;
    remoteCandidatesRef.current = [];
    for (const c of queued) {
      await addRemoteCandidate(c);
    }
  }, [addRemoteCandidate]);

  const createPeer = useCallback((iceServers, callId, bookingId) => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (!event.candidate || callIdRef.current !== callId) return;
      const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
      if (roleRef.current === 'caller' && !offerAckedRef.current) {
        outgoingCandidatesRef.current.push(candidate);
        return;
      }
      sendSignal({ type: 'candidate', callId, bookingId, candidate });
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      setRemoteStream(stream);
    };

    const onState = () => {
      if (callIdRef.current !== callId) return;
      const state = pc.connectionState || pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
        stopAllTones();
        useCallStore.getState().setConnected();
      } else if (state === 'disconnected') {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = setTimeout(
          () => failCall('Call dropped: network connection lost'),
          MEDIA_DISCONNECT_GRACE_MS,
        );
      } else if (state === 'failed') {
        failCall('Could not connect the call. Check your internet connection and try again.');
      }
    };
    pc.onconnectionstatechange = onState;
    pc.oniceconnectionstatechange = () => {
      // Older WebViews lack connectionState; ICE state is the fallback.
      if (!('connectionState' in pc)) onState();
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal, failCall]);

  /* ---------------- incoming ---------------- */

  const setupIncoming = useCallback(async ({ callId, bookingId, offer, caller, candidates = [] }) => {
    if (!callId || !offer) return;
    if (callIdRef.current === callId) return; // already ringing for this call

    const store = useCallStore.getState();
    if (store.callState !== 'idle' || callIdRef.current) {
      getSocket()?.emit(C2S_EVENTS.CALL_REJECT, { callId, reason: 'busy' });
      return;
    }

    callIdRef.current = callId;
    bookingIdRef.current = bookingId;
    roleRef.current = 'callee';
    store.receiveCall({
      callId,
      bookingId,
      name: caller?.name || (caller?.type === 'driver' ? 'Driver' : 'Customer'),
      photo: caller?.photo || null,
    });
    startRingtone();
    ringTimerRef.current = setTimeout(() => {
      if (callIdRef.current === callId && useCallStore.getState().callState === 'ringing') {
        teardown();
      }
    }, RING_TIMEOUT_MS);

    try {
      const iceServers = await getIceServers();
      if (callIdRef.current !== callId) return; // cancelled meanwhile
      const pc = createPeer(iceServers, callId, bookingId);
      await pc.setRemoteDescription(offer);
      remoteCandidatesRef.current.push(...candidates);
      await flushRemoteCandidates();
    } catch (err) {
      console.error('[call] failed to prepare incoming call', err);
      if (callIdRef.current === callId) {
        getSocket()?.emit(C2S_EVENTS.CALL_REJECT, { callId });
        teardown();
      }
    }
  }, [createPeer, flushRemoteCandidates, getIceServers, teardown]);

  const handleSignal = useCallback(async (payload) => {
    const { type, callId } = payload || {};
    if (type === 'offer') {
      await setupIncoming(payload);
      return;
    }
    if (!callId || callId !== callIdRef.current) return; // stale or foreign call

    if (type === 'answer') {
      if (roleRef.current !== 'caller' || !pcRef.current) return;
      clearTimeout(ringTimerRef.current);
      stopRingback();
      useCallStore.getState().setConnecting();
      await pcRef.current.setRemoteDescription(payload.answer);
      await flushRemoteCandidates();
    } else if (type === 'candidate') {
      await addRemoteCandidate(payload.candidate);
    }
  }, [setupIncoming, flushRemoteCandidates, addRemoteCandidate]);

  const enqueue = useCallback((fn) => {
    chainRef.current = chainRef.current.then(fn).catch((err) => {
      console.error('[call] signal handling error', err);
    });
    return chainRef.current;
  }, []);

  useSocketEvent(S2C_EVENTS.CALL_SIGNAL, (payload) => {
    enqueue(() => handleSignal(payload));
  });

  useSocketEvent(S2C_EVENTS.CALL_REJECTED, (payload) => {
    enqueue(() => {
      if (!payload?.callId || payload.callId !== callIdRef.current) return;
      teardown();
      toast(payload.reason === 'busy' ? 'They are on another call' : 'Call declined', { icon: '📵' });
    });
  });

  useSocketEvent(S2C_EVENTS.CALL_ENDED, (payload) => {
    enqueue(() => {
      if (!payload?.callId || payload.callId !== callIdRef.current) return;
      const { callState, callerName } = useCallStore.getState();
      teardown();
      if (payload.reason === 'cancelled' || (payload.reason === 'no_answer' && callState === 'ringing')) {
        toast(`Missed call from ${callerName || 'your trip contact'}`, { icon: '📞' });
      } else if (END_MESSAGES[payload.reason]) {
        toast(END_MESSAGES[payload.reason], { icon: '📞' });
      }
      // answered_elsewhere / rejected_elsewhere: silent
    });
  });

  // After (re)connecting (e.g. app opened from the "Incoming Call" push),
  // pick up a call that is still ringing for us.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await request(C2S_EVENTS.CALL_FETCH_PENDING, {}, 5000);
        if (!cancelled && res?.call) enqueue(() => setupIncoming(res.call));
      } catch {
        /* nothing pending / offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, enqueue, setupIncoming]);

  // Mute → local track.
  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !isMuted;
    });
  }, [isMuted]);

  // Tear down if the tab is closed mid-call so the other side isn't left hanging.
  useEffect(() => {
    const onUnload = () => {
      if (callIdRef.current) getSocket()?.emit(C2S_EVENTS.CALL_END, { callId: callIdRef.current });
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  /* ---------------- actions ---------------- */

  const startCall = useCallback(async (bookingId, name, photo) => {
    if (!bookingId) return false;
    if (!canUseAppCalling()) {
      toast.error('In-app calling needs a secure (https) connection and a supported browser.');
      return false;
    }
    if (!getSocket()?.connected) {
      toast.error('You are offline. Reconnecting…');
      return false;
    }
    if (useCallStore.getState().callState !== 'idle') return false;

    const callId = newCallId();
    callIdRef.current = callId;
    bookingIdRef.current = bookingId;
    roleRef.current = 'caller';
    offerAckedRef.current = false;
    useCallStore.getState().initiateCall({ callId, bookingId, name, photo });

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    } catch (err) {
      if (callIdRef.current === callId) teardown();
      toast.error(micErrorMessage(err));
      return true;
    }
    if (callIdRef.current !== callId) {
      // User hung up while the permission prompt was open.
      stream.getTracks().forEach((t) => t.stop());
      return true;
    }
    localStreamRef.current = stream;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !useCallStore.getState().isMuted;
    });

    try {
      const iceServers = await getIceServers();
      if (callIdRef.current !== callId) return true;
      const pc = createPeer(iceServers, callId, bookingId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await request(C2S_EVENTS.CALL_SIGNAL, {
        type: 'offer',
        callId,
        bookingId,
        offer: { type: offer.type, sdp: offer.sdp },
      });
      if (callIdRef.current !== callId) return true;
      if (!res?.ok) {
        teardown();
        toast.error(OFFER_ERRORS[res?.error] || OFFER_ERRORS.server);
        return true;
      }

      offerAckedRef.current = true;
      const pending = outgoingCandidatesRef.current;
      outgoingCandidatesRef.current = [];
      pending.forEach((candidate) => sendSignal({ type: 'candidate', callId, bookingId, candidate }));

      useCallStore.getState().setPeerOffline(!res.calleeOnline);
      startRingback();
      ringTimerRef.current = setTimeout(() => {
        if (callIdRef.current === callId && useCallStore.getState().callState === 'calling') {
          getSocket()?.emit(C2S_EVENTS.CALL_END, { callId });
          teardown();
          toast(END_MESSAGES.no_answer, { icon: '📞' });
        }
      }, RING_TIMEOUT_MS);
    } catch (err) {
      console.error('[call] failed to start call', err);
      if (callIdRef.current === callId) {
        getSocket()?.emit(C2S_EVENTS.CALL_END, { callId });
        teardown();
        toast.error(err?.message === 'offline' ? 'You are offline. Reconnecting…' : OFFER_ERRORS.server);
      }
    }
    return true;
  }, [createPeer, getIceServers, sendSignal, teardown]);

  const answerCall = useCallback(async () => {
    const callId = callIdRef.current;
    const bookingId = bookingIdRef.current;
    if (!callId || roleRef.current !== 'callee') return;
    if (useCallStore.getState().callState !== 'ringing') return;

    stopRingtone();
    clearTimeout(ringTimerRef.current);

    // Let any in-flight offer setup finish before answering.
    await chainRef.current;
    if (callIdRef.current !== callId || !pcRef.current) return;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    } catch (err) {
      getSocket()?.emit(C2S_EVENTS.CALL_REJECT, { callId });
      teardown();
      toast.error(micErrorMessage(err));
      return;
    }
    if (callIdRef.current !== callId || !pcRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    localStreamRef.current = stream;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !useCallStore.getState().isMuted;
    });

    try {
      const pc = pcRef.current;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      useCallStore.getState().setConnecting();
      const res = await request(C2S_EVENTS.CALL_SIGNAL, {
        type: 'answer',
        callId,
        bookingId,
        answer: { type: answer.type, sdp: answer.sdp },
      });
      if (!res?.ok && callIdRef.current === callId) {
        teardown();
        toast('Call ended', { icon: '📞' });
      }
    } catch (err) {
      console.error('[call] failed to answer', err);
      if (callIdRef.current === callId) {
        getSocket()?.emit(C2S_EVENTS.CALL_END, { callId, reason: 'failed' });
        teardown();
        toast.error('Could not answer the call.');
      }
    }
  }, [teardown]);

  const rejectCall = useCallback(() => {
    const callId = callIdRef.current;
    if (callId) getSocket()?.emit(C2S_EVENTS.CALL_REJECT, { callId });
    teardown();
  }, [teardown]);

  const hangUp = useCallback(() => {
    const callId = callIdRef.current;
    if (callId) getSocket()?.emit(C2S_EVENTS.CALL_END, { callId });
    teardown();
  }, [teardown]);

  useEffect(() => {
    useCallStore.setState({ startCall, answerCall, rejectCall, hangUp });
  }, [startCall, answerCall, rejectCall, hangUp]);

  return { remoteStream };
}
