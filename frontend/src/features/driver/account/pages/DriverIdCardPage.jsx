import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ShieldCheck, Phone, Award, Calendar, CheckCircle2, User, Car, Globe } from 'lucide-react';
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

  const displayName = driver?.name || 'Driver Name';
  const driverId = driver?.driverId ? driver.driverId.toUpperCase() : 'DRV-PENDING';
  const phone = formatPhone(driver?.phone || 'N/A');
  const dob = driver?.dateOfBirth ? formatDate(driver.dateOfBirth) : 'N/A';
  const issueDate = driver?.createdAt ? formatDate(driver.createdAt) : 'N/A';
  const licenseNumber = driver?.drivingLicense?.number || driver?.licenseNumber || 'N/A';
  const licenseExpiry = driver?.drivingLicense?.expiryDate ? formatDate(driver.drivingLicense.expiryDate) : 'N/A';
  const experienceYears = driver?.experienceYears ? `${driver.experienceYears} Years` : 'N/A';
  const availability = driver?.availability ? driver.availability.replace('-', ' ').toUpperCase() : 'ACTIVE';
  const city = driver?.city || 'India';
  const rating = driver?.rating ? Number(driver.rating).toFixed(1) : '5.0';

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
        <div className="id-card-wrapper relative w-[340px] sm:w-[360px] bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 print:shadow-none print:border-2 print:border-slate-800 print:rounded-2xl print:w-[350px] print:mx-auto print:my-4">
          
          {/* Header Banner */}
          <div 
            className="relative w-full bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white px-5 pt-6 pb-14 flex flex-col items-center text-center print:bg-blue-800"
            style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}
          >
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />
            
            <div className="flex items-center gap-2 z-10">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-black tracking-wider uppercase drop-shadow-sm">SearchMyDriver</span>
            </div>
            <p className="text-[10px] text-blue-100 uppercase tracking-widest font-semibold mt-0.5 z-10">Official Authorized Driver Identity</p>
          </div>

          {/* Photo Section (Floating overlap) */}
          <div className="relative -mt-11 flex justify-center z-20">
            <div className="p-1 bg-white rounded-2xl shadow-xl print:shadow-none print:border-2 print:border-slate-300">
              <div className="relative">
                <Avatar
                  src={driver?.profilePicture || undefined}
                  name={displayName}
                  size="xl"
                  className="w-24 h-24 sm:w-28 sm:h-28 text-3xl rounded-xl object-cover ring-2 ring-blue-500/20"
                />
                <div className="absolute -bottom-2 right-1/2 translate-x-1/2 bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm border border-white">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  VERIFIED
                </div>
              </div>
            </div>
          </div>

          {/* Driver Basic Info */}
          <div className="pt-4 px-5 pb-5 text-center bg-white">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-snug">
              {displayName}
            </h2>
            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold mt-1 border border-blue-100">
              <span>ID:</span>
              <span className="font-mono text-sm tracking-wider">{driverId}</span>
            </div>

            {/* Grid Detail Fields */}
            <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-left">
              
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                  <Award className="w-3 h-3 text-blue-600" />
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">DL Number</span>
                </div>
                <p className="text-xs font-bold text-slate-800 font-mono truncate">{licenseNumber}</p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                  <Calendar className="w-3 h-3 text-blue-600" />
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">DL Expiry</span>
                </div>
                <p className="text-xs font-bold text-slate-800">{licenseExpiry}</p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                  <Phone className="w-3 h-3 text-blue-600" />
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Phone</span>
                </div>
                <p className="text-xs font-bold text-slate-800">{phone}</p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                  <User className="w-3 h-3 text-blue-600" />
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Date of Birth</span>
                </div>
                <p className="text-xs font-bold text-slate-800">{dob}</p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                  <Car className="w-3 h-3 text-blue-600" />
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Experience</span>
                </div>
                <p className="text-xs font-bold text-slate-800">{experienceYears}</p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                  <Globe className="w-3 h-3 text-blue-600" />
                  <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Location</span>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate">{city}</p>
              </div>

            </div>

            {/* Extra verification footer strip */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
              <div>
                <span className="text-slate-400">Joined: </span>
                <span className="font-semibold text-slate-700">{issueDate}</span>
              </div>
              <div className="flex items-center gap-1 text-amber-600 font-bold">
                ★ <span>{rating} Rating</span>
              </div>
              <div className="font-semibold text-blue-600 uppercase">
                {availability}
              </div>
            </div>

          </div>

          {/* Bottom security stripe */}
          <div 
            className="w-full h-3 bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 print:bg-blue-800"
            style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}
          />
        </div>

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

