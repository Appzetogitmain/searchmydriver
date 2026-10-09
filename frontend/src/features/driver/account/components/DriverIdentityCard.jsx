import React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Award,
  Calendar,
  Phone,
  Mail,
  User,
  Car,
  Languages,
  MapPin,
} from 'lucide-react';
import Avatar from '../../../../components/Avatar';
import { formatDate, formatPhone } from '../../../../utils/formatters';

const DriverIdentityCard = ({ driver, className = '' }) => {
  if (!driver) return null;

  const displayName = driver?.name || 'Driver';
  const driverId = driver?.driverId ? driver.driverId.toUpperCase() : 'PENDING';
  const phone = formatPhone(driver?.phone || '');
  const email = driver?.email || '';
  const dob = driver?.dateOfBirth ? formatDate(driver.dateOfBirth) : '—';
  const licenseNumber =
    driver?.drivingLicense?.number || driver?.licenseNumber || '—';
  const licenseExpiry = driver?.drivingLicense?.expiryDate
    ? formatDate(driver.drivingLicense.expiryDate)
    : '—';
  const experienceYears =
    typeof driver?.experienceYears === 'number' && driver.experienceYears > 0
      ? `${driver.experienceYears} Year${driver.experienceYears === 1 ? '' : 's'}`
      : 'Experienced';
  const workLocation = driver?.city || driver?.zone?.name || 'India';
  const languagesList =
    Array.isArray(driver?.languages) && driver.languages.length > 0
      ? driver.languages
      : ['Hindi', 'English'];

  const isVerified = driver?.approvalStatus === 'approved';

  return (
    <div className={`w-full bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden transition-all print:shadow-none print:border-slate-300 print:max-w-[380px] print:mx-auto ${className}`}>
      {/* Top Header Strip */}
      <div
        className="relative bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 sm:px-5 pt-3.5 pb-10 sm:pb-11 overflow-hidden print:bg-slate-900"
        style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}
      >
        {/* Subtle decorative background pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10 shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-300 truncate">
                Official Identity Card
              </p>
              <p className="text-xs font-black tracking-wide text-white truncate">
                SearchMyDriver
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/15 text-[11px] font-mono font-bold tracking-wider text-blue-200 shrink-0">
            <span className="text-[9px] text-white/60 font-sans uppercase">ID:</span>
            <span>{driverId}</span>
          </div>
        </div>
      </div>

      {/* Floating Photo & Profile Summary */}
      <div className="relative px-4 sm:px-5 pb-4 sm:pb-5 pt-1.5">
        <div className="flex items-start gap-3 sm:gap-4 mb-3.5">
          {/* Avatar floating into the header banner */}
          <div className="relative -mt-9 sm:-mt-10 shrink-0 z-10">
            <div className="p-1 bg-white rounded-2xl shadow-md inline-block">
              <Avatar
                src={driver?.profilePicture || undefined}
                name={displayName}
                size="xl"
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl object-cover ring-2 ring-slate-100"
              />
            </div>
            {isVerified && (
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[8px] sm:text-[9px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm border-2 border-white whitespace-nowrap">
                <CheckCircle2 className="w-2.5 h-2.5" />
                VERIFIED
              </div>
            )}
          </div>

          {/* Name, Title & Status Badges */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug truncate">
              {displayName}
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              Professional Partner Driver
            </p>

            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    driver?.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                {driver?.isOnline ? 'Online' : 'Offline'}
              </span>

              {driver?.rating && (
                <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  <span className="text-amber-500">★</span>
                  <span>{Number(driver.rating).toFixed(1)}</span>
                  {driver.ratingCount > 0 && (
                    <span className="text-[9px] text-amber-600/80 font-normal">
                      ({driver.ratingCount})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details Grid (Responsive 2 columns with uniform tile heights) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {/* DL Number */}
          <div className="bg-slate-50/90 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between min-h-[58px]">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <Award className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider truncate">
                Driving License
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 font-mono truncate">
              {licenseNumber}
            </p>
          </div>

          {/* DL Expiry */}
          <div className="bg-slate-50/90 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between min-h-[58px]">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider truncate">
                License Expiry
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {licenseExpiry}
            </p>
          </div>

          {/* Date of Birth */}
          <div className="bg-slate-50/90 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between min-h-[58px]">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider truncate">
                Date of Birth
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">{dob}</p>
          </div>

          {/* Driving Experience */}
          <div className="bg-slate-50/90 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between min-h-[58px]">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <Car className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider truncate">
                Experience
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {experienceYears}
            </p>
          </div>

          {/* Work Location */}
          <div className="bg-slate-50/90 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between min-h-[58px]">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider truncate">
                Work Location
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {workLocation}
            </p>
          </div>

          {/* Spoken Languages */}
          <div className="bg-slate-50/90 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between min-h-[58px]">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <Languages className="w-3.5 h-3.5 text-violet-600 shrink-0" />
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider truncate">
                Languages
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {languagesList.map((lang, idx) => (
                <span
                  key={idx}
                  className="bg-white px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-700 border border-slate-200/80 shadow-2xs truncate"
                >
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Contact Information Footer Row */}
        {(phone || email) && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-1 text-xs text-slate-600">
            {phone && (
              <div className="flex items-center gap-1.5 min-w-0">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-800 text-[11px] truncate">{phone}</span>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-1.5 min-w-0">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-600 text-[11px] truncate break-all">{email}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverIdentityCard;

