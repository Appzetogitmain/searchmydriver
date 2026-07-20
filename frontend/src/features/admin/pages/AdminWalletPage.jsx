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
  subscription: { label: 'Subscription', variant: 'primary', icon: Sparkles },
  wallet_top_up: { label: 'Razorpay Add', variant: 'success', icon: Plus },
  wallet_withdrawal: { label: 'Withdrawal', variant: 'danger', icon: ArrowDownToLine },
  manual_add: { label: 'Manual Add', variant: 'primary', icon: Plus },
  manual_deduct: { label: 'Manual Deduct', variant: 'warning', icon: Settings2 },
  admin_adjustment: { label: 'Adjustment', variant: 'info', icon: Settings2 },
};

function formatCurrency(n) {
  const v = Number(n) || 0;
  return `\u20B9${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDateTime(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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

  const [walletBalance, setWalletBalance] = useState(0);
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

  const fetchWalletState = async () => {
    try {
      const res = await api.get('/admin-wallet/state');
      setWalletBalance(res.data?.data?.balance || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingState(false);
    }
  };

  useEffect(() => {
    fetchWalletState();
    fetchRevenue().catch(() => {});
  }, [fetchRevenue]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleAction = async (endpoint, payload) => {
    setIsSubmitting(true);
    try {
      await api.post(`/admin-wallet/${endpoint}`, payload);
      toast.success('Transaction successful');
      setAmount(''); setNote('');
      setShowTopUp(false); setShowWithdraw(false); setShowManual(false);
      fetchWalletState();
      fetchRevenue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transaction failed');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-semibold text-slate-800 text-lg">{title}</h3>
            <button
              onClick={() => {
                setShowTopUp(false); setShowWithdraw(false); setShowManual(false);
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
            {showManual && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Adjustment Type</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
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
                setShowTopUp(false); setShowWithdraw(false); setShowManual(false);
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
      {/* Header & Wallet Balance */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Admin Wallet
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage platform funds, commissions, withdrawals, and manual adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchWalletState(); fetchRevenue(); }}
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
          Platform Revenue
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-1 md:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Available Balance</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-900">
                {loadingState ? '...' : formatCurrency(walletBalance)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 font-medium rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-200"
            >
              <Plus className="w-4 h-4" /> Add Funds
            </button>
            <button
              onClick={() => setShowWithdraw(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-700 font-medium rounded-xl hover:bg-rose-100 transition-colors border border-rose-200"
            >
              <ArrowDownToLine className="w-4 h-4" /> Withdraw
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors border border-slate-200"
            >
              <Settings2 className="w-4 h-4" /> Manual Adjust
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="font-semibold text-slate-800">Transaction Ledger</h2>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by booking number..."
                value={filters.search}
                onChange={(e) => setFilter({ search: e.target.value })}
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
            </div>
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
                    No transactions found matching your criteria.
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
                            <span className="font-medium text-slate-700">Non-booking transaction</span>
                            <span className="text-xs text-slate-400">{row.meta?.note || row._id.slice(-6)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={meta.variant} className="flex w-max items-center gap-1.5 px-2.5 py-1">
                          <Icon className="w-3.5 h-3.5" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.userId?.firstName || row.userId?.name || '\u2014'}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {row.driverId?.firstName || row.driverId?.name || '\u2014'}
                      </td>
                      <td className={`px-6 py-4 font-semibold ${isNegative ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {isNegative ? '-' : '+'}{formatCurrency(Math.abs(row.amountRupees))}
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
              Showing <span className="font-medium text-slate-700">{(page - 1) * limit + 1}</span> to{' '}
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
