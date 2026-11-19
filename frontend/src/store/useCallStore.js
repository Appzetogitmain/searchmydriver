import { create } from 'zustand';

/**
 * Global store for the current app-to-app (WebRTC) call.
 *
 * State machine:
 *   idle → calling     (we dialled; waiting for the other side to pick up)
 *   idle → ringing     (incoming; waiting for us to accept/decline)
 *   calling|ringing → connecting  (answer exchanged; ICE/media negotiating)
 *   connecting → connected        (RTCPeerConnection reports "connected")
 *   any → idle         (ended / rejected / failed)
 *
 * The WebRTC plumbing lives in `useWebRTC` (mounted once via CallOverlay),
 * which injects startCall/answerCall/rejectCall/hangUp below.
 */
const IDLE = {
  callState: 'idle',
  callId: null,
  bookingId: null,
  callerName: null,
  callerPhoto: null,
  /** Outgoing only: server says the other side has no open app right now. */
  peerOffline: false,
  isMuted: false,
  callDuration: 0,
  isMinimized: false,
};

const useCallStore = create((set, get) => ({
  ...IDLE,

  // Action references injected by useWebRTC
  startCall: null,
  answerCall: null,
  rejectCall: null,
  hangUp: null,

  initiateCall: ({ callId, bookingId, name, photo }) => {
    if (get().callState !== 'idle') return false;
    set({ ...IDLE, callState: 'calling', callId, bookingId, callerName: name, callerPhoto: photo });
    return true;
  },

  receiveCall: ({ callId, bookingId, name, photo }) => {
    if (get().callState !== 'idle') return false;
    set({ ...IDLE, callState: 'ringing', callId, bookingId, callerName: name, callerPhoto: photo });
    return true;
  },

  setConnecting: () => {
    const s = get().callState;
    if (s === 'calling' || s === 'ringing') set({ callState: 'connecting' });
  },

  setConnected: () => {
    if (get().callState !== 'idle' && get().callState !== 'connected') {
      set({ callState: 'connected' });
    }
  },

  setPeerOffline: (peerOffline) => set({ peerOffline }),

  toggleMute: () => set({ isMuted: !get().isMuted }),

  incrementDuration: () => set((state) => ({ callDuration: state.callDuration + 1 })),

  setMinimized: (isMinimized) => set({ isMinimized }),

  endCall: () => set({ ...IDLE }),
}));

export default useCallStore;
