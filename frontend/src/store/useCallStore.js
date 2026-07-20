import { create } from 'zustand';

/**
 * Global store for managing active WebRTC call state.
 *
 * State Machine:
 * - `idle`: No active call
 * - `calling`: User initiated a call, waiting for other party to answer
 * - `ringing`: Incoming call received, waiting for local user to accept/decline
 * - `connected`: Call is active and media is flowing
 */
const useCallStore = create((set, get) => ({
  callState: 'idle', // 'idle' | 'calling' | 'ringing' | 'connected'
  bookingId: null,
  callerName: null,
  callerPhoto: null,
  isMuted: false,

  // Action references injected by useWebRTC
  startCall: null,
  answerCall: null,
  rejectCall: null,
  hangUp: null,

  // Start an outgoing call
  initiateCall: ({ bookingId, name, photo }) => {
    if (get().callState !== 'idle') return;
    set({
      callState: 'calling',
      bookingId,
      callerName: name,
      callerPhoto: photo,
      isMuted: false,
    });
  },

  // Receive an incoming call
  receiveCall: ({ bookingId, name, photo }) => {
    if (get().callState !== 'idle') return;
    set({
      callState: 'ringing',
      bookingId,
      callerName: name,
      callerPhoto: photo,
      isMuted: false,
    });
  },

  // Accept an incoming call
  acceptCall: () => {
    if (get().callState === 'ringing') {
      set({ callState: 'connected' });
    }
  },

  // When the remote peer answers our outgoing call
  callAnswered: () => {
    if (get().callState === 'calling') {
      set({ callState: 'connected' });
    }
  },

  toggleMute: () => {
    set({ isMuted: !get().isMuted });
  },

  // End or reject the call
  endCall: () => {
    set({
      callState: 'idle',
      bookingId: null,
      callerName: null,
      callerPhoto: null,
      isMuted: false,
    });
  },
}));

export default useCallStore;
