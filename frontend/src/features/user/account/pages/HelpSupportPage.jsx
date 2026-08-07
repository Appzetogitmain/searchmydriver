import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, Mail, Phone, MessageSquare, Clock, CheckCircle, ChevronRight } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import HelpDeskModal from '../../../../components/HelpDeskModal';
import UserDriverTicketThreadModal from '../../../../components/UserDriverTicketThreadModal';
import api from '../../../../utils/api';

export default function HelpSupportPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const fetchMyTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await api.get('/user/support/my-tickets');
      setTickets(res.data?.tickets || []);
    } catch (err) {
      console.error('Failed to fetch user support tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    fetchMyTickets();
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <Header onBack={() => navigate('/user/account')} />
      <div className="flex-1 p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-text">Need help?</h2>
              <p className="text-sm text-text-secondary">Open a support ticket and our team will follow up.</p>
            </div>
          </div>
          <Button fullWidth onClick={() => setOpen(true)}>Open support form</Button>
        </Card>

        {/* My Support Tickets List */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-text text-sm">My Support Tickets</h3>
          {loadingTickets ? (
            <p className="text-xs text-text-muted">Loading your tickets...</p>
          ) : tickets.length === 0 ? (
            <p className="text-xs text-text-muted">You haven't opened any support tickets yet.</p>
          ) : (
            <div className="divide-y divide-border-light">
              {tickets.map((t) => {
                const isResolved = t.status === 'resolved';
                const hasReplies = t.replies && t.replies.length > 0;
                return (
                  <button
                    key={t._id}
                    type="button"
                    onClick={() => setSelectedTicket(t)}
                    className="w-full text-left py-3 flex items-center justify-between hover:bg-slate-50 rounded-lg transition-colors px-1"
                  >
                    <div className="space-y-1 min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text">{t.ticketNumber}</span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isResolved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {isResolved ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {isResolved ? 'Resolved' : 'Open'}
                        </span>
                        {hasReplies && (
                          <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {t.replies.length} replies
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-text truncate">{t.subject}</p>
                      <p className="text-[11px] text-text-muted truncate">{t.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <a href="tel:9981570665" className="flex items-center gap-3 rounded-2xl border border-border-light px-3 py-3 bg-white">
            <Phone className="w-4 h-4 text-text-secondary" />
            <span className="text-sm font-medium text-text">9981570665</span>
          </a>
          <a href="mailto:Searchmydrivers@gmail.com" className="flex items-center gap-3 rounded-2xl border border-border-light px-3 py-3 bg-white">
            <Mail className="w-4 h-4 text-text-secondary" />
            <span className="text-sm font-medium text-text">Searchmydrivers@gmail.com</span>
          </a>
          <div className="flex items-center gap-3 rounded-2xl border border-border-light px-3 py-3 bg-white">
            <MessageSquare className="w-4 h-4 text-text-secondary" />
            <span className="text-sm font-medium text-text">We usually reply within 24 hours.</span>
          </div>
        </Card>
      </div>

      <HelpDeskModal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          fetchMyTickets();
        }}
        userType="user"
      />

      {selectedTicket && (
        <UserDriverTicketThreadModal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          ticket={selectedTicket}
          userType="user"
          onTicketUpdated={(updated) => {
            setSelectedTicket(updated);
            fetchMyTickets();
          }}
        />
      )}
    </div>
  );
}

function Header({ onBack }) {
  return (
    <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-text">Help & Support</h1>
          <p className="text-xs text-text-muted">Contact our team</p>
        </div>
      </div>
    </div>
  );
}
