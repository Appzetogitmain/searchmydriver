import { useState, useEffect } from 'react';
import { Send, Clock, CheckCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import api from '../utils/api';

const UserDriverTicketThreadModal = ({ isOpen, onClose, ticket, userType = 'user', onTicketUpdated }) => {
  const [replyMessage, setReplyMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTicket, setCurrentTicket] = useState(ticket);

  useEffect(() => {
    setCurrentTicket(ticket);
  }, [ticket]);

  if (!currentTicket) return null;

  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!replyMessage.trim() || loading) return;

    setLoading(true);
    try {
      const endpoint = userType === 'driver'
        ? `/driver/support/tickets/${currentTicket._id}/reply`
        : `/user/support/tickets/${currentTicket._id}/reply`;

      const { data } = await api.post(endpoint, { message: replyMessage.trim() });
      if (data?.ticket) {
        setCurrentTicket(data.ticket);
        if (onTicketUpdated) onTicketUpdated(data.ticket);
      }
      setReplyMessage('');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setLoading(false);
    }
  };

  const isResolved = currentTicket.status === 'resolved';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Ticket ${currentTicket.ticketNumber}`}>
      <div className="p-4 space-y-4 max-h-[80vh] flex flex-col">
        {/* Ticket Header Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isResolved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isResolved ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {isResolved ? 'Resolved' : 'Open'}
            </span>
            <span className="text-[11px] text-slate-400">
              {new Date(currentTicket.createdAt).toLocaleDateString()}
            </span>
          </div>
          <h4 className="font-bold text-slate-900 text-sm mt-1">{currentTicket.subject}</h4>
        </div>

        {/* Conversation Thread */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[160px] max-h-[300px]">
          {/* Original Ticket Description */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span>You (Original Message)</span>
              <span>{new Date(currentTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p className="text-xs text-slate-800 whitespace-pre-wrap">{currentTicket.description}</p>
          </div>

          {/* Replies */}
          {currentTicket.replies && currentTicket.replies.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
                Messages
              </div>
              {currentTicket.replies.map((reply, idx) => {
                const isMe = reply.senderType === userType;
                return (
                  <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs space-y-1 shadow-sm ${
                        isMe
                          ? 'bg-primary text-white rounded-br-none'
                          : 'bg-slate-100 text-slate-900 rounded-bl-none border border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] opacity-80">
                        <span className="font-semibold">
                          {reply.senderName || (isMe ? 'You' : 'Support Team')}
                        </span>
                        <span>{new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{reply.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reply Form */}
        <form onSubmit={handleSendReply} className="pt-2 border-t border-slate-100 flex gap-2">
          <input
            type="text"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            placeholder="Type your message..."
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            loading={loading}
            disabled={!replyMessage.trim()}
            icon={Send}
          >
            Reply
          </Button>
        </form>
      </div>
    </Modal>
  );
};

export default UserDriverTicketThreadModal;
