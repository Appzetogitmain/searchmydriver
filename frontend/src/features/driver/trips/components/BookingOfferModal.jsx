import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  SkipForward,
  Loader2,
  IndianRupee,
  Navigation,
  User as UserIcon,
  Phone as PhoneIcon,
  Car as CarIcon,
  CalendarClock,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import useDriverIncomingOfferStore from '../../../../store/driver/useDriverIncomingOfferStore';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { useNotificationSound } from '../../../../hooks/useNotificationSound';
import { S2C_EVENTS } from '../../../../constants/socketEvents';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { BOOKING_TYPE, TRIP_TYPE_LABELS } from '../../../../constants/bookingStatus';
import { formatDistance } from '../../../../utils/geo';
import { formatCurrency } from '../../../../utils/formatters';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import Button from '../../../../components/Button';

/**
 * Visual themes for the three offer flavours: instant (amber), scheduled
 * (indigo), and outstation (emerald). Keeping them visually distinct helps
 * drivers immediately identify the type of ride at a glance.
 */
const OFFER_THEMES = {
  [BOOKING_TYPE.INSTANT]: {
    headerBg: 'bg-amber-50',
    headerRing: 'ring-2 ring-amber-300',
    headerText: 'text-amber-700',
    headerHeading: 'text-amber-900',
    pillBg: 'bg-amber-200/70',
    pillText: 'text-amber-900',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    progressBar: 'bg-amber-500',
    label: 'Instant ride',
    Icon: Zap,
  },
  [BOOKING_TYPE.SCHEDULED]: {
    headerBg: 'bg-indigo-50',
    headerRing: 'ring-2 ring-indigo-300',
    headerText: 'text-indigo-700',
    headerHeading: 'text-indigo-900',
    pillBg: 'bg-indigo-200/70',
    pillText: 'text-indigo-900',
    badgeBg: 'bg-indigo-500',
    badgeText: 'text-white',
    progressBar: 'bg-indigo-500',
    label: 'Scheduled ride',
    Icon: CalendarClock,
  },
  [BOOKING_TYPE.OUTSTATION]: {
    headerBg: 'bg-emerald-50',
    headerRing: 'ring-2 ring-emerald-300',
    headerText: 'text-emerald-700',
    headerHeading: 'text-emerald-900',
    pillBg: 'bg-emerald-200/70',
    pillText: 'text-emerald-900',
    badgeBg: 'bg-emerald-600',
    badgeText: 'text-white',
    progressBar: 'bg-emerald-500',
    label: 'Outstation trip',
    Icon: CalendarClock,
  },
};

/** The asset that rings when a new offer arrives. Reused across the app. */
const OFFER_ALERT_SRC = '/audio/alert_.mp3';

