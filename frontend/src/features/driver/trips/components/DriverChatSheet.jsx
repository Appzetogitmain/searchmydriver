import { useEffect, useState, useRef } from 'react';
import { X, Send } from 'lucide-react';
import api from '../../../../utils/api';
import useSocketStore from '../../../../store/useSocketStore';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';

export default function DriverChatSheet({ open, onClose }) {
  const booking = useDriverActiveTripStore((s) => s.booking);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const bookingId = booking?._id;

  useEffect(() => {
    if (!open || !bookingId) return;
    const fetchChat = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/chat/${bookingId}`);
        setMessages(res.data.data || []);
      } catch (err) {
        console.error('Chat fetch error', err);
      } finally {
        setLoading(false);
      }
    };
    fetchChat();
  }, [open, bookingId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (!open) {
      useSocketStore.getState().setActiveChatBookingId(null);
      return;
    }
    
    useSocketStore.getState().setActiveChatBookingId(bookingId);
    
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    
    const onMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };
    socket.on('NEW_CHAT_MESSAGE', onMessage);
    return () => {
      socket.off('NEW_CHAT_MESSAGE', onMessage);
    };
  }, [open]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !bookingId) return;
    
    const msgText = text.trim();
    setText('');
    try {
      const res = await api.post(`/chat/${bookingId}`, {
        message: msgText,
        senderModel: 'Driver'
      });
      // The socket event will append the message to the list automatically, 
      // but if we don't get the echo immediately we could optimistically append.
    } catch (err) {
      console.error('Send error', err);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col h-[70vh] animate-slide-up">
        <div className="p-4 border-b flex justify-between items-center bg-white rounded-t-3xl">
          <h2 className="font-bold text-lg">Chat with Customer</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-3" ref={scrollRef}>
          {loading ? (
            <div className="text-center text-sm text-gray-500 mt-4">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-gray-500 mt-4 italic">No messages yet. Say hello!</div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderModel === 'Driver';
              return (
                <div key={m._id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`px-3 py-2 rounded-xl max-w-[80%] text-sm ${isMe ? 'bg-primary text-white rounded-tr-none' : 'bg-white border rounded-tl-none text-gray-800'}`}>
                    {m.message}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={send} className="p-3 border-t bg-white flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none focus:border-primary"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={!text.trim()} className="bg-primary text-white p-2.5 rounded-full disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
