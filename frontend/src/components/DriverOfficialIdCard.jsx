import { ShieldCheck, Phone, Award, Calendar, CheckCircle2, User, Car, Globe, Languages } from 'lucide-react';
import { formatPhone, formatDate } from '../utils/formatters';
import Avatar from './Avatar';

// Mask the licence for customer-facing views (e.g. MH12 **** 4567).
const maskLicense = (lic) => {
  if (!lic || lic === 'N/A' || lic.length < 8) return lic;
  return `${lic.substring(0, 4)} **** ${lic.substring(lic.length - 4)}`;
};

/**
 * The official SearchMyDriver driver ID card. Shared by the driver's own
 * printable ID card page and the customer's "View ID card" popup once a
 * driver is assigned.
 *
 * `forCustomer` hides personal details (phone, date of birth) and masks the
 * licence number — the customer only needs enough to verify the driver.
 */
const DriverOfficialIdCard = ({ driver = {}, photoUrl, forCustomer = false, className = '' }) => {
  const displayName = driver?.name || 'Driver Name';
  const driverId = driver?.driverId ? driver.driverId.toUpperCase() : 'DRV-PENDING';
  const rawLicense = driver?.drivingLicense?.number || driver?.licenseNumber || 'N/A';
  const licenseNumber = forCustomer ? maskLicense(rawLicense) : rawLicense;
  const licenseExpiry = driver?.drivingLicense?.expiryDate ? formatDate(driver.drivingLicense.expiryDate) : 'N/A';
  const experienceYears = driver?.experienceYears ? `${driver.experienceYears} Years` : 'N/A';
  const city = driver?.city || 'India';
  const issueDate = driver?.createdAt ? formatDate(driver.createdAt) : 'N/A';
  const rating = driver?.rating ? Number(driver.rating).toFixed(1) : '5.0';
  const availability = driver?.availability ? driver.availability.replace('-', ' ').toUpperCase() : 'ACTIVE';
  const languages = Array.isArray(driver?.languages) && driver.languages.length ? driver.languages.join(', ') : 'N/A';

  const fields = forCustomer
    ? [
        { icon: Award, label: 'DL Number', value: licenseNumber, mono: true },
        { icon: Calendar, label: 'DL Expiry', value: licenseExpiry },
        { icon: Car, label: 'Experience', value: experienceYears },
        { icon: Globe, label: 'Location', value: city },
        { icon: Languages, label: 'Languages', value: languages, wide: true },
      ]
    : [
        { icon: Award, label: 'DL Number', value: licenseNumber, mono: true },
        { icon: Calendar, label: 'DL Expiry', value: licenseExpiry },
        { icon: Phone, label: 'Phone', value: formatPhone(driver?.phone || 'N/A') },
        { icon: User, label: 'Date of Birth', value: driver?.dateOfBirth ? formatDate(driver.dateOfBirth) : 'N/A' },
        { icon: Car, label: 'Experience', value: experienceYears },
        { icon: Globe, label: 'Location', value: city },
      ];

  return (
    <div className={`id-card-wrapper relative bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 print:shadow-none print:border-2 print:border-slate-800 print:rounded-2xl print:w-[350px] print:mx-auto print:my-4 ${className}`}>

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
              src={photoUrl || driver?.profilePicture || undefined}
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
          {fields.map(({ icon: Icon, label, value, mono, wide }) => (
            <div key={label} className={`bg-slate-50 p-2.5 rounded-xl border border-slate-100 ${wide ? 'col-span-2' : ''}`}>
              <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                <Icon className="w-3 h-3 text-blue-600" />
                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{label}</span>
              </div>
              <p className={`text-xs font-bold text-slate-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
            </div>
          ))}
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
          {!forCustomer && (
            <div className="font-semibold text-blue-600 uppercase">
              {availability}
            </div>
          )}
        </div>

      </div>

      {/* Bottom security stripe */}
      <div
        className="w-full h-3 bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 print:bg-blue-800"
        style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}
      />
    </div>
  );
};

export default DriverOfficialIdCard;