function CountdownBar({ expiresAt, barColorClass = 'bg-primary' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const total = 30_000;
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Decide soon</span>
        <span className="font-bold text-text">{seconds}s</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-[width] duration-200 ease-linear ${barColorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const formatOfferDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

const formatOfferTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;

/**
 * Flattens everything the customer entered at booking time into
 * label/value tiles. Rows with no value are dropped so each service
 * type only shows what actually applies to it.
 */
function buildOfferDetails(offer) {
  const { serviceType, hourly, outstation, monthly } = offer;
  const isInstant = offer.bookingType === BOOKING_TYPE.INSTANT;

  const pickupAt =
    serviceType === SERVICE_TYPES.OUTSTATION
      ? outstation?.pickupAt || outstation?.startDate
      : serviceType === SERVICE_TYPES.MONTHLY
      ? monthly?.startDate
      : hourly?.scheduledStartAt;

  let driverRequired = null;
  if (serviceType === SERVICE_TYPES.HOURLY && hourly?.durationHours) {
    driverRequired = plural(hourly.durationHours, 'Hour');
  } else if (serviceType === SERVICE_TYPES.OUTSTATION && outstation?.days) {
    driverRequired = plural(outstation.days, 'Day');
    if (outstation.nights > 0) driverRequired += ` / ${plural(outstation.nights, 'Night')}`;
  } else if (serviceType === SERVICE_TYPES.MONTHLY && monthly?.workingHoursPerDay) {
    driverRequired = `${monthly.workingHoursPerDay} Hours/day`;
  }

  const tripType = TRIP_TYPE_LABELS[(hourly || outstation)?.tripType] || null;
  const estimatedKm = (hourly || outstation)?.estimatedKm;
  const returnAt =
    serviceType === SERVICE_TYPES.OUTSTATION
      ? outstation?.expectedReturnAt || outstation?.endDate
      : serviceType === SERVICE_TYPES.MONTHLY
      ? monthly?.endDate
      : null;

  const bookingTypeLabel =
    serviceType === SERVICE_TYPES.OUTSTATION
      ? 'Outstation'
      : SERVICE_TYPE_LABELS[serviceType] || serviceType;

  return [
    { label: 'Pickup', value: isInstant && !pickupAt ? 'Today' : formatOfferDate(pickupAt) },
    {
      label: 'Time',
      value: isInstant ? 'Now' : formatOfferTime(pickupAt),
    },
    { label: 'Driver Required', value: driverRequired },
    { label: 'Booking Type', value: bookingTypeLabel },
    { label: 'Trip Type', value: tripType },
    { label: 'Car Type', value: offer.car?.carTypeName || null },
    {
      label: serviceType === SERVICE_TYPES.MONTHLY ? 'End Date' : 'Return',
      value: returnAt
        ? serviceType === SERVICE_TYPES.MONTHLY
          ? formatOfferDate(returnAt)
          : `${formatOfferDate(returnAt)}, ${formatOfferTime(returnAt)}`
        : null,
    },
    { label: 'Est. Distance', value: estimatedKm > 0 ? `${estimatedKm} km` : null },
    {
      label: 'Food & Stay',
      value:
        serviceType === SERVICE_TYPES.OUTSTATION
          ? outstation?.needsFood && outstation?.needsStay
            ? 'By customer'
            : 'Not provided'
          : null,
    },
    {
      label: 'Lunch',
      value:
        serviceType === SERVICE_TYPES.MONTHLY
          ? monthly?.includeLunch
            ? 'Included'
            : 'Not included'
          : null,
    },
    {
      label: 'Payment',
      value: offer.paymentMode
        ? offer.paymentMode.charAt(0).toUpperCase() + offer.paymentMode.slice(1).replace(/_/g, ' ')
        : null,
    },
  ].filter((d) => d.value);
}

function DetailTile({ label, value, className = '' }) {
  return (
    <div className={`rounded-xl bg-bg/70 border border-gray-100 px-3 py-2 min-w-0 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text mt-0.5 break-words">{value}</p>
    </div>
  );
}

function OfferDetailsGrid({ offer, pickupDistanceLabel }) {
  const details = buildOfferDetails(offer);
  const dropAddress =
    offer.outstation?.destinationAddress ||
    (offer.dropoff?.address && offer.dropoff.address !== offer.pickup?.address
      ? offer.dropoff.address
      : null);

  return (
    <div className="grid grid-cols-2 gap-2">
      {details.slice(0, 4).map((d) => (
        <DetailTile key={d.label} label={d.label} value={d.value} />
      ))}

      <div className="col-span-2 rounded-xl bg-bg/70 border border-gray-100 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted inline-flex items-center gap-1">
          <MapPin className="w-3 h-3 text-success" /> Pickup Address
        </p>
        <p className="text-sm font-medium text-text mt-0.5 break-words">
          {offer.pickup?.address || '—'}
        </p>
        {pickupDistanceLabel && (
          <p className="text-[11px] text-primary-dark font-semibold mt-0.5">
            {pickupDistanceLabel} away from you
          </p>
        )}
      </div>

      {dropAddress && (
        <div className="col-span-2 rounded-xl bg-bg/70 border border-gray-100 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted inline-flex items-center gap-1">
            <MapPin className="w-3 h-3 text-danger" /> Drop Address
          </p>
          <p className="text-sm font-medium text-text mt-0.5 break-words">{dropAddress}</p>
        </div>
      )}

      {details.slice(4).map((d) => (
        <DetailTile key={d.label} label={d.label} value={d.value} />
      ))}
    </div>
  );
}

const BookingOfferModal = () => {
  const offers = useDriverIncomingOfferStore((s) => s.offers);
  const offer = offers.length > 0 ? offers[0] : null;
  const busy = useDriverIncomingOfferStore((s) => s.busy);
  const error = useDriverIncomingOfferStore((s) => s.error);
  const setOffer = useDriverIncomingOfferStore((s) => s.setOffer);
  const clearOffer = useDriverIncomingOfferStore((s) => s.clearOffer);
  const acceptOffer = useDriverIncomingOfferStore((s) => s.accept);
  const rejectOffer = useDriverIncomingOfferStore((s) => s.reject);
  const driver = useDriverAuthStore((s) => s.driver);
  const navigate = useNavigate();

  // Looping alert tone that rings while an offer is on screen. Stops the
  // moment the offer is cleared (accept / skip / server-side withdrawal).
  const { play: playAlert, stop: stopAlert } = useNotificationSound(OFFER_ALERT_SRC, {
    loop: true,
    volume: 0.9,
  });

  // Inbound offer from server → push into the store.
  useSocketEvent(S2C_EVENTS.BOOKING_OFFERED, (payload) => {
    setOffer(payload);
  });

  // Fetch all pending offers on initial mount to catch any we missed while offline/reloading.
  useEffect(() => {
    useDriverIncomingOfferStore.getState().fetchPendingOffers();
  }, []);

  // Server withdrew the offer (timeout / cancellation / picked someone else).
  useSocketEvent(S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, (payload) => {
    if (payload?.bookingId) {
      clearOffer(payload.bookingId);
    }
  });

  // Ring while there's an active offer; silence otherwise. Keyed on the
  // bookingId so a back-to-back new offer restarts the tone instead of
  // continuing the previous loop.
  useEffect(() => {
    if (offer?.bookingId) {
      playAlert();
      return () => stopAlert();
    }
    stopAlert();
    return undefined;
  }, [offer?.bookingId, playAlert, stopAlert]);

  if (!offer) return null;

  const handleAccept = async () => {
    try {
      const booking = await acceptOffer(offer.bookingId);
      if (offers.length <= 1) stopAlert();
      if (booking?._id) {
        navigate(`/driver/trip/${booking._id}`);
      }
    } catch {
      /* error surfaced inline */
    }
  };

  const handleSkip = async () => {
    try {
      await rejectOffer(offer.bookingId);
      if (offers.length <= 1) stopAlert();
    } catch {
      /* error surfaced inline */
    }
  };


  const title =
    offer.serviceType === SERVICE_TYPES.OUTSTATION
      ? `${offer.outstation?.days || 1}-day Outstation`
      : offer.serviceType === SERVICE_TYPES.MONTHLY
      ? `Monthly Ride (${offer.monthly?.workingHoursPerDay || 9}h/day)`
      : `${offer.hourly?.durationHours || ''}h ${SERVICE_TYPE_LABELS.hourly}`;

  // Distance from the driver to the customer's pickup (server-computed during
  // dispatch). Helps the driver decide whether the offer is worth taking.
  const pickupDistanceLabel =
    typeof offer.distanceMeters === 'number'
      ? formatDistance(offer.distanceMeters)
      : null;

  // Pick the colour scheme based on whether this is an instant or
  // scheduled offer so drivers can identify the ride type at a glance.
  // Falls back to the instant theme when bookingType is missing (older
  // server payloads).
  const theme =
    OFFER_THEMES[offer.bookingType] || OFFER_THEMES[BOOKING_TYPE.INSTANT];
  const ThemeIcon = theme.Icon;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up ${theme.headerRing}`}
      >
        <div className={`relative ${theme.headerBg} px-5 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${theme.badgeBg} ${theme.badgeText}`}
                >
                  <ThemeIcon className="w-3 h-3" />
                  {theme.label}
                </span>
              </div>
              <p
                className={`text-xs font-semibold uppercase tracking-wider mt-2 ${theme.headerText}`}
              >
                New booking offer
              </p>
              <h2 className={`text-xl font-bold mt-1 ${theme.headerHeading}`}>
                {title}
              </h2>
            </div>
            {pickupDistanceLabel && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${theme.pillBg} ${theme.pillText}`}
              >
                <Navigation className="w-3 h-3" />
                {pickupDistanceLabel} to pickup
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">#{offer.bookingNumber}</p>
        </div>

        <div className="p-5 space-y-4">
          {offer.customer && (offer.customer.name || offer.customer.phone) && (
            <div className="flex items-start gap-3 rounded-2xl bg-bg/60 p-3">
              {offer.customer.profilePicture ? (
                <img
                  src={offer.customer.profilePicture}
                  alt=""
                  className="w-9 h-9 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4 text-primary-dark" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-muted">Customer</p>
                <p className="text-sm font-semibold text-text truncate">
                  {offer.customer.name || 'Customer'}
                </p>
                {offer.customer.phone && (
                  <p className="text-[11px] text-text-secondary inline-flex items-center gap-1 mt-0.5">
                    <PhoneIcon className="w-3 h-3" />
                    {offer.customer.phone}
                  </p>
                )}
              </div>
            </div>
          )}

          {offer.car && (offer.car.vehicleNumber || offer.car.carTypeName) && (
            <div className="flex items-start gap-3 rounded-2xl bg-bg/60 p-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <CarIcon className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-muted">Vehicle</p>
                <p className="text-sm font-semibold text-text truncate">
                  {[offer.car.brandName, offer.car.modelName].filter(Boolean).join(' ') ||
                    offer.car.carTypeName ||
                    'Vehicle'}
                </p>
                <p className="text-[11px] text-text-secondary">
                  {[offer.car.carTypeName, offer.car.transmission, offer.car.fuelTypeName]
                    .filter(Boolean)
                    .join(' · ')}
                  {offer.car.vehicleNumber ? ` · ${offer.car.vehicleNumber}` : ''}
                </p>
              </div>
            </div>
          )}

          <OfferDetailsGrid offer={offer} pickupDistanceLabel={pickupDistanceLabel} />

          {/* The driver only ever sees their own earning — the customer's
              gross fare and the platform commission are never sent to
              the driver app. Server has already subtracted the commission
              for us in `offer.fare.driverEarning`. */}
          <div className="flex items-center justify-between bg-emerald-50 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-emerald-700" />
              <div>
                <p className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">
                  Your earning
                </p>
                {offer.serviceType === SERVICE_TYPES.MONTHLY ? (
                  <>
                    <p className="text-base font-bold text-text">
                      Negotiated
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      Directly with customer
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-bold text-text">
                      {'\u20B9'}{Number(offer.fare?.driverEarning ?? 0).toLocaleString('en-IN')}
                      <span className="text-sm font-semibold text-emerald-700"> + tip</span>
                    </p>
                    {offer.fare?.offlineTip > 0 && (
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        + {'\u20B9'}{Number(offer.fare.offlineTip).toLocaleString('en-IN')} extra offline tip
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          
          {offer.serviceType === SERVICE_TYPES.MONTHLY && offer.paymentMode === 'cash' && (
            <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-3 mt-4 border border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  Cash Booking Warning
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  You will collect {'\u20B9'}{offer.monthlyRegistrationFee ?? 2000} in cash from the user. 
                  This amount will be deducted from your wallet as a platform fee upon acceptance.
                </p>
              </div>
            </div>
          )}

          {offer.paymentMode === 'cash' && Number(driver?.wallet?.balance || 0) < 0 && (
            <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-3 mt-4 border border-rose-200 animate-fade-in">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-rose-900">
                  Cash Ride Not Allowed
                </p>
                <p className="text-xs text-rose-700 mt-1 leading-snug">
                  Your wallet balance is currently in minus ({formatCurrency(driver?.wallet?.balance || 0)}). You cannot accept cash bookings. Please recharge your wallet or accept online payment rides.
                </p>
              </div>
            </div>
          )}

          {offer.offerExpiresAt && (
            <CountdownBar
              expiresAt={offer.offerExpiresAt}
              barColorClass={theme.progressBar}
            />
          )}

          {offer.upcomingScheduledTripStartMs && (
            <div className="flex items-start gap-2.5 bg-amber-50 rounded-2xl p-3 border border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-bold text-amber-900 leading-snug">
                  Upcoming Scheduled Trip
                </p>
                <p className="text-xs text-amber-700 mt-1 leading-snug">
                  You have a scheduled trip starting at{' '}
                  <span className="font-bold">
                    {new Date(offer.upcomingScheduledTripStartMs).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  . You must complete this instant ride beforehand.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleSkip}
              disabled={busy === 'accept'}
              loading={busy === 'reject'}
              icon={SkipForward}
            >
              Skip
            </Button>
            <Button
              fullWidth
              onClick={handleAccept}
              disabled={
                busy === 'reject' ||
                (offer.paymentMode === 'cash' && Number(driver?.wallet?.balance || 0) < 0)
              }
              loading={busy === 'accept'}
            >
              {busy === 'accept' ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Accepting…
                </span>
              ) : (
                'Accept'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingOfferModal;
