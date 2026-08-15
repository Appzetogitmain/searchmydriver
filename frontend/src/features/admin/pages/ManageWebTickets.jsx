import { useState, useEffect } from 'react';
import {
  Headset,
  Phone,
  CheckCircle,
  Clock,
  Search,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import api from '../../../utils/api';
import { createQueryStore } from '../../../store/lib/createQueryStore';
import toast from 'react-hot-toast';

const useSupportTicketsStore = createQueryStore(async () => {
  const { data } = await api.get('/admin/support/tickets');
  return data.tickets;
});

const ManageWebTickets = () => {
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const cacheKey = buildCacheKey('admin-support-tickets-web', {});
  const { data, loading, refetch } = useCachedQuery(useSupportTicketsStore, cacheKey, {});
  const tickets = data || [];

  // Live reload tickets when a new one comes in
  useSocketEvent(S2C_EVENTS.ADMIN_ALERT, () => {
    refetch();
  });

  // Sync selectedTicket with fresh data when tickets list updates
  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((t) => String(t._id) === String(selectedTicket._id));
      if (updated) {
        setSelectedTicket(updated);
      }
    }
  }, [tickets]);

  const handleResolve = async (id) => {
    try {
      await api.patch(`/admin/support/tickets/${id}/status`);
      toast.success('Ticket marked as resolved');
      refetch();
      if (selectedTicket?._id === id) {
        setSelectedTicket((prev) => ({ ...prev, status: 'resolved' }));
      }
    } catch (err) {
      toast.error('Failed to resolve ticket');
      console.error(err);
    }
  };

  const handleSendReply = async (resolveStatus = false) => {
    if (!replyMessage.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      const { data } = await api.post(`/admin/support/tickets/${selectedTicket._id}/reply`, {
        message: replyMessage.trim(),
        status: resolveStatus ? 'resolved' : undefined,
      });
      toast.success(resolveStatus ? 'Reply sent & ticket resolved' : 'Reply sent successfully');
      if (data?.ticket) {
        setSelectedTicket(data.ticket);
      } else {
        setSelectedTicket((prev) => ({
          ...prev,
          status: resolveStatus ? 'resolved' : prev.status,
          replies: [
            ...(prev.replies || []),
            {
              senderType: 'admin',
              senderName: 'Admin',
              message: replyMessage.trim(),
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      }
      setReplyMessage('');
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reply');
      console.error('Failed to send reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  // Only tickets raised from the public web form (no userId or driverId, has contactName)
  const webTickets = (tickets || []).filter((t) => !t.userId && !t.driverId);

  const filteredTickets = webTickets.filter((t) => {
    const term = search.toLowerCase();
    if (!term.trim()) return true;
    return (
      t.ticketNumber?.toLowerCase().includes(term) ||
      t.contactName?.toLowerCase().includes(term) ||
      t.contactPhone?.toLowerCase().includes(term) ||
      t.subject?.toLowerCase().includes(term) ||
      t.description?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Website Support Tickets</h2>
          <p className="text-sm text-slate-500 font-medium">
            Manage and resolve support tickets raised by public visitors from the website contact form.
          </p>
        </div>
        <Button onClick={refetch} variant="outline" className="p-2.5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ticket number, name, phone, or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Ticket List Table */}
        <div className={selectedTicket ? 'lg:col-span-7' : 'lg:col-span-12'}>
          <Card className="p-0 overflow-hidden border-slate-200">
            {loading && tickets.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">Loading tickets...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                No website support tickets found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Ticket</th>
                      <th className="px-6 py-3.5">From</th>
                      <th className="px-6 py-3.5">Subject</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredTickets.map((t) => (
                      <tr
                        key={t._id}
                        onClick={() => {
                          setSelectedTicket(t);
                          setReplyMessage('');
                        }}
                        className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                          selectedTicket?._id === t._id ? 'bg-slate-100/50' : ''
                        }`}
                      >
                        <td className="px-6 py-4 font-bold text-slate-900">{t.ticketNumber}</td>
                        <td className="px-6 py-4">
                          <p className="text-slate-800 font-bold">{t.contactName}</p>
                          <p className="text-xs text-slate-500">{t.contactPhone}</p>
                        </td>
                        <td className="px-6 py-4 max-w-[200px] truncate">{t.subject}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                              t.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400">
                          {new Date(t.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Selected Ticket Drawer/Details */}
        {selectedTicket && (
          <div className="lg:col-span-5">
            <Card className="border-slate-200 p-6 space-y-6">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{selectedTicket.ticketNumber}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        selectedTicket.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {selectedTicket.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Created on {new Date(selectedTicket.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedTicket(null);
                    setReplyMessage('');
                  }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <div className="flex justify-between text-xs text-slate-500 font-bold">
                    <span>Contact Person:</span>
                    <span className="text-slate-900 font-extrabold">{selectedTicket.contactName}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 font-bold">
                    <span>Contact Phone:</span>
                    <span className="text-slate-900 font-extrabold flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-slate-400" /> {selectedTicket.contactPhone}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 font-bold">
                    <span>Role Type:</span>
                    <span className="text-slate-900 font-extrabold capitalize">{selectedTicket.creatorType}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Subject</h4>
                  <p className="text-sm font-bold text-slate-900">{selectedTicket.subject}</p>
                </div>

                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Description</h4>
                  <div className="text-sm text-slate-700 bg-slate-50/50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.description}
                  </div>
                </div>

                {/* Conversation History / Replies */}
                {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500" /> Replies & Activity ({selectedTicket.replies.length})
                    </h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {selectedTicket.replies.map((reply, idx) => {
                        const isAdmin = reply.senderType === 'admin';
                        return (
                          <div
                            key={idx}
                            className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[90%] rounded-2xl p-3 text-sm shadow-sm space-y-1 ${
                                isAdmin
                                  ? 'bg-amber-500 text-slate-950 font-medium rounded-br-none'
                                  : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold opacity-75">
                                <span>{reply.senderName || (isAdmin ? 'Admin' : 'Visitor')}</span>
                                <span>
                                  {reply.createdAt ? new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap text-xs sm:text-sm">{reply.message}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reply Input Box */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Reply to Ticket
                    </label>
                    <textarea
                      rows={3}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your reply or resolution details..."
                      className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 resize-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {replyMessage.trim() ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSendReply(false)}
                          disabled={sendingReply}
                          className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {sendingReply ? 'Sending...' : 'Send Reply'}
                        </button>
                        {selectedTicket.status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => handleSendReply(true)}
                            disabled={sendingReply}
                            className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Reply & Resolve
                          </button>
                        )}
                      </>
                    ) : (
                      selectedTicket.status !== 'resolved' && (
                        <button
                          type="button"
                          onClick={() => handleResolve(selectedTicket._id)}
                          className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" /> Mark as Resolved
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

const X = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className={className}
    {...props}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default ManageWebTickets;
