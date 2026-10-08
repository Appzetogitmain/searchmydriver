import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import DriverOfficialIdCard from '../../../../components/DriverOfficialIdCard';

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
    <div className="min-h-screen bg-slate-100 flex flex-col print:bg-white print:block print:min-h-0">
      {/* Non-printable header */}
      <div className="bg-slate-900 px-4 pt-5 pb-5 rounded-b-3xl shrink-0 print:hidden shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-95 transition-transform hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white tracking-wide">Driver Official ID Card</h1>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white font-medium text-sm shadow-md active:scale-95 transition-transform hover:bg-primary-dark"
            aria-label="Print ID Card"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 print:p-0 print:block">
        
        {/* Printable ID Card Container (Standard ID-1 / CR80 ratio standard) */}
        <DriverOfficialIdCard driver={driver} className="w-[340px] sm:w-[360px]" />

        {/* Print instructions note */}
        <div className="text-center text-slate-500 text-xs mt-5 print:hidden max-w-xs space-y-1">
          <p className="font-medium text-slate-700">Official SearchMyDriver Identity Card</p>
          <p className="text-[11px]">Click the <strong>Print</strong> button above to save as PDF or print a hard copy.</p>
        </div>

      </div>
    </div>
  );
};

export default DriverIdCardPage;

