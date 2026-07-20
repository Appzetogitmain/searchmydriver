import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Wallet, FileText, CheckCircle2, Clock, XCircle } from 'lucide-react';
import Card from '../../../../components/Card';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useUserPaymentHistoryStore } from '../../../../store/user/useUserPaymentHistoryStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return iso;
  }
}

const statusColor = (status) => {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'rejected') return 'bg-red-100 text-red-800';
  if (status === 'pending') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
};

const statusIcon = (status) => {
  if (status === 'approved') return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === 'rejected') return <XCircle className="w-3.5 h-3.5" />;
  if (status === 'pending') return <Clock className="w-3.5 h-3.5" />;
  return null;
};

const UserPaymentHistoryPage = () => {
  const navigate = useNavigate();
  const cacheKey = buildCacheKey('user-payment-history', {});

  const { data, loading } = useCachedQuery(useUserPaymentHistoryStore, cacheKey, {});
  const withdrawals = useMemo(
    () => (Array.isArray(data?.withdrawals) ? data.withdrawals : []),
    [data?.withdrawals],
  );
  const { wallet } = useUserWalletStore();

  const getPayoutDisplay = (item) => {
    if (typeof item.payoutDetails === 'string' && item.payoutDetails === 'Primary Bank Account' && wallet?.bankDetails?.accountNumber) {
      return `${wallet.bankDetails.bankName || 'Bank'} (****${wallet.bankDetails.accountNumber.slice(-4)})`;
    }
    return typeof item.payoutDetails === 'string' ? item.payoutDetails : JSON.stringify(item.payoutDetails);
  };

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold">Payment history</h1>
          <p className="text-xs text-text-muted">Withdrawals</p>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {data?.total > 0 && (
          <p className="text-xs text-text-muted px-1">
            {data.total} withdrawal{data.total === 1 ? '' : 's'}
          </p>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!loading && withdrawals.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-text">No payment history</p>
            <p className="text-xs text-text-muted mt-1">
              Your withdrawal requests will appear here.
            </p>
          </div>
        )}

        {withdrawals.map((item) => (
          <Card key={item._id} padding="p-0" className="overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-border-light bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text">
                    Withdrawal ({item.payoutMethod?.toUpperCase()})
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {formatDate(item.createdAt)}
                  </p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <p className="text-sm font-bold text-text">
                  ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                </p>
                <div className={`mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${statusColor(item.status)}`}>
                  {statusIcon(item.status)}
                  {item.status}
                </div>
              </div>
            </div>
            {item.payoutDetails && (
              <div className="px-3 py-2 text-xs text-text-secondary bg-white">
                <span className="font-semibold mr-1">To:</span> 
                {getPayoutDisplay(item)}
              </div>
            )}
            {item.adminNote && (
              <div className="px-3 py-2 bg-red-50/50 border-t border-red-100">
                <p className="text-[10px] font-medium text-red-800">
                  <span className="font-bold">Note:</span> {item.adminNote}
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

export default UserPaymentHistoryPage;
