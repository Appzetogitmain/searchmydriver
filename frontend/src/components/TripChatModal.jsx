import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, Car, Phone, MessageSquare } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useSocketEvent } from '../hooks/useSocket';
import Card from './Card';
import Avatar from './Avatar';
import useUserAuthStore from '../store/useUserAuthStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useSocketStore from '../store/useSocketStore';

const TripChatModal = ({
  open,
  onClose,
  bookingId,
  recipientName,
  recipientPhone,
  recipientPhotoUrl,
  recipientModel // 'Driver' or 'User'
}) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // We determine who the current logged-in user is
  const customer = useUserAuthStore((s) => s.user);
  const driver = useDriverAuthStore((s) => s.driver);
  
  const currentUserId = customer?._id || customer?.id || driver?._id || driver?.id;
  const currentModel = customer ? 'User' : 'Driver';

  useEffect(() => {
    if (!open || !bookingId) return;
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/chat/${bookingId}`);
        setMessages(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch chat', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [open, bookingId]);

  // Listen for real-time messages
  useSocketEvent('NEW_CHAT_MESSAGE', (msg) => {
    if (msg.bookingId !== bookingId) return;
    
    // Check if the message is from the other party
    const senderId = msg.senderId?._id || msg.senderId;
    const isFromMe = senderId === currentUserId;

    setMessages((prev) => {
      // prevent duplicates
      if (prev.find((m) => m._id === msg._id)) return prev;
      return [...prev, msg];
    });
  });

  // Track active chat globally to suppress duplicate toasts
  useEffect(() => {
    if (open && bookingId) {
      useSocketStore.getState().setActiveChatBookingId(bookingId);
      return () => {
        useSocketStore.getState().setActiveChatBookingId(null);
      };
    }
  }, [open, bookingId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const messageText = inputText.trim();
    setInputText('');

    try {
      const res = await api.post(`/chat/${bookingId}`, {
        message: messageText,
        senderModel: currentModel
      });
      const newMsg = res.data.data;
      setMessages((prev) => {
        if (prev.find((m) => m._id === newMsg._id)) return prev;
        return [...prev, newMsg];
      });
    } catch (err) {
      console.error('Failed to send message', err);
      // rollback or show error
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-900/40 backdrop-blur-sm sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in">
      <Card className="w-full h-full sm:max-h-[85vh] sm:h-[600px] sm:max-w-md flex flex-col overflow-hidden bg-white sm:rounded-[2rem] shadow-2xl relative">
        
        {/* Header */}
        <div className="px-4 py-3 bg-white border-b flex items-center gap-3 shrink-0 relative z-10 shadow-sm">
          <Avatar src={recipientPhotoUrl} name={recipientName} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate">
              {recipientName || (recipientModel === 'Driver' ? 'Your Driver' : 'Customer')}
            </h3>
            <p className="text-xs text-emerald-600 font-medium">Online</p>
          </div>
          {recipientPhone && (
            <a
              href={`tel:+91${String(recipientPhone).replace(/\D/g, '')}`}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 active:scale-95 transition"
            >
              <Phone className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
          {loading ? (
            <div className="flex justify-center py-4">
              <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
              <MessageSquare className="w-8 h-8 opacity-20" />
              <p className="text-xs">No messages yet.</p>
              <p className="text-[10px]">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              // Extract string ID if it's populated
              const msgSenderId = msg.senderId?._id || msg.senderId;
              const isMine = String(msgSenderId) === String(currentUserId);
              
              const showAvatar = !isMine && (idx === 0 || messages[idx - 1].senderModel !== msg.senderModel);
              
              return (
                <div key={msg._id} className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[80%] ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                    
                    {!isMine && showAvatar && (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-auto">
                        {recipientModel === 'Driver' ? <Car className="w-3 h-3 text-gray-500" /> : <User className="w-3 h-3 text-gray-500" />}
                      </div>
                    )}
                    {!isMine && !showAvatar && <div className="w-6 shrink-0" />}

                    <div
                      className={`px-3.5 py-2 rounded-2xl text-sm shadow-sm ${
                        isMine 
                          ? 'bg-primary text-white rounded-br-sm' 
                          : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
                      }`}
                    >
                      <p className="break-words">{msg.message}</p>
                      <span className={`text-[9px] block mt-1 text-right ${isMine ? 'text-primary-foreground/70' : 'text-gray-400'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-white border-t relative z-10 shrink-0">
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2 border border-transparent focus-within:border-primary/30 focus-within:bg-white transition-colors">
              <textarea
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Type a message..."
                className="w-full bg-transparent resize-none outline-none text-sm py-1.5 text-gray-800 max-h-24 min-h-[36px]"
                style={{ height: 'auto' }}
              />
            </div>
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-12 h-12 shrink-0 bg-primary text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-dark active:scale-95 transition"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          </form>
        </div>

      </Card>
    </div>
  );
};

export default TripChatModal;
