import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Radio, Users, Car, User, Search, Send, Bell, History } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import api from '../../../utils/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import useAdminAuthStore from '../../../store/useAdminAuthStore';

export default function ManageBroadcast() {
  const [activeTab, setActiveTab] = useState('compose');
  
  // Compose state
  const [audience, setAudience] = useState('all_users');
  const [recipientId, setRecipientId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('info');
  const [loading, setLoading] = useState(false);
  const [targetCity, setTargetCity] = useState('');
  const [targetZone, setTargetZone] = useState('');
  const [zones, setZones] = useState([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // History state
  const [broadcasts, setBroadcasts] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [stats, setStats] = useState({ totalSent: 0, last7DaysCount: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const { admin } = useAdminAuthStore();

  useEffect(() => {
    fetchStats();
    if (activeTab === 'history') {
      fetchHistory();
    }
    // Fetch zones proactively in case they select zone_drivers
    api.get('/admin/zones')
      .then(res => setZones(res.data?.data || []))
      .catch(err => console.log('Failed to fetch zones, user might not have permission', err));
  }, [activeTab, page]);

  // Debounced search for specific user/driver
  useEffect(() => {
    if ((audience !== 'specific_user' && audience !== 'specific_driver') || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const endpoint = audience === 'specific_user' ? '/admin/broadcasts/search-users' : '/admin/broadcasts/search-drivers';
        const res = await api.get(`${endpoint}?q=${searchQuery}`);
        setSearchResults(res.data?.data || []);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, audience]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/admin/broadcasts/stats');
      setStats(res.data?.data || { totalSent: 0, last7DaysCount: 0 });
    } catch (err) {
      console.error('Failed to load stats');
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/admin/broadcasts?page=${page}&limit=10`);
      setBroadcasts(res.data?.data?.broadcasts || []);
      setTotalPages(res.data?.data?.pagination?.pages || 1);
    } catch (err) {
      toast.error('Failed to load broadcast history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSend = async () => {
    if (!title || !body) {
      return toast.error('Please fill in title and message body');
    }
    if ((audience === 'specific_user' || audience === 'specific_driver') && !recipientId) {
      return toast.error('Please select a specific recipient');
    }
    if ((audience === 'city_users' || audience === 'city_drivers') && !targetCity) {
      return toast.error('Please enter a target city');
    }
    if (audience === 'zone_drivers' && !targetZone) {
      return toast.error('Please select a target zone');
    }

    setLoading(true);
    try {
      await api.post('/admin/broadcast', {
        audience,
        recipientId: recipientId || undefined,
        targetCity: targetCity || undefined,
        targetZone: targetZone || undefined,
        title,
        body,
        severity
      });
      toast.success('Broadcast sent successfully');
      setTitle('');
      setBody('');
      setSearchQuery('');
      setRecipientId('');
      setTargetCity('');
      setTargetZone('');
      fetchStats();
      if (activeTab === 'history') fetchHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send broadcast');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'audience',
      label: 'Audience',
      render: (_, row) => (
        <div className="font-medium capitalize">
          {row.audience.replace('_', ' ')}
          {row.sentCount > 0 && <span className="text-xs text-text-muted ml-2">({row.sentCount})</span>}
        </div>
      ),
    },
    {
      key: 'title',
      label: 'Message',
      render: (_, row) => (
        <div className="max-w-[300px]">
          <div className="font-medium truncate">{row.title}</div>
          <div className="text-sm text-text-muted truncate">{row.body}</div>
        </div>
      ),
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (_, row) => {
        const colors = {
          info: 'bg-blue-100 text-blue-700',
          success: 'bg-emerald-100 text-emerald-700',
          warning: 'bg-amber-100 text-amber-700',
          error: 'bg-red-100 text-red-700',
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${colors[row.severity] || colors.info}`}>
            {row.severity}
          </span>
        );
      },
    },
    {
      key: 'sentBy',
      label: 'Sent By',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.sentBy?.profilePicture ? (
            <img src={row.sentBy.profilePicture} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold">
              {row.sentBy?.name?.charAt(0) || '?'}
            </div>
          )}
          <span className="text-sm">{row.sentBy?.name || 'Unknown'}</span>
        </div>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      render: (_, row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <StatusBadge status={row.status === 'sent' ? 'successful' : row.status} />
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="w-6 h-6 text-brand" />
            Broadcast Messages
          </h1>
          <p className="text-text-muted mt-1">Send push notifications and in-app alerts</p>
        </div>

        <div className="flex items-center gap-4">
          <Card className="px-4 py-2 flex items-center gap-3">
            <div className="p-2 bg-brand/10 text-brand rounded-lg">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-text-muted font-medium uppercase">Total Sent</p>
              <p className="text-lg font-bold leading-none mt-0.5">{stats.totalSent}</p>
            </div>
          </Card>
          <Card className="px-4 py-2 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
              <History className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-text-muted font-medium uppercase">Last 7 Days</p>
              <p className="text-lg font-bold leading-none mt-0.5">{stats.last7DaysCount}</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('compose')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'compose' ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          Compose Message
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history' ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          Broadcast History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'compose' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <Card className="lg:col-span-2 p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-3">Select Audience</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'all_users', label: 'All Users', icon: Users },
                  { id: 'all_drivers', label: 'All Drivers', icon: Car },
                  { id: 'all', label: 'Everyone', icon: Radio },
                  { id: 'specific_user', label: 'Specific User', icon: User },
                  { id: 'specific_driver', label: 'Specific Driver', icon: User },
                  { id: 'city_users', label: 'City Users', icon: Users },
                  { id: 'city_drivers', label: 'City Drivers', icon: Car },
                  { id: 'zone_drivers', label: 'Zone Drivers', icon: Car },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setAudience(opt.id);
                      setRecipientId('');
                      setSearchQuery('');
                      setTargetCity('');
                      setTargetZone('');
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                      audience === opt.id
                        ? 'border-brand bg-brand/5 text-brand font-medium ring-1 ring-brand'
                        : 'border-border text-text-muted hover:border-text-muted'
                    }`}
                  >
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {(audience === 'specific_user' || audience === 'specific_driver') && (
              <div>
                <label className="block text-sm font-medium mb-1">Search {audience === 'specific_user' ? 'User' : 'Driver'}</label>
                <div className="relative">
                  <Input
                    icon={Search}
                    placeholder="Search by name or phone..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setRecipientId(''); // reset selection on new search
                    }}
                  />
                  {isSearching && <div className="absolute right-3 top-3 text-xs text-text-muted">Searching...</div>}
                  
                  {/* Dropdown */}
                  {!recipientId && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {searchResults.map((res) => (
                        <div
                          key={res._id}
                          onClick={() => {
                            setRecipientId(res._id);
                            setSearchQuery(`${res.name} (${res.phone_no})`);
                            setSearchResults([]);
                          }}
                          className="px-4 py-2 hover:bg-bg cursor-pointer flex items-center justify-between"
                        >
                          <span className="font-medium">{res.name}</span>
                          <span className="text-sm text-text-muted">{res.phone_no}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchQuery.length >= 2 && !isSearching && !recipientId && searchResults.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-lg shadow-lg p-3 text-sm text-text-muted text-center">
                      No results found
                    </div>
                  )}
                </div>
              </div>
            )}

            {(audience === 'city_users' || audience === 'city_drivers') && (
              <div>
                <label className="block text-sm font-medium mb-1">Target City</label>
                <Input
                  placeholder="e.g. Mumbai"
                  value={targetCity}
                  onChange={(e) => setTargetCity(e.target.value)}
                />
              </div>
            )}

            {audience === 'zone_drivers' && (
              <div>
                <label className="block text-sm font-medium mb-1">Target Zone</label>
                <select
                  className="w-full h-12 px-4 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all appearance-none"
                  value={targetZone}
                  onChange={(e) => setTargetZone(e.target.value)}
                >
                  <option value="">Select a zone</option>
                  {zones.map(z => (
                    <option key={z._id} value={z._id}>{z.name} {z.city ? `(${z.city})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Message Title</label>
              <Input
                placeholder="e.g. System Maintenance, Special Offer..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
              />
              <div className="text-right text-xs text-text-muted mt-1">{title.length}/80</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Message Body</label>
              <textarea
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none transition-colors"
                rows={4}
                placeholder="Type your message here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={500}
              />
              <div className="text-right text-xs text-text-muted mt-1">{body.length}/500</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">Severity Level</label>
              <div className="flex gap-3">
                {[
                  { id: 'info', color: 'blue' },
                  { id: 'success', color: 'emerald' },
                  { id: 'warning', color: 'amber' },
                  { id: 'error', color: 'red' },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSeverity(s.id)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize border transition-all ${
                      severity === s.id
                        ? `bg-${s.color}-100 text-${s.color}-700 border-${s.color}-300`
                        : 'bg-bg text-text-muted border-border hover:bg-surface'
                    }`}
                  >
                    {s.id}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-end">
              <Button
                onClick={handleSend}
                loading={loading}
                disabled={!title || !body || (admin?.role !== 'admin')}
                icon={Send}
                title={admin?.role !== 'admin' ? "Only Super Admins can send broadcasts" : "Send Broadcast"}
              >
                Send Broadcast
              </Button>
            </div>
          </Card>

          {/* Preview Panel */}
          <div className="space-y-4">
            <h3 className="font-semibold px-1">Notification Preview</h3>
            
            <Card className="p-4 relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${
                severity === 'info' ? 'bg-blue-500' :
                severity === 'success' ? 'bg-emerald-500' :
                severity === 'warning' ? 'bg-amber-500' :
                'bg-red-500'
              }`} />
              
              <div className="flex items-start gap-3 pl-2">
                <div className={`mt-0.5 p-2 rounded-full ${
                  severity === 'info' ? 'bg-blue-100 text-blue-600' :
                  severity === 'success' ? 'bg-emerald-100 text-emerald-600' :
                  severity === 'warning' ? 'bg-amber-100 text-amber-600' :
                  'bg-red-100 text-red-600'
                }`}>
                  <Bell className="w-4 h-4" />
                </div>
                
                <div className="flex-1">
                  <h4 className="text-sm font-bold leading-tight line-clamp-2 break-words">
                    {title || 'Message Title'}
                  </h4>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed line-clamp-4 break-words">
                    {body || 'Your message body will appear here...'}
                  </p>
                  <p className="text-[10px] text-text-muted/60 mt-2">Just now</p>
                </div>
              </div>
            </Card>

            <div className="bg-brand/5 border border-brand/20 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-brand mb-1">Delivery Info</h4>
              <ul className="text-xs text-text-muted space-y-1.5 list-disc pl-4">
                <li>Real-time in-app delivery for online users</li>
                <li>Push notification delivery to devices via FCM</li>
                <li>Stored in recipient's notification inbox</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            data={broadcasts}
            loading={historyLoading}
            emptyMessage="No broadcast history found"
          />
          {totalPages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-text-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
