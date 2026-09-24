import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import BottomSheet from '../../../../components/BottomSheet';
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  Wallet,
  Inbox,
  Car,
  XCircle,
  AlertOctagon,
  ChevronRight,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  CreditCard,
  Gift,
  Zap,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import {
  useDriverEarningsStore,
  useDriverEarningsLedgerStore,
} from '../../../../store/driver/useDriverTripsStore';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatCurrency } from '../../../../utils/formatters';
import DriverScreenShell from '../../components/DriverScreenShell';
import DriverTopupSheet from '../../components/DriverTopupSheet';
import WithdrawFundsModal from '../../../../components/WithdrawFundsModal';
import EditBankDetailsModal from '../../../../components/EditBankDetailsModal';

const EMPTY = { earnings: 0, trips: 0 };

const CATEGORY_TABS = [
  { id: 'all', label: 'All Transactions' },
  { id: 'credit', label: 'Credits (+)' },
  { id: 'auto_deduction', label: 'Auto Deductions' },
  { id: 'penalty', label: 'Penalties' },
  { id: 'debit', label: 'Debits (−)' },
];

/**
 * Categorize transaction source into visual types & icons
 */
export function getTransactionMeta(tx) {
  const source = tx.source || '';
  const direction = tx.direction || (source === 'trip_earning' || source === 'topup' ? 'credit' : 'debit');

  if (source === 'no_kit_penalty' || source === 'driver_cancellation_penalty' || source === 'cancellation_fee') {
    return {
      category: 'penalty',
      categoryLabel: 'Penalty',
      title: source === 'no_kit_penalty' ? 'No Driver Kit Penalty' : 'Cancellation Penalty',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
      tone: 'text-rose-700 bg-rose-100',
      Icon: AlertOctagon,
    };
  }

  if (source === 'cash_trip_settlement' || source === 'monthly_registration_deduction') {
    return {
      category: 'auto_deduction',
      categoryLabel: 'Auto Deduction',
      title:
        source === 'cash_trip_settlement'
          ? 'Cash Ride Platform Settlement'
          : 'Monthly Ride Cash Registration Fee',
      badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      tone: 'text-indigo-700 bg-indigo-100',
      Icon: Zap,
    };
  }

  if (direction === 'credit') {
    if (source === 'topup') {
      return {
        category: 'credit',
        categoryLabel: 'Top-up',
        title: 'Wallet Recharge / Top-up',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        tone: 'text-emerald-700 bg-emerald-100',
        Icon: Plus,
      };
    }
    if (source === 'referral_reward' || source === 'signup_bonus') {
      return {
        category: 'credit',
        categoryLabel: 'Reward',
        title: source === 'signup_bonus' ? 'Signup Referral Bonus' : 'Referral Reward',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
        tone: 'text-purple-700 bg-purple-100',
        Icon: Gift,
      };
    }
    if (source === 'cancellation_fee_waived' || source === 'booking_refund') {
      return {
        category: 'credit',
        categoryLabel: 'Refund',
        title: 'Refund / Adjustment',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
        tone: 'text-teal-700 bg-teal-100',
        Icon: ArrowDownLeft,
      };
    }
    return {
      category: 'credit',
      categoryLabel: 'Trip Credit',
      title: tx.description || 'Trip Earning Payout',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      tone: 'text-emerald-700 bg-emerald-100',
      Icon: Car,
    };
  }

  // General Debits / Withdrawals
  if (source === 'withdrawal') {
    return {
      category: 'debit',
      categoryLabel: 'Withdrawal',
      title: 'Wallet Withdrawal Payout',
      badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
      tone: 'text-slate-700 bg-slate-100',
      Icon: ArrowUpRight,
    };
  }

  return {
    category: 'debit',
    categoryLabel: 'Debit',
    title: tx.description || 'Wallet Debit',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
    tone: 'text-slate-700 bg-slate-100',
    Icon: Wallet,
  };
}

/**
 * Driver earnings & comprehensive financial transaction breakdown dashboard.
 */
