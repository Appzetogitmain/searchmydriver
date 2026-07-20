import { useEffect, useState } from 'react';
import api from '../../../../utils/api';
import { Loader2 } from 'lucide-react';

export default function ChatViewer({ bookingId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bookingId) return;
    const fetchChat = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/chat/${bookingId}`);
        setMessages(res.data.data || []);
      } catch (err) {
        setError('Could not load conversation');
      } finally {
        setLoading(false);
      }
    };
    fetchChat();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-4 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading conversation...
      </div>
    );
  }

  if (error) {
    return <div className="text-danger text-sm">{error}</div>;
  }

  if (messages.length === 0) {
    return <div className="text-slate-500 text-sm italic">No messages sent yet.</div>;
  }

  return (
    <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-2">
      {messages.map((msg) => {
        const isAdmin = msg.senderModel === 'Admin';
        const isDriver = msg.senderModel === 'Driver';
        const isUser = msg.senderModel === 'User';

        return (
          <div key={msg._id} className={`flex flex-col ${isDriver ? 'items-start' : isUser ? 'items-end' : 'items-center'}`}>
            <div className="text-[10px] text-slate-400 mb-0.5">
              {msg.senderId?.name || msg.senderModel} ({msg.senderModel})
            </div>
            <div
              className={`px-3 py-2 rounded-xl text-sm ${
                isDriver
                  ? 'bg-blue-100 text-blue-900 rounded-tl-sm'
                  : isUser
                  ? 'bg-emerald-100 text-emerald-900 rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-md'
              }`}
            >
              {msg.message}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5">
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
