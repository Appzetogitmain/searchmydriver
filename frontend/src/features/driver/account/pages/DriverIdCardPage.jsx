import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { formatPhone, formatDate } from '../../../../utils/formatters';
import Avatar from '../../../../components/Avatar';

const DriverIdCardPage = () => {
  const navigate = useNavigate();
  const cachedDriver = useDriverAuthStore((s) => s.driver);
  
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const driver = useMemo(
    () => profile || cachedDriver || {},
    [profile, cachedDriver],
  );

  const displayName = driver?.name || 'Driver';
  const driverId = driver?.driverId ? driver.driverId.toUpperCase() : 'N/A';
  const phone = formatPhone(driver?.phone || '');
  const dob = driver?.dateOfBirth ? formatDate(driver.dateOfBirth) : 'N/A';
  // Use createdAt as issue date, or just generic "Valid" text
  const issueDate = driver?.createdAt ? formatDate(driver.createdAt) : 'N/A';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col print:bg-white print:block">
      {/* Non-printable header */}
      <div className="bg-dark px-4 pt-5 pb-5 rounded-b-3xl shrink-0 print:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white">ID Card</h1>
          <button
            type="button"
            onClick={handlePrint}
            className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Print ID Card"
          >
            <Printer className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 print:p-0 print:block">
        
        {/* Printable ID Card Container */}
        <div className="relative w-full max-w-[320px] aspect-[2/3] bg-white rounded-[24px] shadow-2xl overflow-hidden print:shadow-none print:border print:border-gray-300 print:rounded-[24px]">
          
          {/* Top section (Primary color) */}
          <div className="absolute top-0 left-0 w-full h-[45%] bg-primary flex flex-col items-center pt-8 print:bg-primary print:text-white" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact', backgroundColor: '#3b82f6' }}>
            {/* Company Logo / Name */}
            <div className="flex items-center gap-2 text-white mb-6">
              <ShieldCheck className="w-6 h-6" />
              <span className="text-lg font-extrabold tracking-wide">SearchMyDriver</span>
            </div>
            
            {/* Decorative background shape */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
              <div className="absolute -top-12 -left-12 w-40 h-40 bg-white rounded-full mix-blend-overlay"></div>
              <div className="absolute top-10 -right-10 w-32 h-32 bg-white rounded-full mix-blend-overlay"></div>
            </div>
          </div>

          {/* Photo overlapping the two sections */}
          <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="p-1.5 bg-white rounded-full shadow-lg border border-gray-100 print:border-none print:shadow-none">
              <Avatar
                src={driver?.profilePicture || undefined}
                name={displayName}
                size="xl"
                className="w-28 h-28 text-3xl ring-4 ring-primary/10"
              />
            </div>
          </div>

          {/* Bottom section (White bg) */}
          <div className="absolute bottom-0 left-0 w-full h-[55%] bg-white flex flex-col items-center pt-16 px-6 pb-6 text-center">
            
            <h2 className="text-xl font-bold text-text uppercase tracking-widest leading-tight">{displayName}</h2>
            <p className="text-primary font-bold text-sm mt-0.5 tracking-wider">ID: {driverId}</p>

            <div className="w-full mt-6 space-y-2.5 text-left">
              <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
                <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Date of Birth</span>
                <span className="text-xs font-semibold text-text">{dob}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
                <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Phone</span>
                <span className="text-xs font-semibold text-text">{phone}</span>
              </div>
              <div className="flex justify-between items-center pb-1.5">
                <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Joined On</span>
                <span className="text-xs font-semibold text-text">{issueDate}</span>
              </div>
            </div>
          </div>

          {/* Bottom decorative bar */}
          <div className="absolute bottom-0 left-0 w-full h-2 bg-primary" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact', backgroundColor: '#3b82f6' }}></div>
        </div>

        <p className="text-center text-text-muted text-xs mt-6 print:hidden max-w-[280px]">
          Show this ID card to customers or authorities when requested. You can print it using the button above.
        </p>

      </div>
    </div>
  );
};

export default DriverIdCardPage;