const EarningsPage = () => {
  const navigate = useNavigate();
  const cacheKey = buildCacheKey('driver-earnings', {});
  const { data, loading, error, refetch } = useCachedQuery(
    useDriverEarningsStore,
    cacheKey,
    {},
  );

  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile } = useCachedQuery(useDriverProfileStore, profileKey, {});
  const wallet = profile?.wallet || {};
  const walletBalance = Number(wallet.balance) || 0;
  const lifetimeEarnings = Number(wallet.totalEarnings) || 0;
  const totalWithdrawn = Number(wallet.totalWithdrawn) || 0;

  const isBalanceNegative = walletBalance < 0;

  // Unified financial transactions ledger
  const ledgerRows = useDriverEarningsLedgerStore((s) => s.rows);
  const ledgerTotals = useDriverEarningsLedgerStore((s) => s.totals);
  const ledgerPage = useDriverEarningsLedgerStore((s) => s.page);
  const ledgerLimit = useDriverEarningsLedgerStore((s) => s.limit);
  const ledgerHasMore = useDriverEarningsLedgerStore((s) => s.hasMore);
  const ledgerLoading = useDriverEarningsLedgerStore((s) => s.loading);
  const ledgerFetched = useDriverEarningsLedgerStore((s) => s.fetched);
  const activeCategory = useDriverEarningsLedgerStore((s) => s.category);
  const fetchLedger = useDriverEarningsLedgerStore((s) => s.fetch);
  const setCategory = useDriverEarningsLedgerStore((s) => s.setCategory);

  useEffect(() => {
    fetchLedger({ page: 1, limit: 20, category: 'all' }).catch(() => {});
  }, [fetchLedger]);

  const summary = data?.summary || {};
  const today = summary.today || EMPTY;
  const week = summary.week || EMPTY;
  const month = summary.month || EMPTY;
  const buckets = data?.daily?.buckets || [];
  const peak = data?.daily?.peak || 0;

  const stats = useMemo(
    () => [
      { label: 'Today', amount: formatCurrency(today.earnings), trips: today.trips },
      { label: 'This Week', amount: formatCurrency(week.earnings), trips: week.trips },
      { label: 'This Month', amount: formatCurrency(month.earnings), trips: month.trips },
    ],
    [today, week, month],
  );

  const onLoadMore = () => {
    if (ledgerLoading || !ledgerHasMore) return;
    fetchLedger({
      page: ledgerPage + 1,
      limit: ledgerLimit,
      category: activeCategory,
      append: true,
    }).catch(() => {});
  };

  const [selectedTx, setSelectedTx] = useState(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editBankOpen, setEditBankOpen] = useState(false);

  return (
    <DriverScreenShell
      header={
        <header className="bg-dark px-4 pt-4 pb-5 rounded-b-3xl">
          <h1 className="text-lg font-bold text-white mb-3">Earnings & Financials</h1>

          {/* Balance Hero Card */}
          <Card
            className={`!shadow-none border ${
              isBalanceNegative
                ? '!bg-rose-950/70 border-rose-500/60 ring-2 ring-rose-500/30'
                : '!bg-white/10 backdrop-blur-sm border-white/10'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">
                    Current Wallet Balance
                  </p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isBalanceNegative
                        ? 'bg-rose-500 text-white'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {isBalanceNegative ? '− In Minus' : '+ In Plus'}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mt-1.5">
                  <span
                    className={`text-3xl font-extrabold tracking-tight ${
                      isBalanceNegative ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {isBalanceNegative ? '− ' : '+ '}
                    {formatCurrency(Math.abs(walletBalance))}
                  </span>
                </div>

                <p
                  className={`text-[11px] mt-1 font-medium ${
                    isBalanceNegative ? 'text-rose-300 font-semibold' : 'text-white/70'
                  }`}
                >
                  {isBalanceNegative
                    ? '⚠️ Outstanding balance — recharge required'
                    : 'Available balance for withdrawals & services'}
                </p>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setTopupOpen(true)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 ${
                    isBalanceNegative
                      ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse ring-2 ring-white/50'
                      : 'bg-primary text-white hover:bg-primary-dark'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isBalanceNegative ? 'Recharge Now' : 'Add Funds'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hasBank = !!profile?.bankDetails?.accountNumber;
                    if (!hasBank) {
                      setEditBankOpen(true);
                    } else {
                      setWithdrawOpen(true);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-dark text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={walletBalance <= 0}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Withdraw
                </button>
              </div>
            </div>

            {(lifetimeEarnings > 0 || totalWithdrawn > 0) && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10 text-[11px] text-white/80">
                <span>
                  Lifetime{' '}
                  <span className="font-semibold text-white">
                    {formatCurrency(lifetimeEarnings)}
                  </span>
                </span>
                {totalWithdrawn > 0 && (
                  <>
                    <span className="text-white/30">&middot;</span>
                    <span>
                      Withdrawn{' '}
                      <span className="font-semibold text-white">
                        {formatCurrency(totalWithdrawn)}
                      </span>
                    </span>
                  </>
                )}
              </div>
            )}
          </Card>
        </header>
      }
      bodyClassName="p-4 -mt-2 pb-8 space-y-4"
    >
      {/* Critical Negative Balance Warning Banner */}
      {isBalanceNegative && (
        <Card className="border-l-4 border-l-rose-500 bg-rose-50/90 border border-rose-200 shadow-sm animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 mt-0.5 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-rose-900">
                Please recharge the wallet
              </h3>
              <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">
                Your wallet balance is currently in minus (
                <strong className="font-bold text-rose-900">
                  −{formatCurrency(Math.abs(walletBalance))}
                </strong>
                ) due to cash collection settlements or penalties. Please recharge the
                wallet to continue receiving ride offers without interruption.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="danger"
                  className="!h-8 !px-3 !text-xs gap-1.5 font-bold shadow-sm"
                  onClick={() => setTopupOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Recharge Wallet Now
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {loading && !data && (
        <Card className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </Card>
      )}

      {error && (
        <Card className="border-l-4 border-l-danger">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text">Couldn't load earnings</p>
              <p className="text-xs text-text-muted mt-0.5">{error}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!!data && (
        <>
          {/* 7-Day Performance Chart */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">
                Trip Earnings (Last 7 days)
              </p>
              {peak > 0 && (
                <span className="text-[11px] text-text-muted">
                  Peak {formatCurrency(peak)}
                </span>
              )}
            </div>
            <EarningsBarChart buckets={buckets} peak={peak} />
          </Card>

          {/* Quick Period Summary */}
          <Card padding="p-0">
            <ul className="divide-y divide-border-light">
              {stats.map((stat) => (
                <li
                  key={stat.label}
                  className="flex items-center justify-between px-4 py-3.5"
                >
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">
                      {stat.label}
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {stat.trips} trip{stat.trips === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className="text-base font-bold text-text">{stat.amount}</p>
                </li>
              ))}
            </ul>
          </Card>

          {/* Financial Breakdown Grid */}
          <FinancialBreakdownCard totals={ledgerTotals} />

          {/* All Financial Transactions Section with Category Tabs */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <div>
                <h2 className="text-sm font-bold text-text">
                  Financial Transaction Ledger
                </h2>
                <p className="text-[11px] text-text-muted">
                  Complete breakdown of credits, auto deductions & penalties
                </p>
              </div>
              {ledgerLoading && (
                <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              {CATEGORY_TABS.map((t) => {
                const isActive = activeCategory === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCategory(t.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                      isActive
                        ? 'bg-dark text-white shadow-sm'
                        : 'bg-white border border-border text-text-secondary hover:bg-gray-50'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Transactions Feed */}
            <AllTransactionsFeed
              rows={ledgerRows}
              loading={ledgerLoading}
              fetched={ledgerFetched}
              hasMore={ledgerHasMore}
              onLoadMore={onLoadMore}
              onSelect={setSelectedTx}
            />
          </section>
        </>
      )}

      {/* Transaction Detail Bottom Sheet */}
      <BottomSheet
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title="Transaction Breakdown"
      >
        {selectedTx && <TransactionDetailSheet tx={selectedTx} />}
      </BottomSheet>

      {/* Top-up Sheet */}
      <DriverTopupSheet
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onSuccess={() => {
          refetch();
          fetchLedger({ page: 1, limit: 20, category: activeCategory }).catch(() => {});
        }}
      />

      {/* Withdraw Funds Modal */}
      <WithdrawFundsModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        maxAmount={Math.max(0, walletBalance)}
        isDriver={true}
        bankDetails={profile?.bankDetails}
        onWithdrawSuccess={() => {
          refetch();
          fetchLedger({ page: 1, limit: 20, category: activeCategory }).catch(() => {});
        }}
      />

      {/* Edit Bank Details Modal */}
      <EditBankDetailsModal
        isOpen={editBankOpen}
        onClose={() => setEditBankOpen(false)}
        initialData={profile?.bankDetails}
        isDriver={true}
        onSave={() => {
          setEditBankOpen(false);
          setWithdrawOpen(true);
        }}
      />
    </DriverScreenShell>
  );
};

/* ------------------------------------------------------------------ */
/* Financial Breakdown Summary Component                              */
/* ------------------------------------------------------------------ */

function FinancialBreakdownCard({ totals }) {
  const credits = Number(totals?.totalCredits) || 0;
  const autoDeductions = Number(totals?.totalAutoDeductions) || 0;
  const penalties = Number(totals?.totalPenalties) || 0;
  const debits = Number(totals?.totalDebits) || 0;

  return (
    <Card padding="p-0" className="overflow-hidden">
      <div className="bg-gray-50/80 px-4 py-3 border-b border-border-light">
        <p className="text-xs font-bold text-text uppercase tracking-wider">
          Lifetime Financial Summary
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border-light">
        <div className="p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-semibold truncate">Total Credits</span>
          </div>
          <p className="text-base font-bold text-emerald-700 mt-1">
            +{formatCurrency(credits)}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5">
            {totals?.creditCount || 0} transaction{totals?.creditCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <span className="font-semibold truncate">Auto Deductions</span>
          </div>
          <p className="text-base font-bold text-indigo-700 mt-1">
            −{formatCurrency(autoDeductions)}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5">
            {totals?.autoDeductionCount || 0} cash settlement{totals?.autoDeductionCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span className="font-semibold truncate">Total Penalties</span>
          </div>
          <p className="text-base font-bold text-rose-700 mt-1">
            −{formatCurrency(penalties)}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5">
            {totals?.penaltyCount || 0} penalt{totals?.penaltyCount === 1 ? 'y' : 'ies'}
          </p>
        </div>

        <div className="p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />
            <span className="font-semibold truncate">Total Debited / Out</span>
          </div>
          <p className="text-base font-bold text-slate-700 mt-1">
            −{formatCurrency(debits)}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5">
            {totals?.debitCount || 0} withdrawal{totals?.debitCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Transactions Feed Component                                        */
/* ------------------------------------------------------------------ */

function AllTransactionsFeed({ rows, loading, fetched, hasMore, onLoadMore, onSelect }) {
  const isEmpty = fetched && rows.length === 0;

  if (!fetched && loading) {
    return (
      <Card>
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Inbox className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm font-semibold text-text">No transactions found</p>
        <p className="text-xs text-text-muted mt-1 max-w-[240px]">
          Transactions in this category will appear here in real-time.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card padding="p-0" className="divide-y divide-border-light overflow-hidden">
        {rows.map((tx) => (
          <TransactionRow key={tx._id} tx={tx} onSelect={onSelect} />
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
          Load more transactions
        </Button>
      )}
    </>
  );
}

function TransactionRow({ tx, onSelect }) {
  const meta = getTransactionMeta(tx);
  const Icon = meta.Icon;
  const isCredit = tx.direction === 'credit';
  const amount = Number(tx.amountRupees) || 0;
  const balanceAfter = Number(tx.balanceAfter);

  const formattedDate = tx.createdAt
    ? new Date(tx.createdAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-gray-50 transition-colors text-left"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.tone}`}
      >
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-text truncate">{meta.title}</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted truncate">
          <span>{formattedDate}</span>
          {Number.isFinite(balanceAfter) && (
            <>
              <span>&middot;</span>
              <span>
                Balance:{' '}
                <strong
                  className={`font-semibold ${
                    balanceAfter < 0 ? 'text-rose-600' : 'text-text-secondary'
                  }`}
                >
                  {balanceAfter < 0 ? '−' : ''}
                  {formatCurrency(Math.abs(balanceAfter))}
                </strong>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end shrink-0">
        <p
          className={`text-sm font-extrabold tabular-nums ${
            isCredit ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {isCredit ? '+ ' : '− '}
          {formatCurrency(amount)}
        </p>
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border mt-0.5 ${meta.badgeClass}`}
        >
          {meta.categoryLabel}
        </span>
      </div>

      <ChevronRight className="w-4 h-4 text-text-muted shrink-0 ml-1" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Transaction Detail Sheet                                           */
/* ------------------------------------------------------------------ */

function TransactionDetailSheet({ tx }) {
  const meta = getTransactionMeta(tx);
  const Icon = meta.Icon;
  const isCredit = tx.direction === 'credit';
  const amount = Number(tx.amountRupees) || 0;
  const balanceAfter = Number(tx.balanceAfter);

  const formattedDate = tx.createdAt
    ? new Date(tx.createdAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div className="space-y-4 pb-4">
      {/* Header Banner */}
      <div className="flex items-center gap-3 bg-gray-50 p-3.5 rounded-2xl border border-border-light">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${meta.tone}`}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${meta.badgeClass}`}
          >
            {meta.categoryLabel}
          </span>
          <p className="text-sm font-bold text-text mt-1 truncate">{meta.title}</p>
        </div>
        <div className="text-right shrink-0">
          <p
            className={`text-lg font-extrabold ${
              isCredit ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isCredit ? '+ ' : '− '}
            {formatCurrency(amount)}
          </p>
          <span className="text-[10px] text-text-muted font-medium capitalize">
            {tx.status || 'Success'}
          </span>
        </div>
      </div>

      {/* Info Breakdown Lines */}
      <Card className="space-y-3">
        <div className="flex justify-between text-xs border-b border-slate-100 pb-2">
          <span className="text-text-muted">Transaction ID:</span>
          <span className="font-mono text-text font-semibold break-all text-right">
            {tx._id}
          </span>
        </div>

        <div className="flex justify-between text-xs border-b border-slate-100 pb-2">
          <span className="text-text-muted">Date & Time:</span>
          <span className="font-medium text-text">{formattedDate}</span>
        </div>

        <div className="flex justify-between text-xs border-b border-slate-100 pb-2">
          <span className="text-text-muted">Nature:</span>
          <span
            className={`font-bold uppercase ${
              isCredit ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isCredit ? 'Credit (Money In)' : 'Debit (Money Out)'}
          </span>
        </div>

        {Number.isFinite(balanceAfter) && (
          <div className="flex justify-between text-xs border-b border-slate-100 pb-2">
            <span className="text-text-muted">Balance After Transaction:</span>
            <span
              className={`font-bold tabular-nums ${
                balanceAfter < 0 ? 'text-rose-700' : 'text-text'
              }`}
            >
              {balanceAfter < 0 ? '−' : ''}
              {formatCurrency(Math.abs(balanceAfter))}
            </span>
          </div>
        )}

        {tx.refId && (
          <div className="flex justify-between text-xs border-b border-slate-100 pb-2">
            <span className="text-text-muted">Reference:</span>
            <span className="font-semibold text-text">
              {tx.refType ? `${tx.refType} · ` : ''}
              {tx.refId}
            </span>
          </div>
        )}

        {tx.description && (
          <div className="text-xs pt-1">
            <span className="text-text-muted block mb-1">Description / Notes:</span>
            <p className="font-medium text-text bg-gray-50 p-2 rounded-lg border border-slate-100">
              {tx.description}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bar Chart Component                                                */
/* ------------------------------------------------------------------ */

function EarningsBarChart({ buckets, peak }) {
  const safePeak = peak > 0 ? peak : 1;
  return (
    <div className="flex items-end justify-between gap-2 h-32 mb-2">
      {buckets.map((bucket) => {
        const heightPct = Math.max(4, Math.round((bucket.earnings / safePeak) * 100));
        const isPeak = bucket.earnings > 0 && bucket.earnings === peak;
        return (
          <div
            key={bucket.date}
            className="flex-1 flex flex-col justify-end items-center gap-1 min-w-0 h-full"
          >
            <span className="text-[10px] font-semibold text-text-muted h-3 leading-3">
              {bucket.earnings > 0 ? `₹${Math.round(bucket.earnings)}` : ''}
            </span>
            <div
              className={`w-full rounded-t-md transition-all ${
                isPeak ? 'bg-primary' : 'bg-primary/30'
              }`}
              style={{ height: `${heightPct}%` }}
            />
            <span className="text-[10px] text-text-muted">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default EarningsPage;
