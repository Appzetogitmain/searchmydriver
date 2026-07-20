import { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Wallet, Banknote } from 'lucide-react';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminUserWalletStore } from '../../../store/admin/useAdminUserWalletStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import AdjustUserWalletModal from '../components/AdjustUserWalletModal';

const UserWallet = () => {
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = useMemo(
    () => ({ 
      page, 
      limit, 
      type: typeFilter !== 'all' ? typeFilter : undefined, 
      search: debouncedSearch 
    }),
    [page, limit, typeFilter, debouncedSearch],
  );
  
  const cacheKey = buildCacheKey('admin-user-wallet', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminUserWalletStore,
    cacheKey,
    queryParams,
  );

  const items = data?.data ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const columns = useMemo(
    () => [
      {
        key: 'date',
        label: 'DATE',
        width: '15%',
        render: (val) => (
          <span className="text-xs text-slate-500 font-medium">
            {val ? new Date(val).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
          </span>
        ),
      },
      {
        key: 'user',
        label: 'USER',
        width: '25%',
        render: (val) => (
          <div className="flex flex-col py-1">
            <span className="font-semibold text-sm text-slate-900">{val?.name || 'Unknown'}</span>
            <span className="text-xs text-slate-500 mt-0.5">{val?.phone || 'No Phone'}</span>
            <span className="text-[10px] font-medium text-emerald-600 mt-1">Wallet: ₹{val?.walletBalance || 0}</span>
          </div>
        ),
      },
      {
        key: 'type',
        label: 'TYPE',
        width: '10%',
        render: (val) => (
          <span
            className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md ${
              val === 'CREDIT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {val}
          </span>
        ),
      },
      {
        key: 'amount',
        label: 'AMOUNT',
        width: '15%',
        render: (val, row) => (
          <span
            className={`font-bold text-sm ${
              row.type === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {row.type === 'CREDIT' ? '+' : '-'}₹{Number(val).toFixed(2)}
          </span>
        ),
      },
      {
        key: 'description',
        label: 'DESCRIPTION',
        width: '35%',
        render: (val) => (
          <span className="text-xs text-slate-500 capitalize">{val || '—'}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">User Wallet</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage user wallet transactions and manual adjustments
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Adjust Balance
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
          <input
            type="text"
            placeholder="Search User Name or Phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
          <select 
            className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-primary"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Types</option>
            <option value="credit">Credits Only</option>
            <option value="debit">Debits Only</option>
          </select>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-4">
            {error}
          </div>
        )}

        <ServerPaginatedTable
          columns={columns}
          data={items}
          loading={loading}
          limit={limit}
          page={page}
          pagination={pagination}
          onPageChange={setPage}
          entityLabel="transactions"
          emptyMessage="No wallet history found"
        />
      </div>

      <AdjustUserWalletModal 
        isOpen={isAdjustModalOpen} 
        onClose={() => setIsAdjustModalOpen(false)} 
        onSuccess={() => refetch()}
      />
    </div>
  );
};

export default UserWallet;
