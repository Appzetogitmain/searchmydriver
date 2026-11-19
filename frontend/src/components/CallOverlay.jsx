import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, MicOff, Mic, Minimize2 } from 'lucide-react';
import useCallStore from '../store/useCallStore';
import { useWebRTC } from '../hooks/useWebRTC';
import Avatar from './Avatar';

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CallOverlay() {
  const {
    callState,
    callerName,
    callerPhoto,
    peerOffline,
    isMuted,
    toggleMute,
    answerCall,
    rejectCall,
    hangUp,
    callDuration,
    incrementDuration,
    isMinimized,
    setMinimized,
  } = useCallStore();
  const { remoteStream } = useWebRTC();
  const audioRef = useRef(null);

  // Attach the remote stream and start playback explicitly — `autoPlay`
  // alone is not reliable on iOS Safari / Android WebViews.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.srcObject !== remoteStream) el.srcObject = remoteStream || null;
    if (remoteStream) {
      el.play().catch((err) => console.warn('[call] remote audio play() blocked', err));
    }
  }, [remoteStream, callState]);

  useEffect(() => {
    if (callState !== 'connected') return undefined;
    const timerId = setInterval(incrementDuration, 1000);
    return () => clearInterval(timerId);
  }, [callState, incrementDuration]);

  if (callState === 'idle') return null;

  const isIncoming = callState === 'ringing';
  const isActive = callState === 'connected';
  const isConnecting = callState === 'connecting';
  const isOutgoing = callState === 'calling';
  const name = callerName || 'Unknown';

  const statusText = isIncoming
    ? 'Incoming call…'
    : isOutgoing
      ? peerOffline
        ? 'Calling… (notifying their phone)'
        : 'Ringing…'
      : isConnecting
        ? 'Connecting…'
        : formatDuration(callDuration);

  return (
    <>
      {/* Always mounted while a call exists, so minimizing never cuts audio. */}
      <audio ref={audioRef} autoPlay playsInline />

      {isMinimized ? (
        <div className="fixed bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center gap-3 bg-slate-800 text-white rounded-2xl pl-4 pr-2 py-2 shadow-lg">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex-1 min-w-0 text-left"
            aria-label="Open call"
          >
            <p className="text-sm font-semibold truncate">{name}</p>
            <p className="text-xs text-slate-300">{statusText}</p>
          </button>
          {isIncoming ? (
            <button
              type="button"
              onClick={answerCall}
              className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center"
              aria-label="Accept Call"
            >
              <Phone className="w-5 h-5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={isIncoming ? rejectCall : hangUp}
            className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center"
            aria-label="End Call"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md">
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 w-full max-w-sm px-6">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="self-end mb-2 p-2 text-slate-400 hover:text-white"
              aria-label="Minimize call"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center">
              <Avatar src={callerPhoto} name={name} size="2xl" className="w-32 h-32 border-4 border-slate-700 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2 text-center">{name}</h2>
              <p className={`font-medium tracking-wide ${isActive ? 'text-emerald-400 font-mono' : 'text-slate-400'}`}>
                {statusText}
              </p>
            </div>

            <div className="flex items-center justify-center gap-8 w-full pt-8">
              {isIncoming ? (
                <>
                  <button
                    type="button"
                    onClick={rejectCall}
                    className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
                    aria-label="Decline Call"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </button>
                  <button
                    type="button"
                    onClick={answerCall}
                    className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all animate-pulse"
                    aria-label="Accept Call"
                  >
                    <Phone className="w-7 h-7" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all ${
                      isMuted ? 'bg-white/90 text-slate-900' : 'bg-slate-600 hover:bg-slate-500'
                    }`}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    aria-pressed={isMuted}
                  >
                    {isMuted ? <MicOff className="w-6 h-6 text-slate-900" /> : <Mic className="w-6 h-6" />}
                  </button>
                  <button
                    type="button"
                    onClick={hangUp}
                    className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
                    aria-label="End Call"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
