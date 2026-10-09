import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import DriverScreenShell from '../../components/DriverScreenShell';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import DriverIdentityCard from '../components/DriverIdentityCard';

const DriverIdCardPage = () => {
  const navigate = useNavigate();
  const cachedDriver = useDriverAuthStore((s) => s.driver);
  
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const driver = useMemo(
    () => profile || cachedDriver || {},
    [profile, cachedDriver],
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <DriverScreenShell
      header={(
        <header className="bg-dark px-4 pt-5 pb-5 rounded-b-3xl text-white print:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => navigate('/driver/account')}
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/80 shrink-0 hover:bg-white/20 transition-colors active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <p className="text-xs text-white/60 uppercase tracking-[0.25em]">Identity Card</p>
                <h1 className="text-base font-bold truncate">Driver Official ID</h1>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-slate-900 font-bold text-xs shadow-md active:scale-95 transition-all hover:bg-primary-light shrink-0"
              aria-label="Print ID Card"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </header>
      )}
      bodyClassName="p-4 -mt-3 pb-8 flex flex-col items-center print:p-0 print:m-0"
      className="print:h-auto print:block print:bg-white"
    >
      {/* Printable ID Card Container */}
      <div className="w-full max-w-[420px] print:max-w-none">
        <DriverIdentityCard driver={driver} />
      </div>

      {/* Print instructions note */}
      <div className="text-center text-slate-500 text-xs mt-4 print:hidden max-w-xs space-y-1">
        <p className="font-semibold text-slate-700">Official SearchMyDriver Identity Card</p>
        <p className="text-[11px] text-slate-400">Click the <strong>Print</strong> button above to save as PDF or print a hard copy.</p>
      </div>
    </DriverScreenShell>
  );
};

export default DriverIdCardPage;

