import { useEffect, useState } from 'react';
import {
  Wallet,
  Plus,
  ArrowDownToLine,
  Settings2,
  RefreshCw,
  Search,
  Loader2,
  TrendingUp,
  CircleSlash,
  AlertOctagon,
  Sparkles,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import Badge from '../../../components/Badge';
import api from '../../../utils/api';
import useAdminRevenueStore from '../../../store/admin/useAdminRevenueStore';
import toast from 'react-hot-toast';
import ManageWithdrawals from './ManageWithdrawals';

const SOURCE_META = {
  commission: { label: 'Commission', variant: 'success', icon: TrendingUp },
  cancellation_fee: { label: 'Cancellation', variant: 'warning', icon: CircleSlash },
  driver_penalty: { label: 'Driver penalty', variant: 'danger', icon: AlertOctagon },
  no_kit_penalty: { label: 'No-Kit Penalty', variant: 'danger', icon: AlertOctagon },
  subscription: { label: 'Subscription', variant: 'primary', icon: Sparkles },
  wallet_top_up: { label: 'Razorpay Add', variant: 'success', icon: Plus },
  wallet_withdrawal: { label: 'Withdrawal', variant: 'danger', icon: ArrowDownToLine },
  manual_add: { label: 'Manual Add', variant: 'primary', icon: Plus },
  manual_deduct: { label: 'Manual Deduct', variant: 'warning', icon: Settings2 },
  admin_adjustment: { label: 'Adjustment', variant: 'info', icon: Settings2 },
};

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
];

function formatCurrency(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeDateBounds(period) {
  const now = new Date();
  let from = '';
  let to = '';

  if (period === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  } else if (period === 'week') {
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0).toISOString();
    to = now.toISOString();
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
    to = now.toISOString();
  } else if (period === 'year') {
    from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).toISOString();
    to = now.toISOString();
  }

  return { from, to };
}

