import { useState, useEffect } from 'react';
import {
  Headset,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  CheckCircle,
  Search,
  RefreshCw,
  Send,
  Save,
  User,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Smartphone,
  AlertCircle,
  X,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import api from '../../../utils/api';
import { createQueryStore } from '../../../store/lib/createQueryStore';
import toast from 'react-hot-toast';

const useSupportTicketsStore = createQueryStore(async () => {
  const { data } = await api.get('/admin/support/tickets');
  return data.tickets || [];
});

export default function ManageUserSupportTickets() {
  // Contact info state
  const [contactForm, setContactForm] = useState({
    userSupportPhone: '9981570665',
    userSupportEmail: 'Searchmydrivers@gmail.com',
    userSupportResponseTime: 'We usually reply within 24 hours.',
  });
  const [loadingContact, setLoadingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  // Tickets state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'open' | 'resolved'
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const cacheKey = buildCacheKey('admin-user-support-tickets', {});
  const { data: rawTickets = [], loading: loadingTickets, refetch } = useCachedQuery(
    useSupportTicketsStore,
    cacheKey,
    {}
  );

  // Fetch contact info on mount
  useEffect(() => {
    fetchContactSettings();
  }, []);

  const fetchContactSettings = async () => {
    setLoadingContact(true);
    try {
      const res = await api.get('/admin/user-support/settings');
      if (res?.data?.data) {
        setContactForm({
          userSupportPhone: res.data.data.userSupportPhone || '9981570665',
          userSupportEmail: res.data.data.userSupportEmail || 'Searchmydrivers@gmail.com',
          userSupportResponseTime: res.data.data.userSupportResponseTime || 'We usually reply within 24 hours.',
        });
      }
    } catch (err) {
      console.error('Failed to load user support contact settings:', err);
    } finally {
      setLoadingContact(false);
    }
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!contactForm.userSupportPhone.trim()) {
      toast.error('Please provide a valid support phone number');
      return;
    }
    if (!contactForm.userSupportEmail.trim()) {
      toast.error('Please provide a valid support email address');
      return;
    }

    setSavingContact(true);
    try {
      await api.put('/admin/user-support/settings', contactForm);
      toast.success('User App contact details updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update contact settings');
      console.error('Failed to update contact info:', err);
    } finally {
      setSavingContact(false);
    }
  };

  // Live reload tickets when a new ticket is submitted
  useSocketEvent(S2C_EVENTS.ADMIN_ALERT, () => {
    refetch();
  });

  // Sync selectedTicket with fresh data when ticket list is reloaded
  useEffect(() => {
    if (selectedTicket) {
      const updated = rawTickets.find((t) => String(t._id) === String(selectedTicket._id));
      if (updated) {
        setSelectedTicket(updated);
      }
    }
  }, [rawTickets]);

  // Filter for User App support tickets (creatorType === 'user' or userId exists without driverId)
  const userTickets = (rawTickets || []).filter(
    (t) => t.creatorType === 'user' || (t.userId && !t.driverId)
  );

  const filteredTickets = userTickets.filter((t) => {
    // Status filter
    if (statusFilter === 'open' && t.status === 'resolved') return false;
    if (statusFilter === 'resolved' && t.status !== 'resolved') return false;

    // Search filter
    const term = search.toLowerCase().trim();
    if (!term) return true;

    const uName = t.userId?.name || t.contactName || '';
    const uPhone = t.userId?.phone_no || t.userId?.phone || t.contactPhone || '';

    return (
      t.ticketNumber?.toLowerCase().includes(term) ||
      uName.toLowerCase().includes(term) ||
      uPhone.includes(term) ||
      t.subject?.toLowerCase().includes(term) ||
      t.description?.toLowerCase().includes(term)
    );
  });

  const totalCount = userTickets.length;
  const openCount = userTickets.filter((t) => t.status !== 'resolved').length;
  const resolvedCount = userTickets.filter((t) => t.status === 'resolved').length;

  const handleResolve = async (id, newStatus = 'resolved') => {
    try {
      await api.patch(`/admin/support/tickets/${id}/status`);
      toast.success(newStatus === 'resolved' ? 'Ticket marked as resolved' : 'Ticket reopened');
      refetch();
      if (selectedTicket?._id === id) {
        setSelectedTicket((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      toast.error('Failed to update ticket status');
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
              senderName: 'Support Team',
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

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Headset className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">User App Support & Tickets</h1>
              <p className="text-sm text-slate-500">
                Update customer contact numbers/email and resolve incoming user support requests.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              fetchContactSettings();
              refetch();
            }}
            variant="outline"
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loadingTickets || loadingContact ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* SECTION 1: Customer Contact Details & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Form */}
        <div className="lg:col-span-2">
          <Card className="p-6 space-y-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-amber-500" />
                  User App Contact Configuration
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  The values entered here are dynamically displayed on the customer app's Help & Support page.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <Sparkles className="w-3 h-3" /> Live Dynamic
              </span>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Phone Number */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Support Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. 9981570665"
                      value={contactForm.userSupportPhone}
                      onChange={(e) =>
                        setContactForm((prev) => ({ ...prev, userSupportPhone: e.target.value }))
                      }
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">Users can tap to call this number directly.</p>
                </div>

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Support Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. Searchmydrivers@gmail.com"
                      value={contactForm.userSupportEmail}
                      onChange={(e) =>
                        setContactForm((prev) => ({ ...prev, userSupportEmail: e.target.value }))
                      }
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">Users can tap to write an email directly.</p>
                </div>
              </div>

              {/* Response Time / Help Note */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Response Time / Note
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. We usually reply within 24 hours."
                    value={contactForm.userSupportResponseTime}
                    onChange={(e) =>
                      setContactForm((prev) => ({ ...prev, userSupportResponseTime: e.target.value }))
                    }
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400">Displayed in the note card on the customer's Help screen.</p>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={savingContact || loadingContact}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
                >
                  <Save className={`w-4 h-4 ${savingContact ? 'animate-spin' : ''}`} />
                  <span>{savingContact ? 'Saving Changes...' : 'Save Contact Details'}</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Live Mobile User App Preview */}
        <div className="lg:col-span-1">
          <Card className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0 rounded-2xl shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  User App Live Preview
                </h3>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded-full">
                Active Preview
              </span>
            </div>

            <p className="text-xs text-slate-400">
              This card reflects how your contact details appear inside the mobile user screen:
            </p>

            {/* Simulated User App Card */}
            <div className="bg-slate-100 p-3.5 rounded-2xl space-y-2.5 text-slate-800 shadow-inner">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 bg-white">
                <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs font-bold text-slate-900 truncate">
                  {contactForm.userSupportPhone || '9981570665'}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 bg-white">
                <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs font-medium text-slate-900 truncate">
                  {contactForm.userSupportEmail || 'Searchmydrivers@gmail.com'}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 bg-white">
                <MessageSquare className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs font-medium text-slate-700 truncate">
                  {contactForm.userSupportResponseTime || 'We usually reply within 24 hours.'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* SECTION 2: User Support Tickets Management */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Headset className="w-5 h-5 text-amber-500" />
              Customer Support Tickets
            </h2>
            <p className="text-xs text-slate-500">
              View inquiries raised by registered users, send replies, and resolve tickets.
            </p>
          </div>

          {/* Stats Badges */}
          <div className="flex items-center gap-2 text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                statusFilter === 'open'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              Open ({openCount})
            </button>
            <button
              onClick={() => setStatusFilter('resolved')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                statusFilter === 'resolved'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              Resolved ({resolvedCount})
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ticket #, customer name, phone, or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-sm"
          />
        </div>

        {/* Tickets Table Card */}
        <Card className="p-0 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm">
          {loadingTickets ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500" />
              <p className="text-sm font-medium">Loading user support tickets...</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No support tickets found</p>
              <p className="text-xs text-slate-400">
                {search.trim()
                  ? 'No tickets match your search filters.'
                  : 'No tickets have been submitted by customers yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Ticket #</th>
                    <th className="px-6 py-3.5">Customer</th>
                    <th className="px-6 py-3.5">Subject & Preview</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((ticket) => {
                    const isResolved = ticket.status === 'resolved';
                    const customerName = ticket.userId?.name || ticket.contactName || 'Customer';
                    const customerPhone = ticket.userId?.phone_no || ticket.userId?.phone || ticket.contactPhone || '—';
                    const repliesCount = ticket.replies?.length || 0;

                    return (
                      <tr
                        key={ticket._id}
                        className="hover:bg-amber-50/40 transition-colors cursor-pointer"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        {/* Ticket Number */}
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{ticket.ticketNumber}</div>
                          {repliesCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-0.5">
                              <MessageSquare className="w-3 h-3" /> {repliesCount} replies
                            </span>
                          )}
                        </td>

                        {/* Customer Info */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs uppercase">
                              {customerName.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{customerName}</div>
                              <div className="text-xs text-slate-500 font-mono">{customerPhone}</div>
                            </div>
                          </div>
                        </td>

                        {/* Subject */}
                        <td className="px-6 py-4 max-w-xs">
                          <p className="font-medium text-slate-800 truncate">{ticket.subject}</p>
                          <p className="text-xs text-slate-400 truncate">{ticket.description}</p>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              isResolved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isResolved ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {isResolved ? 'Resolved' : 'Open'}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : '—'}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicket(ticket);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <span>Open Thread</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Ticket Details & Reply Modal */}
      {selectedTicket && (
        <Modal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          title={`Ticket: ${selectedTicket.ticketNumber}`}
          className="max-w-2xl"
        >
          <div className="space-y-4 max-h-[80vh] flex flex-col">
            {/* Header info bar */}
            <div className="flex items-start justify-between bg-slate-50 p-4 rounded-xl border border-slate-100 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedTicket.userId?.name || selectedTicket.contactName || 'User'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    ({selectedTicket.userId?.phone_no || selectedTicket.userId?.phone || selectedTicket.contactPhone || '—'})
                  </span>
                </div>
                <h4 className="font-semibold text-slate-800 text-sm mt-1">{selectedTicket.subject}</h4>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    selectedTicket.status === 'resolved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedTicket.status === 'resolved' ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                  {selectedTicket.status === 'resolved' ? 'Resolved' : 'Open'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleResolve(
                      selectedTicket._id,
                      selectedTicket.status === 'resolved' ? 'open' : 'resolved'
                    )
                  }
                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 font-medium hover:bg-slate-200 transition-colors"
                >
                  {selectedTicket.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                </button>
              </div>
            </div>

            {/* Message Thread Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-3 p-1 min-h-[160px] max-h-[300px]">
              {/* Original User Issue */}
              <div className="bg-slate-100/80 p-3.5 rounded-2xl border border-slate-200 text-slate-800 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>Customer Inquiry</span>
                  <span>{new Date(selectedTicket.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-xs whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.description}
                </p>
              </div>

              {/* Replies */}
              {(selectedTicket.replies || []).map((reply, i) => {
                const isAdmin = reply.senderType === 'admin';
                return (
                  <div
                    key={i}
                    className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                      <span>{isAdmin ? 'Admin (You)' : selectedTicket.userId?.name || 'Customer'}</span>
                      <span>•</span>
                      <span>{new Date(reply.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                        isAdmin
                          ? 'bg-amber-600 text-white rounded-tr-none'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                      }`}
                    >
                      {reply.message}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Admin Reply Input */}
            <div className="border-t border-slate-100 pt-3 space-y-2.5">
              <textarea
                rows={2}
                placeholder="Type your reply to the customer..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-400">
                  Sending a reply immediately alerts the customer in their app.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sendingReply || !replyMessage.trim()}
                    onClick={() => handleSendReply(true)}
                    className="text-xs px-3 py-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  >
                    Reply & Resolve
                  </Button>
                  <Button
                    type="button"
                    disabled={sendingReply || !replyMessage.trim()}
                    onClick={() => handleSendReply(false)}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm"
                  >
                    <Send className={`w-3.5 h-3.5 ${sendingReply ? 'animate-spin' : ''}`} />
                    <span>{sendingReply ? 'Sending...' : 'Send Reply'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
