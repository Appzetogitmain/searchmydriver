import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, MicOff, Mic, User } from 'lucide-react';
import useCallStore from '../store/useCallStore';
import { useWebRTC } from '../hooks/useWebRTC';
import Avatar from './Avatar';

export default function CallOverlay() {
  const { callState, callerName, callerPhoto, isMuted, toggleMute, answerCall, rejectCall, hangUp } = useCallStore();
  const { remoteStream } = useWebRTC();
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);

  if (callState === 'idle') return null;

  const isIncoming = callState === 'ringing';
  const isActive = callState === 'connected';
  const isOutgoing = callState === 'calling';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md">
      {/* Hidden audio element for remote stream */}
      <audio ref={audioRef} autoPlay playsInline />

      <div className="flex-1 flex flex-col items-center justify-center space-y-6 w-full max-w-sm px-6">
        <div className="flex flex-col items-center">
          <Avatar src={callerPhoto} name={callerName || 'Unknown'} size="2xl" className="w-32 h-32 border-4 border-slate-700 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">{callerName || 'Unknown'}</h2>
          
          <p className="text-slate-400 font-medium tracking-wide">
            {isIncoming && 'Incoming call...'}
            {isOutgoing && 'Calling...'}
            {isActive && 'Call Connected'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-8 w-full pt-8">
          {isIncoming ? (
            <>
              <button
                onClick={rejectCall}
                className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
                aria-label="Decline Call"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <button
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
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all ${
                  isMuted ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-600 hover:bg-slate-500'
                }`}
                aria-label="Toggle Mute"
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <button
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
  );
}