const AdminWalletPage = () => {
  const rows = useAdminRevenueStore((s) => s.rows);
  const loading = useAdminRevenueStore((s) => s.loading);
  const page = useAdminRevenueStore((s) => s.page);
  const limit = useAdminRevenueStore((s) => s.limit);
  const total = useAdminRevenueStore((s) => s.total);
  const filters = useAdminRevenueStore((s) => s.filters);
  const fetchRevenue = useAdminRevenueStore((s) => s.fetchRevenue);
  const setFilter = useAdminRevenueStore((s) => s.setFilter);
  const setPage = useAdminRevenueStore((s) => s.setPage);

  const [period, setPeriod] = useState('all');
  const [walletState, setWalletState] = useState({
    balance: 0,
    commission: { totalAmount: 0, count: 0, period: 'all' },
    totalRevenue: 0,
    breakdown: {},
  });
  const [loadingState, setLoadingState] = useState(true);
  const [activeTab, setActiveTab] = useState('revenue'); // 'revenue' | 'withdrawals'

  // Modals state
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Forms state
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [adjustType, setAdjustType] = useState('add');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchWalletState = async (selectedPeriod = period) => {
    try {
      const res = await api.get('/admin-wallet/state', {
        params: { period: selectedPeriod },
      });
      if (res.data?.data) {
        setWalletState(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingState(false);
    }
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    fetchWalletState(newPeriod);
    const { from, to } = computeDateBounds(newPeriod);
    setFilter({ from, to });
  };

  useEffect(() => {
    fetchWalletState(period);
    fetchRevenue().catch(() => {});
  }, [fetchRevenue]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleAction = async (endpoint, payload) => {
    setIsSubmitting(true);
    try {
      await api.post(`/admin-wallet/${endpoint}`, payload);
      toast.success('Transaction successful');
      setAmount('');
      setNote('');
      setShowTopUp(false);
      setShowWithdraw(false);
      setShowManual(false);
      fetchWalletState(period);
      fetchRevenue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transaction failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentPeriodLabel = PERIOD_OPTIONS.find((p) => p.id === period)?.label || 'All Time';

  const renderModal = () => {
    if (!showTopUp && !showWithdraw && !showManual) return null;

    let title = '';
    let endpoint = '';
    let payload = {};

    if (showTopUp) {
      title = 'Add Funds (Dummy Razorpay)';
      endpoint = 'add-funds';
      payload = { amount: Number(amount), note };
    } else if (showWithdraw) {
      title = 'Withdraw Funds (Dummy)';
      endpoint = 'withdraw-funds';
      payload = { amount: Number(amount), note };
    } else {
      title = 'Manual Adjustment';
      endpoint = 'manual-adjustment';
      payload = { amount: Number(amount), note, type: adjustType };
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-semibold text-slate-800 text-lg">{title}</h3>
            <button
              onClick={() => {
                setShowTopUp(false);
                setShowWithdraw(false);
                setShowManual(false);
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
            {showManual && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Adjustment Type
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm outline-none bg-white"
                >
                  <option value="add">Add Funds (+)</option>
                  <option value="deduct">Deduct Funds (-)</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm outline-none bg-white"
                placeholder="e.g. 500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-sm outline-none bg-white"
                placeholder="Reason for transaction..."
              />
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
            <button
              onClick={() => {
                setShowTopUp(false);
                setShowWithdraw(false);
                setShowManual(false);
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction(endpoint, payload)}
              disabled={isSubmitting || !amount || Number(amount) <= 0}
              className="h-10 px-6 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Admin Wallet & Commission
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage platform funds, monitor admin commissions, withdrawals, and manual adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchWalletState(period);
              fetchRevenue();
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('revenue')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'revenue'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Platform Revenue & Commission
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'withdrawals'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          User/Driver Withdrawals
        </button>
      </div>

      {activeTab === 'withdrawals' ? (
        <ManageWithdrawals />
      ) : (
        <>
          {/* Period Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Time Period Filter:</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {currentPeriodLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handlePeriodChange(opt.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    period === opt.id
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1: Available Balance */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Available Balance
                  </p>
                  <span className="p-2 bg-slate-100 text-slate-700 rounded-xl">
                    <Wallet className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                    {loadingState ? '...' : formatCurrency(walletState.balance)}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">Current live platform reserve funds</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowTopUp(true)}
                  className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-200"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Funds
                </button>
                <button
                  onClick={() => setShowWithdraw(true)}
                  className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl hover:bg-rose-100 transition-colors border border-rose-200"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" /> Withdraw
                </button>
                <button
                  onClick={() => setShowManual(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-200 transition-colors border border-slate-200"
                  title="Manual Adjustment"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Adjust
                </button>
              </div>
            </div>

            {/* Card 2: Admin Commission */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                    Admin Commission
                  </p>
                  <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <TrendingUp className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 tracking-tight">
                    {loadingState ? '...' : formatCurrency(walletState.commission?.totalAmount || 0)}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                      {walletState.commission?.count || 0} trip commissions ({currentPeriodLabel.toLowerCase()})
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                <span>Earned from completed rides</span>
                <span className="font-semibold text-emerald-600">{currentPeriodLabel}</span>
              </div>
            </div>

            {/* Card 3: Total Platform Earnings */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    Total Platform Revenue
                  </p>
                  <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Layers className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                    {loadingState ? '...' : formatCurrency(walletState.totalRevenue || 0)}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">
                    Commissions + cancellations + subscriptions
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Cancellation fees:</span>
                <span className="font-semibold text-slate-700">
                  {formatCurrency(walletState.breakdown?.cancellation_fee?.amount || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-800">Transaction Ledger</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-600 font-medium">
                  {currentPeriodLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search booking number..."
                    value={filters.search}
                    onChange={(e) => setFilter('search', e.target.value)}
                    className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                <select
                  value={filters.source}
                  onChange={(e) => setFilter('source', e.target.value)}
                  className="h-9 px-3 text-xs font-medium rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none bg-white text-slate-700"
                >
                  <option value="">All Sources</option>
                  <option value="commission">Commission</option>
                  <option value="cancellation_fee">Cancellation</option>
                  <option value="driver_penalty">Driver Penalty</option>
                  <option value="subscription">Subscription</option>
                  <option value="wallet_top_up">Top-up</option>
                  <option value="wallet_withdrawal">Withdrawal</option>
                  <option value="manual_add">Manual Add</option>
                  <option value="manual_deduct">Manual Deduct</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Transaction / Booking</th>
                    <th className="px-6 py-4">Source</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Driver</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Occurred</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading ledger...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No transactions found for the selected {currentPeriodLabel.toLowerCase()}.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const meta = SOURCE_META[row.source] || {
                        label: row.source,
                        variant: 'secondary',
                        icon: Wallet,
                      };
                      const Icon = meta.icon;
                      const isNegative = row.amountRupees < 0;

                      return (
                        <tr key={row._id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            {row.bookingNumber ? (
                              <div>
                                <span className="font-medium text-slate-700 block">
                                  {row.bookingNumber}
                                </span>
                                <span className="text-xs text-slate-400">{row._id.slice(-6)}</span>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-700">
                                  Non-booking transaction
                                </span>
                                <span className="text-xs text-slate-400">
                                  {row.meta?.note || row._id.slice(-6)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant={meta.variant}
                              className="flex w-max items-center gap-1.5 px-2.5 py-1"
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {row.userId?.firstName || row.userId?.name || '—'}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {row.driverId?.firstName || row.driverId?.name || '—'}
                          </td>
                          <td
                            className={`px-6 py-4 font-semibold ${
                              isNegative ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {isNegative ? '-' : '+'}
                            {formatCurrency(Math.abs(row.amountRupees))}
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {formatDateTime(row.occurredAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && rows.length > 0 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Showing <span className="font-medium text-slate-700">{(page - 1) * limit + 1}</span>{' '}
                  to{' '}
                  <span className="font-medium text-slate-700">
                    {Math.min(page * limit, total)}
                  </span>{' '}
                  of <span className="font-medium text-slate-700">{total}</span> entries
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <div className="flex items-center gap-1 px-2">
                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      let p = page;
                      if (page < 3) p = i + 1;
                      else if (page > totalPages - 2) p = totalPages - 4 + i;
                      else p = page - 2 + i;

                      if (p < 1 || p > totalPages) return null;

                      return (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-8 h-8 flex items-center justify-center text-sm font-medium rounded-lg transition-colors ${
                            page === p
                              ? 'bg-primary text-primary-foreground'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {renderModal()}
    </div>
  );
};

export default AdminWalletPage;
