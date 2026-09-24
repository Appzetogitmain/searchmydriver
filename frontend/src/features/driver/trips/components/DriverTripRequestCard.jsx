import React, { useState } from 'react';
import {
  Tag,
  User,
  Calendar,
  Clock,
  MapPin,
  Briefcase,
  Waypoints,
  Car,
  Settings2,
  Star,
  Check,
  AlertCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { formatCurrency } from '../../../../utils/formatters';

const DriverTripRequestCard = ({
  request,
  onAccept,
  onDecline,
  isAccepting = false,
  className = '',
}) => {
  const [declined, setDeclined] = useState(false);

  if (declined) return null;

  const {
    bookingId,
    bookingNumber,
    tripIdDisplay,
    packageTitle,
    customerType = 'B2C',
    paymentMode = 'Online',
    isCash = false,
    cashBlocked = false,
    driverEarning = 0,
    timeDisplay = '12:15 PM',
    dateDisplay = 'Today, 16 Aug 2025',
    pickupDateTimeDisplay = '16 Aug 2025, 12:15 PM',
    needDriver = '4 Hours',
    pickupLocation = 'Pickup location',
    dropLocation = 'Drop location',
    bookingTypeDisplay = 'In Station',
    tripTypeDisplay = 'Round Trip',
    carType = 'Sedan',
    transmission = 'Manual',
    carCategory = 'Standard',
    isTaken = false,
    takenByOther = false,
    canAccept = true,
  } = request;

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 transition-all relative overflow-hidden ${
        isTaken ? 'opacity-70 bg-slate-50/90' : 'hover:shadow-md'
      } ${className}`}
    >
      {/* Top Badges */}
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <span className="inline-flex items-center px-3 py-1 rounded-lg text-[12px] font-bold bg-[#4F46E5] text-white shadow-sm tracking-wide">
          {tripIdDisplay || `Trip ID: ${bookingNumber || 'TRP124578'}`}
        </span>

        <span className="inline-flex items-center px-3 py-1 rounded-lg text-[12px] font-bold bg-[#16A34A] text-white shadow-sm tracking-wide">
          Driver Earning: {formatCurrency(driverEarning)}
        </span>
      </div>

      {/* Main Header / Time Block */}
      <div className="flex items-start justify-between gap-4 mb-4">
        {/* Left: Package & Customer Type */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-slate-800 shrink-0 stroke-[2.5]" />
            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {packageTitle || '4 HOURS - Plus'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-slate-800 shrink-0 stroke-[2.5]" />
            <span className="text-sm sm:text-base font-bold text-slate-800">
              {customerType || 'B2C'}
            </span>
          </div>
        </div>

        {/* Right: Payment & Large Scheduled Time */}
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500 font-medium mb-0.5">
            Payment: <span className="font-bold text-slate-800">{paymentMode}</span>
          </p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mb-1">
            {timeDisplay}
          </p>
          <p className="text-[11px] font-medium text-slate-500">
            {dateDisplay}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 my-3.5" />

      {/* 3x3 Attributes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3.5 gap-x-4">
        {/* Row 1, Col 1: Pickup Date & Time */}
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
            <Calendar className="w-4 h-4 text-[#7C3AED]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Pickup Date & Time</p>
            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {pickupDateTimeDisplay}
            </p>
          </div>
        </div>

        {/* Row 1, Col 2: Need Driver */}
        <div className="flex items-start gap-2.5 min-w-0 sm:border-l sm:border-slate-100 sm:pl-3">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-4 h-4 text-[#EA580C]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Need Driver</p>
            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {needDriver}
            </p>
          </div>
        </div>

        {/* Row 1, Col 3: Pickup Location */}
        <div className="flex items-start gap-2.5 min-w-0 sm:border-l sm:border-slate-100 sm:pl-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-4 h-4 text-[#16A34A]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Pickup Location</p>
            <p className="text-xs font-bold text-slate-800 line-clamp-2 mt-0.5 leading-snug" title={pickupLocation}>
              {pickupLocation}
            </p>
          </div>
        </div>

        {/* Row 2, Col 1: Drop Location */}
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-4 h-4 text-[#E11D48]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Drop Location</p>
            <p className="text-xs font-bold text-slate-800 line-clamp-2 mt-0.5 leading-snug" title={dropLocation}>
              {dropLocation}
            </p>
          </div>
        </div>

        {/* Row 2, Col 2: Booking Type */}
        <div className="flex items-start gap-2.5 min-w-0 sm:border-l sm:border-slate-100 sm:pl-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
            <Briefcase className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Booking Type</p>
            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {bookingTypeDisplay}
            </p>
          </div>
        </div>

        {/* Row 2, Col 3: Trip Type */}
        <div className="flex items-start gap-2.5 min-w-0 sm:border-l sm:border-slate-100 sm:pl-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
            <Waypoints className="w-4 h-4 text-[#6366F1]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Trip Type</p>
            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {tripTypeDisplay}
            </p>
          </div>
        </div>

        {/* Row 3, Col 1: Car Type */}
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center shrink-0 mt-0.5">
            <Car className="w-4 h-4 text-[#0284C7]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Car Type</p>
            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {carType}
            </p>
          </div>
        </div>

        {/* Row 3, Col 2: Transmission */}
        <div className="flex items-start gap-2.5 min-w-0 sm:border-l sm:border-slate-100 sm:pl-3">
          <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
            <Settings2 className="w-4 h-4 text-[#9333EA]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Transmission</p>
            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {transmission}
            </p>
          </div>
        </div>

        {/* Row 3, Col 3: Car Category */}
        <div className="flex items-start gap-2.5 min-w-0 sm:border-l sm:border-slate-100 sm:pl-3">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
            <Star className="w-4 h-4 text-[#D97706] fill-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Car Category</p>
            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
              {carCategory}
            </p>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
        {isTaken || takenByOther ? (
          <div className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200">
            <AlertCircle className="w-4 h-4 text-slate-500" />
            <span>Booked by another driver</span>
          </div>
        ) : cashBlocked ? (
          <div className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs">
            <div className="flex items-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Negative wallet: recharge required for cash bookings</span>
            </div>
          </div>
        ) : (
          <div className="w-full flex items-center gap-3">
            {onDecline && (
              <button
                type="button"
                onClick={() => {
                  setDeclined(true);
                  onDecline(request);
                }}
                disabled={isAccepting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition active:scale-95 disabled:opacity-50"
              >
                Decline
              </button>
            )}

            <button
              type="button"
              onClick={() => onAccept(request)}
              disabled={isAccepting || !canAccept}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAccepting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Accepting...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Accept Request</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverTripRequestCard;
