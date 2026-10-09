import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import DriverScreenShell from '../../components/DriverScreenShell';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import DriverBankDetailsCard from '../components/DriverBankDetailsCard';
import EditBankDetailsModal from '../../../../components/EditBankDetailsModal';

const DriverBankDetailsPage = () => {
  const navigate = useNavigate();
  const cachedDriver = useDriverAuthStore((s) => s.driver);
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile, loading, error, refetch } = useCachedQuery(useDriverProfileStore, profileKey, {});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    updateDriver({
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      profilePicture: profile.profilePicture,
      approvalStatus: profile.approvalStatus,
      isOnline: profile.isOnline,
      canGoOnline: profile.canGoOnline,
    });
  }, [profile, updateDriver]);

  useEffect(() => {
    refetch().catch(() => {});
  }, [refetch]);

  const driver = profile || cachedDriver || {};
  const bank = driver.bankDetails || null;

  if (loading && !profile) {
    return (
      <DriverScreenShell>
        <div className="flex items-center justify-center min-h-full text-text-muted">Loading bank details...</div>
      </DriverScreenShell>
    );
  }

  if (error && !profile) {
    return (
      <DriverScreenShell>
        <div className="p-4 space-y-4">
          <button
            type="button"
            onClick={() => navigate('/driver/account')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || 'Failed to load bank details'}
          </div>
        </div>
      </DriverScreenShell>
    );
  }

  return (
    <DriverScreenShell
      header={(
        <header className="bg-dark px-4 pt-5 pb-5 rounded-b-3xl text-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/driver/account')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/80 shrink-0 hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/60 uppercase tracking-[0.25em]">Bank Details</p>
              <h1 className="text-base font-bold">Payout Account</h1>
              <p className="text-xs text-white/70 mt-0.5">Review the bank account linked to your driver payouts.</p>
            </div>
          </div>
        </header>
      )}
      bodyClassName="p-4 -mt-3 pb-8 space-y-4"
    >
      <DriverBankDetailsCard bankDetails={bank} />

      <EditBankDetailsModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        initialData={bank}
        isDriver={true}
        onSave={() => refetch()}
      />
    </DriverScreenShell>
  );
};

export default DriverBankDetailsPage;

