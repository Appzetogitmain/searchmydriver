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

const DriverIdentityCard = ({ driver }) => {
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
    <div className="w-full bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden transition-all hover:shadow-md">
      {/* Top Header Strip */}
      <div className="relative bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-5 pt-4 pb-12 overflow-hidden">
        {/* Subtle decorative background pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Official Identity Card
              </p>
              <p className="text-xs font-black tracking-wide text-white">
                SearchMyDriver
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/15 text-[11px] font-mono font-bold tracking-wider text-blue-200">
            <span className="text-[10px] text-white/60 font-sans uppercase">ID:</span>
            <span>{driverId}</span>
          </div>
        </div>
      </div>

      {/* Floating Photo & Profile Summary */}
      <div className="relative px-5 pb-5 pt-0">
        <div className="flex items-end justify-between -mt-9 mb-3">
          <div className="relative">
            <div className="p-1 bg-white rounded-2xl shadow-md inline-block">
              <Avatar
                src={driver?.profilePicture || undefined}
                name={displayName}
                size="xl"
                className="w-20 h-20 sm:w-22 sm:h-22 rounded-xl object-cover ring-2 ring-slate-100"
              />
            </div>
            {isVerified && (
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm border-2 border-white whitespace-nowrap">
                <CheckCircle2 className="w-2.5 h-2.5" />
                VERIFIED
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 pb-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  driver?.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                }`}
              />
              <span className="text-[11px] font-semibold text-slate-600">
                {driver?.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            {driver?.rating && (
              <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-lg text-xs font-bold">
                <span className="text-amber-500">★</span>
                <span>{Number(driver.rating).toFixed(1)}</span>
                {driver.ratingCount > 0 && (
                  <span className="text-[10px] text-amber-600/80 font-normal">
                    ({driver.ratingCount})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Name and Title */}
        <div className="mb-4">
          <h2 className="text-lg font-black text-slate-900 leading-tight">
            {displayName}
          </h2>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Professional Partner Driver
          </p>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* DL Number */}
          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <Award className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Driving License
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 font-mono truncate">
              {licenseNumber}
            </p>
          </div>

          {/* DL Expiry */}
          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                License Expiry
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {licenseExpiry}
            </p>
          </div>

          {/* Date of Birth */}
          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Date of Birth
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">{dob}</p>
          </div>

          {/* Driving Experience */}
          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <Car className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Experience
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {experienceYears}
            </p>
          </div>

          {/* Work Location */}
          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Work Location
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {workLocation}
            </p>
          </div>

          {/* Spoken Languages */}
          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Languages className="w-3.5 h-3.5 text-violet-600 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Spoken Languages
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {languagesList.map((lang, idx) => (
                <span
                  key={idx}
                  className="bg-white px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700 border border-slate-200/80 shadow-2xs"
                >
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Contact Information Footer Row */}
        {(phone || email) && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
            {phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-800">{phone}</span>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-600 truncate">{email}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverIdentityCard;
