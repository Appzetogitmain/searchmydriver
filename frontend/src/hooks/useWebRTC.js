import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket, useSocketEvent } from './useSocket';
import { C2S_EVENTS, S2C_EVENTS } from '../constants/socketEvents';
import useCallStore from '../store/useCallStore';

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * Custom hook to manage WebRTC connections for app-to-app calling.
 * Must be mounted at a high level (e.g. root layout or CallOverlay) to persist across navigations.
 */
export function useWebRTC() {
  const { emit } = useSocket();
  const { callState, bookingId, initiateCall, receiveCall, acceptCall, callAnswered, endCall, isMuted } = useCallStore();

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Clean up peer connection & media streams
  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
  }, []);

  // Sync mute state to local audio track
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  // Handle incoming signaling messages
  useSocketEvent(S2C_EVENTS.CALL_SIGNAL, async (payload) => {
    const { bookingId: signalBookingId, type, offer, answer, candidate, from, fromType } = payload;
    
    // Create PC if it doesn't exist
    if (!pcRef.current) {
      pcRef.current = new RTCPeerConnection(STUN_SERVERS);
      
      pcRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          emit(C2S_EVENTS.CALL_SIGNAL, {
            bookingId: signalBookingId,
            type: 'candidate',
            candidate: event.candidate,
          });
        }
      };

      pcRef.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };
    }

    if (type === 'offer') {
      receiveCall({ bookingId: signalBookingId, name: `${fromType} ${from}`, photo: null }); // Can improve name/photo later
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      // Answer will be created when user accepts
    } else if (type === 'answer') {
      callAnswered();
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    } else if (type === 'candidate') {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding received ice candidate', e);
      }
    }
  });

  useSocketEvent(S2C_EVENTS.CALL_REJECTED, () => {
    cleanup();
    endCall();
  });

  useSocketEvent(S2C_EVENTS.CALL_ENDED, () => {
    cleanup();
    endCall();
  });

  // Action: Start outgoing call
  const startCall = useCallback(async (targetBookingId, name, photo) => {
    cleanup();
    initiateCall({ bookingId: targetBookingId, name, photo });

    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      pcRef.current = new RTCPeerConnection(STUN_SERVERS);

      localStreamRef.current.getTracks().forEach((track) => {
        pcRef.current.addTrack(track, localStreamRef.current);
      });

      pcRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          emit(C2S_EVENTS.CALL_SIGNAL, {
            bookingId: targetBookingId,
            type: 'candidate',
            candidate: event.candidate,
          });
        }
      };

      pcRef.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);

      emit(C2S_EVENTS.CALL_SIGNAL, {
        bookingId: targetBookingId,
        type: 'offer',
        offer,
      });
    } catch (err) {
      console.error('Failed to get media or create offer', err);
      cleanup();
      endCall();
    }
  }, [cleanup, initiateCall, emit, endCall]);

  // Action: Answer incoming call
  const answerCall = useCallback(async () => {
    if (!pcRef.current || !bookingId) return;

    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      localStreamRef.current.getTracks().forEach((track) => {
        pcRef.current.addTrack(track, localStreamRef.current);
      });

      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);

      emit(C2S_EVENTS.CALL_SIGNAL, {
        bookingId,
        type: 'answer',
        answer,
      });

      acceptCall();
    } catch (err) {
      console.error('Failed to answer call', err);
      emit(C2S_EVENTS.CALL_REJECT, { bookingId });
      cleanup();
      endCall();
    }
  }, [bookingId, acceptCall, emit, cleanup, endCall]);

  // Action: Reject incoming call
  const rejectCall = useCallback(() => {
    if (bookingId) {
      emit(C2S_EVENTS.CALL_REJECT, { bookingId });
    }
    cleanup();
    endCall();
  }, [bookingId, emit, cleanup, endCall]);

  // Action: Hang up active or ringing call
  const hangUp = useCallback(() => {
    if (bookingId) {
      emit(C2S_EVENTS.CALL_END, { bookingId });
    }
    cleanup();
    endCall();
  }, [bookingId, emit, cleanup, endCall]);

  useEffect(() => {
    useCallStore.setState({ startCall, answerCall, rejectCall, hangUp });
  }, [startCall, answerCall, rejectCall, hangUp]);

  return {
    remoteStream
  };
}
