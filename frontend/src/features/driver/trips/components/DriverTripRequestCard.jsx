import React, { useState } from 'react';
import {
  Clock,
  MapPin,
  Briefcase,
  Waypoints,
  Car,
  Star,
  Check,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Navigation,
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
    pickupCoords = null,
    dropLocation = 'Drop location',
    dropCoords = null,
    bookingTypeDisplay = 'In Station',
    tripTypeDisplay = 'Round Trip',
    carType = 'Sedan',
    transmission = 'Manual',
    carCategory = 'Standard',
    isTaken = false,
    takenByOther = false,
    canAccept = true,
  } = request;

  const handleOpenMaps = (e, target = 'route') => {
    e?.stopPropagation?.();
    let url = '';

    const formatPoint = (coords, address) => {
      if (Array.isArray(coords) && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        // [longitude, latitude] -> lat,lng for Google Maps
        return `${coords[1]},${coords[0]}`;
      }
      return address ? encodeURIComponent(address) : '';
    };

    const origin = formatPoint(pickupCoords, pickupLocation);
    const destination = formatPoint(dropCoords, dropLocation);

    if (target === 'pickup') {
      if (origin) {
        url = `https://www.google.com/maps/search/?api=1&query=${origin}`;
      }
    } else if (target === 'drop') {
      if (destination) {
        url = `https://www.google.com/maps/search/?api=1&query=${destination}`;
      }
    } else {
      // Full driving directions route from Pickup to Drop
      if (origin && destination) {
        url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
      } else if (origin) {
        url = `https://www.google.com/maps/search/?api=1&query=${origin}`;
      } else if (destination) {
        url = `https://www.google.com/maps/search/?api=1&query=${destination}`;
      }
    }

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/90 shadow-xs p-3 sm:p-4 transition-all relative overflow-hidden ${
        isTaken ? 'opacity-70 bg-slate-50/90' : 'hover:shadow-sm'
      } ${className}`}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#4F46E5] text-white">
            {tripIdDisplay || `Trip ID: ${bookingNumber || 'TRP124578'}`}
          </span>
          <span className="text-[11px] font-semibold text-slate-500 truncate">
            {customerType || 'B2C'}
          </span>
        </div>

        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white shrink-0">
          Earning: {formatCurrency(driverEarning)}
        </span>
      </div>

      {/* Package & Schedule Row */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-black text-slate-900 truncate">
            {packageTitle || '4 HOURS - Plus'}
          </p>
        </div>

        <div className="text-right shrink-0 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">
            {paymentMode}
          </span>
          <span className="text-xs font-black text-slate-900">
            {timeDisplay}
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            · {dateDisplay}
          </span>
        </div>
      </div>

      {/* Clickable Route Box to open Google Maps Route */}
      <div
        onClick={(e) => handleOpenMaps(e, 'route')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleOpenMaps(e, 'route');
        }}
        title="Click to view route on Google Maps"
        className="group relative pl-5 pr-7 py-1.5 -mx-1.5 rounded-lg mb-2 text-xs hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition border border-transparent hover:border-slate-200/70"
      >
        {/* Route Line Indicator */}
        {dropLocation && (
          <div className="absolute left-3.5 top-3.5 bottom-3.5 w-0.5 bg-slate-200 group-hover:bg-indigo-300 transition-colors" />
        )}

        {/* Pickup */}
        <div
          className="relative flex items-start gap-1.5 min-w-0"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenMaps(e, 'pickup');
          }}
        >
          <div className="absolute -left-3.5 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100 group-hover:ring-emerald-200 transition" />
          <p className="text-slate-800 font-medium line-clamp-1 leading-snug group-hover:text-indigo-600 transition" title={pickupLocation}>
            {pickupLocation}
          </p>
        </div>

        {/* Drop */}
        {dropLocation && (
          <div
            className="relative flex items-start gap-1.5 min-w-0 mt-1.5"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenMaps(e, 'drop');
            }}
          >
            <div className="absolute -left-3.5 top-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-100 group-hover:ring-rose-200 transition" />
            <p className="text-slate-600 font-medium line-clamp-1 leading-snug group-hover:text-indigo-600 transition" title={dropLocation}>
              {dropLocation}
            </p>
          </div>
        )}

        {/* Floating Map / Route Icon */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-500 flex items-center justify-center transition shadow-2xs" title="Open in Google Maps">
          <Navigation className="w-3.5 h-3.5 stroke-[2.2]" />
        </div>
      </div>

      {/* Sleek Specs Chips / Badges */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
        {carType && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
            <Car className="w-3 h-3 text-slate-500" />
            <span>{carType}{transmission ? ` · ${transmission}` : ''}</span>
          </span>
        )}

        {carCategory && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold border border-amber-200/60">
            <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
            <span>{carCategory}</span>
          </span>
        )}

        {bookingTypeDisplay && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
            <Briefcase className="w-3 h-3 text-slate-500" />
            <span>{bookingTypeDisplay}</span>
          </span>
        )}

        {tripTypeDisplay && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
            <Waypoints className="w-3 h-3 text-slate-500" />
            <span>{tripTypeDisplay}</span>
          </span>
        )}

        {needDriver && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{needDriver}</span>
          </span>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        {isTaken || takenByOther ? (
          <div className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>Booked by another driver</span>
          </div>
        ) : cashBlocked ? (
          <div className="w-full flex items-center justify-between gap-1.5 p-2 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Negative wallet: recharge required for cash bookings</span>
            </div>
          </div>
        ) : (
          <div className="w-full flex items-center gap-2">
            {onDecline && (
              <button
                type="button"
                onClick={() => {
                  setDeclined(true);
                  onDecline(request);
                }}
                disabled={isAccepting}
                className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition active:scale-95 disabled:opacity-50"
              >
                Decline
              </button>
            )}

            <button
              type="button"
              onClick={() => onAccept(request)}
              disabled={isAccepting || !canAccept}
              className="flex-1 py-2 px-3.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] shadow-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAccepting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Accepting...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
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
