import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  RefreshCcw,
  Calendar,
  ArrowDownAZ,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import TopupSheet from '../components/TopupSheet';
import WithdrawFundsModal from '../../../../components/WithdrawFundsModal';
import EditBankDetailsModal from '../../../../components/EditBankDetailsModal';

/**
 * Full-page wallet view: balance, lifetime totals (Total Credited & Total Debited),
 * and the transaction ledger with chronological (A-Z) and alphabetical sorting & filtering.
 */
const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'chronological_asc', label: 'Chronological (A → Z)', subtitle: 'Oldest to Newest' },
  { value: 'chronological_desc', label: 'Latest First (Z → A)', subtitle: 'Newest to Oldest' },
  { value: 'alpha_asc', label: 'Alphabetical (A → Z)', subtitle: 'Name A to Z' },
  { value: 'alpha_desc', label: 'Alphabetical (Z → A)', subtitle: 'Name Z to A' },
];

const FILTER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'credit', label: 'Credited' },
  { value: 'debit', label: 'Debited' },
];

const WalletPage = () => {
  const navigate = useNavigate();
  const wallet = useUserWalletStore((s) => s.wallet);
  const transactions = useUserWalletStore((s) => s.transactions);
  const loading = useUserWalletStore((s) => s.loading);
  const fetched = useUserWalletStore((s) => s.fetched);
  const page = useUserWalletStore((s) => s.page);
  const hasMore = useUserWalletStore((s) => s.hasMore);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const fetchTransactions = useUserWalletStore((s) => s.fetchTransactions);

  const [topupOpen, setTopupOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editBankOpen, setEditBankOpen] = useState(false);

  // Sorting & filtering states (Default: Chronological A -> Z)
  const [sortMode, setSortMode] = useState('chronological_asc');
  const [directionFilter, setDirectionFilter] = useState('all');

  useEffect(() => {
    fetchWallet().catch(() => {});
    fetchTransactions({
      page: 1,
      limit: PAGE_SIZE,
      sort: sortMode,
      direction: directionFilter,
    }).catch(() => {});
  }, [fetchWallet, fetchTransactions, sortMode, directionFilter]);

  const onRefresh = () => {
    fetchWallet().catch(() => {});
    fetchTransactions({
      page: 1,
      limit: PAGE_SIZE,
      sort: sortMode,
      direction: directionFilter,
    }).catch(() => {});
  };

  const onLoadMore = () => {
    if (loading || !hasMore) return;
    fetchTransactions({
      page: page + 1,
      limit: PAGE_SIZE,
      append: true,
      sort: sortMode,
      direction: directionFilter,
    }).catch(() => {});
  };

  // Spendable amount calculation
  const heldRupees = Number(wallet.heldRupees || 0);
  const balance = Number(wallet.balance || 0);
  const available =
    wallet.availableRupees != null
      ? Number(wallet.availableRupees)
      : Math.max(0, balance - heldRupees);
  const fmt = (n) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const balanceLabel = useMemo(() => fmt(available), [available]);

  // Client-side deterministic sorting of transactions array
  const displayTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    let list = [...transactions];

    if (directionFilter !== 'all') {
      list = list.filter((tx) => tx.direction === directionFilter);
    }

    if (sortMode === 'chronological_asc') {
      return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    if (sortMode === 'chronological_desc') {
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (sortMode === 'alpha_asc') {
      return list.sort((a, b) => {
        const nameA = (a.description || sourceLabel(a.source) || '').toLowerCase();
        const nameB = (b.description || sourceLabel(b.source) || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    if (sortMode === 'alpha_desc') {
      return list.sort((a, b) => {
        const nameA = (a.description || sourceLabel(a.source) || '').toLowerCase();
        const nameB = (b.description || sourceLabel(b.source) || '').toLowerCase();
        return nameB.localeCompare(nameA);
      });
    }
    return list;
  }, [transactions, sortMode, directionFilter]);

  const activeSortLabel = SORT_OPTIONS.find((o) => o.value === sortMode)?.label || 'Chronological (A → Z)';

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      {/* Top Header */}
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-text">My wallet</h1>
            <p className="text-xs text-text-muted">
              Pay for bookings instantly from your balance.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 rounded-xl text-text-muted hover:bg-gray-100"
            aria-label="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Wallet Balance & Totals Card */}
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-widest text-white/60 font-medium">Available Balance</p>
          <p className="text-3xl font-bold mt-1 tracking-tight">{balanceLabel}</p>
          {heldRupees > 0 && (
            <p className="text-xs text-emerald-300 mt-1">
              {fmt(heldRupees)} held · total {fmt(balance)}
            </p>
          )}

          {/* Stats: Total Credited & Total Debited Cards */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            {/* Total Credited */}
            <button
              type="button"
              onClick={() => setDirectionFilter((prev) => (prev === 'credit' ? 'all' : 'credit'))}
              className={`text-left rounded-2xl p-3.5 border transition-all cursor-pointer ${
                directionFilter === 'credit'
                  ? 'bg-emerald-500/20 border-emerald-400/50 ring-2 ring-emerald-400/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
              title="Click to filter Credited transactions"
            >
              <div className="flex items-center gap-1.5 text-emerald-400">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-3 h-3" />
                </div>
                <span className="uppercase tracking-wider text-[10px] font-bold text-white/70 truncate">
                  Total Credited
                </span>
              </div>
              <p className="text-base font-bold text-emerald-400 mt-2 truncate">
                {fmt(wallet.totalCredited || 0)}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">Money in</p>
            </button>

            {/* Total Debited */}
            <button
              type="button"
              onClick={() => setDirectionFilter((prev) => (prev === 'debit' ? 'all' : 'debit'))}
              className={`text-left rounded-2xl p-3.5 border transition-all cursor-pointer ${
                directionFilter === 'debit'
                  ? 'bg-rose-500/20 border-rose-400/50 ring-2 ring-rose-400/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
              title="Click to filter Debited transactions"
            >
              <div className="flex items-center gap-1.5 text-rose-400">
                <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-3 h-3" />
                </div>
                <span className="uppercase tracking-wider text-[10px] font-bold text-white/70 truncate">
                  Total Debited
                </span>
              </div>
              <p className="text-base font-bold text-rose-400 mt-2 truncate">
                {fmt(wallet.totalDebited ?? wallet.totalSpent ?? 0)}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">Money out</p>
            </button>
          </div>

          {/* Action buttons */}
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setTopupOpen(true)}
              className="w-full flex justify-center items-center gap-1.5 px-4 py-2.5 bg-yellow-400 text-slate-900 text-sm font-bold rounded-xl hover:bg-yellow-300 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Money
            </button>
          </div>
        </div>

        {/* Recent activity & transactions ledger */}
        <div className="space-y-3">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text">Transactions</h2>
              {loading && fetched && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />
              )}
            </div>

            {/* Sort Selector Dropdown */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="relative inline-flex items-center">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-text shadow-2xs hover:bg-gray-50 transition-colors pointer-events-none">
                  {sortMode.startsWith('alpha') ? (
                    <ArrowDownAZ className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                  )}
                  <span className="truncate max-w-[170px]">{activeSortLabel}</span>
                  <ArrowUpDown className="w-3 h-3 text-text-muted ml-0.5 shrink-0" />
                </div>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Sort transactions"
                >
                  <option value="chronological_asc">📅 Chronological (A → Z: Oldest First)</option>
                  <option value="chronological_desc">📅 Latest First (Z → A: Newest First)</option>
                  <option value="alpha_asc">🔤 Alphabetical (A → Z: By Name)</option>
                  <option value="alpha_desc">🔤 Alphabetical (Z → A: By Name)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 px-1 overflow-x-auto pb-1">
            <span className="text-[11px] text-text-muted font-medium flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {FILTER_TABS.map((tab) => {
              const active = directionFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setDirectionFilter(tab.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-text-muted border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Transactions List */}
          {!fetched && loading ? (
            <Card>
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              </div>
            </Card>
          ) : displayTransactions.length === 0 ? (
            <Card>
              <div className="text-center py-8 px-4 text-sm text-text-muted">
                <p className="font-medium text-text">No transactions found</p>
                <p className="text-xs text-text-muted mt-1">
                  {directionFilter !== 'all'
                    ? `No ${directionFilter} transactions found. Try selecting "All".`
                    : 'Your wallet transaction history will appear here.'}
                </p>
              </div>
            </Card>
          ) : (
            <>
              <Card padding="p-0" className="divide-y divide-border-light overflow-hidden shadow-2xs">
                {displayTransactions.map((tx) => (
                  <TransactionRow key={tx._id} tx={tx} />
                ))}
              </Card>
              {hasMore && (
                <Button
                  fullWidth
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  loading={loading}
                  onClick={onLoadMore}
                >
                  Load more
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <TopupSheet
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        title="Add money to wallet"
        subtitle="Use UPI, cards, netbanking or wallets."
        onSuccess={() => {
          fetchWallet().catch(() => {});
          fetchTransactions({
            page: 1,
            limit: PAGE_SIZE,
            sort: sortMode,
            direction: directionFilter,
          }).catch(() => {});
        }}
      />

      <WithdrawFundsModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        maxAmount={available}
        isDriver={false}
        bankDetails={wallet?.bankDetails}
        onWithdrawSuccess={() => {
          fetchWallet().catch(() => {});
          fetchTransactions({
            page: 1,
            limit: PAGE_SIZE,
            sort: sortMode,
            direction: directionFilter,
          }).catch(() => {});
        }}
      />

      <EditBankDetailsModal
        isOpen={editBankOpen}
        onClose={() => setEditBankOpen(false)}
        initialData={wallet?.bankDetails}
        isDriver={false}
        onSave={() => {
          fetchWallet().catch(() => {});
          setEditBankOpen(false);
          setWithdrawOpen(true);
        }}
      />
    </div>
  );
};

function TransactionRow({ tx }) {
  const isCredit = tx.direction === 'credit';
  const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
  const tone = isCredit ? 'text-success bg-success/10' : 'text-text bg-gray-100';
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 hover:bg-gray-50/70 transition-colors">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">
          {tx.description || sourceLabel(tx.source)}
        </p>
        <p className="text-[11px] text-text-muted">
          {formatDate(tx.createdAt)} · <span className="capitalize">{tx.status}</span>
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${isCredit ? 'text-success' : 'text-text'}`}>
          {isCredit ? '+' : '-'}₹{Number(tx.amountRupees || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-[10px] text-text-muted">
          bal ₹{Number(tx.balanceAfter || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  );
}

function sourceLabel(source) {
  switch (source) {
    case 'topup':
      return 'Wallet top-up';
    case 'admin_credit':
      return 'Credit from support';
    case 'admin_debit':
      return 'Adjustment by support';
    case 'booking_payment':
      return 'Booking payment';
    case 'booking_refund':
      return 'Booking refund';
    case 'booking_no_drivers_refund':
      return 'Refund (no drivers)';
    case 'waiting_charge':
      return 'Waiting charge';
    case 'booking_extension_payment':
      return 'Booking extension';
    case 'referral_reward':
      return 'Referral reward';
    case 'signup_bonus':
      return 'Signup bonus';
    default:
      return source ? source.replace(/_/g, ' ') : 'Transaction';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default WalletPage;
