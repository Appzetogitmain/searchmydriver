import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Loader2, AlertTriangle, X, Utensils, BedDouble, Info, Plus, Moon } from 'lucide-react';
import Button from '../../../../../components/Button';
import PageShell from '../../components/PageShell';
import FareCard from '../../components/FareCard';
import OfflineTipSelector from '../../components/OfflineTipSelector';
import useFareEstimate from '../../hooks/useFareEstimate';
import useBookingDraftStore from '../../../../../store/user/useBookingDraftStore';
import {
  useUserServicePricingsStore,
} from '../../../../../store/user/useUserPricingStore';
import { useCachedQuery } from '../../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../../store/lib/buildCacheKey';
import { SERVICE_TYPES } from '../../../../../constants/serviceTypes';
import { TRIP_TYPE } from '../../../../../constants/bookingStatus';
import { haversineMeters } from '../../../../../utils/geo';

const CUSTOM_KEY = '__custom__';

/**
 * Step 3 of the hourly booking flow.
 *
 *   Pick a slab (or custom hours) → see the live fare → confirm.
 *
 * The fare card refreshes live as the user toggles between options so
 * they never confirm without knowing the final amount.
 */
const HourlySlabSelectionPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const draft = useBookingDraftStore();
  const setHourly = useBookingDraftStore((s) => s.setHourly);
  const setFareEstimate = useBookingDraftStore((s) => s.setFareEstimate);
  const offlineTip = useBookingDraftStore((s) => s.offlineTip);
  const setOfflineTip = useBookingDraftStore((s) => s.setOfflineTip);

  // The searching page bounces the user here with `state.noDriversFound`
  // when the dispatcher exhausts every wave without an accept. We surface
  // it as a dismissible banner so the user can retune the duration and
  // submit again — the draft itself is preserved on purpose.
  const [noDriversBanner, setNoDriversBanner] = useState(
    !!location.state?.noDriversFound,
  );
  useEffect(() => {
    if (!location.state?.noDriversFound) return;
    // Strip the flag off the history entry so a refresh / back-nav doesn't
    // resurrect the banner.
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const { data: pricingList } = useCachedQuery(
    useUserServicePricingsStore,
    buildCacheKey('user-services-active'),
  );

  const pricing = useMemo(
    () => (Array.isArray(pricingList) ? pricingList.find((p) => p.serviceType === SERVICE_TYPES.HOURLY) : null),
    [pricingList],
  );

  // Bounce if the user landed without the prerequisites.
  useEffect(() => {
    if (draft.serviceType !== SERVICE_TYPES.HOURLY) {
      navigate('/user/book/hourly/type', { replace: true });
    } else if (!draft.pickup || !draft.carId) {
      navigate('/user/book/hourly/details', { replace: true });
    }
  }, [draft.serviceType, draft.pickup, draft.carId, navigate]);

  const [customHours, setCustomHours] = useState(
    draft.hourly.isCustomDuration && draft.hourly.durationHours
      ? draft.hourly.durationHours
      : 6,
  );

  const slabs = useMemo(() => {
    const arr = pricing?.slabs ? [...pricing.slabs] : [];
    return arr.sort((a, b) => a.minHours - b.minHours);
  }, [pricing]);

  // Restore prior selection if the user came back from the next step,
  // otherwise auto-select the first slab so the fare calculates immediately.
  const initialKey = draft.hourly.isCustomDuration
    ? CUSTOM_KEY
    : draft.hourly.slabId || (slabs.length > 0 ? slabs[0]._id : null);
  const [selectedKey, setSelectedKey] = useState(initialKey);

  // If initialKey was null because slabs weren't loaded yet, set it once they load.
  useEffect(() => {
    if (!selectedKey && slabs.length > 0 && !draft.hourly.isCustomDuration) {
      setSelectedKey(slabs[0]._id);
    }
  }, [selectedKey, slabs, draft.hourly.isCustomDuration]);

  const customEnabled = !!pricing?.customHours?.enabled;
  const customMaxHours = pricing?.customHours?.maxHours || 0;
  const customRate = pricing?.customHours?.ratePerHour || 0;

  // The user's current pick, derived for the fare estimate.
  const currentSelection = useMemo(() => {
    if (!selectedKey) return null;
    if (selectedKey === CUSTOM_KEY) {
      return {
        isCustom: true,
        durationHours: Math.max(1, Number(customHours) || 1),
        slabId: null,
      };
    }
    const slab = slabs.find((s) => String(s._id) === String(selectedKey));
    if (!slab) return null;
    return {
      isCustom: false,
      durationHours: slab.maxHours,
      slabId: String(slab._id),
      slab,
    };
  }, [selectedKey, slabs, customHours]);

  const isOneWay = draft.hourly?.tripType === TRIP_TYPE.ONE_WAY;

  const effectiveKm = useMemo(() => {
    if (!isOneWay) return 0;
    if (draft.hourly?.estimatedKm && Number(draft.hourly.estimatedKm) > 0) {
      return Number(draft.hourly.estimatedKm);
    }
    if (draft.pickup?.lat && draft.dropoff?.lat) {
      const dist = haversineMeters(draft.pickup, draft.dropoff);
      if (Number.isFinite(dist) && dist > 0) {
        return Math.max(1, Math.round((dist / 1000) * 1.3));
      }
    }
    return 0;
  }, [isOneWay, draft.hourly?.estimatedKm, draft.pickup, draft.dropoff]);

  useEffect(() => {
    if (isOneWay && effectiveKm > 0 && draft.hourly?.estimatedKm !== effectiveKm) {
      setHourly({ estimatedKm: effectiveKm });
    }
  }, [isOneWay, effectiveKm, draft.hourly?.estimatedKm, setHourly]);

  // Fare estimation payload — debounced inside the hook. We forward the
  // user's food/stay overrides here so the live total reflects them.
  const estimatePayload = useMemo(() => {
    if (!currentSelection) return null;
    const scheduledAt = draft.hourly?.scheduledStartAt || new Date().toISOString();
    const base = {
      serviceType: SERVICE_TYPES.HOURLY,
      slabId: currentSelection.isCustom ? null : currentSelection.slabId,
      bookedHours: currentSelection.durationHours,
      scheduledAt,
      tripType: draft.hourly?.tripType || TRIP_TYPE.ROUND_TRIP,
      estimatedKm: effectiveKm || 0,
    };
    if (draft.hourly.foodProvided != null) base.foodProvided = !!draft.hourly.foodProvided;
    if (draft.hourly.stayProvided != null) base.stayProvided = !!draft.hourly.stayProvided;
    return base;
  }, [
    currentSelection,
    draft.hourly.scheduledStartAt,
    draft.hourly.foodProvided,
    draft.hourly.stayProvided,
    draft.hourly?.tripType,
    effectiveKm,
  ]);

  const { estimate, loading: estimating, error: estimateError } = useFareEstimate(estimatePayload, {
    onResult: (data) => setFareEstimate(data),
  });

  // Extras config tells the FE whether the food / stay notice should
  // appear and whether accommodation can be skipped. Food is no longer
  // billed for hourly — we only surface a "please arrange the driver's
  // meal" notice once the booked duration crosses the admin threshold.
  const extras = estimate?.extrasConfig || {};
  const foodCfg = extras.foodAllowance || {};
  const stayCfg = extras.stayAllowance || {};
  const durationHours = Number(currentSelection?.durationHours || 0);
  const foodRequired =
    !!foodCfg.enabled &&
    Number(foodCfg.thresholdHours || 0) > 0 &&
    durationHours >= Number(foodCfg.thresholdHours);
  const showStayToggle =
    !!stayCfg.enabled &&
    !!stayCfg.userOptOut &&
    Number(stayCfg.thresholdHours || 0) > 0 &&
    durationHours >= Number(stayCfg.thresholdHours);

  // Stay opt-out for very long hourly bookings.
  const stayProvided = draft.hourly.stayProvided ?? true;

  // Mandatory acknowledgement when the booked duration crosses the food
  // threshold: the customer must explicitly tick "I'll feed the driver"
  // before they can move on. Once the threshold no longer applies (e.g.
  // user switched to a shorter slab) we silently clear the flag so a
  // later long-duration switch re-asks for consent.
  const foodAcknowledged = !!draft.hourly.foodAcknowledged;
  useEffect(() => {
    if (!foodRequired && foodAcknowledged) {
      setHourly({ foodAcknowledged: false });
    }
  }, [foodRequired, foodAcknowledged, setHourly]);
  const foodGateUnmet = foodRequired && !foodAcknowledged;

  /* ---------------- Confirm ---------------- */

  const handleConfirm = () => {
    if (!currentSelection) return;
    if (foodGateUnmet) return;
    // Stamp the final hourly picks into the draft so the confirm-and-pay
    // page reads consistent values. No backend call here — that happens
    // on confirm.
    setHourly({
      durationHours: currentSelection.durationHours,
      slabId: currentSelection.isCustom ? null : currentSelection.slabId,
      isCustomDuration: currentSelection.isCustom,
    });
    navigate('/user/book/confirm');
  };

  const totalWithTip = (estimate?.fareBreakdown?.totalPayable || 0) + (offlineTip || 0);
  const ctaLabel = foodGateUnmet
    ? 'Please confirm the driver\u2019s meal'
    : estimate?.fareBreakdown?.totalPayable
      ? `Review & pay · \u20B9${totalWithTip.toFixed(2)}`
      : 'Review & pay';

  /* ---------------- Render ---------------- */

  return (
    <PageShell
      title="Pick a duration"
      subtitle="Hourly bookings — choose a slab or set custom hours."
      footer={
        <Button
          fullWidth
          disabled={
            !currentSelection || estimating || !!estimateError || foodGateUnmet
          }
          onClick={handleConfirm}
        >
          {ctaLabel}
        </Button>
      }
    >
      {!pricing ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="space-y-3">
          {noDriversBanner && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-3 py-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rose-900">
                  No driver available right now
                </p>
                <p className="text-[12px] text-rose-800 leading-snug mt-0.5">
                  We couldn&apos;t find a driver for your last request. Adjust the duration if you like and try again &ndash; your pickup and car selection are saved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNoDriversBanner(false)}
                className="p-1.5 -mt-1 -mr-1 rounded-xl text-rose-700 hover:bg-rose-100"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Trip Summary: Route & Distance */}
          <div className="rounded-2xl border border-border bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {isOneWay ? 'One-way trip' : 'Round trip'}
              </span>
              {isOneWay && effectiveKm > 0 ? (
                <span className="text-xs font-bold text-text bg-gray-100 px-2.5 py-0.5 rounded-lg">
                  ~{effectiveKm} km
                </span>
              ) : (
                <span className="text-[11px] text-text-muted font-medium">
                  Unlimited km
                </span>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <p className="text-xs text-text-secondary truncate">
                  <span className="font-semibold text-text">Pickup: </span>
                  {draft.pickup?.address || 'Pickup location'}
                </p>
              </div>
              {isOneWay && draft.dropoff?.address && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <p className="text-xs text-text-secondary truncate">
                    <span className="font-semibold text-text">Dropoff: </span>
                    {draft.dropoff?.address || 'Dropoff location'}
                  </p>
                </div>
              )}
            </div>

            {isOneWay && pricing?.oneWayCharge?.enabled && (
              <div className="pt-2 border-t border-border-light flex items-center justify-between text-[11px] text-text-muted">
                <span>Distance rate:</span>
                <span className="font-semibold text-text">₹{pricing.oneWayCharge.perKmRate || 0}/km</span>
              </div>
            )}
            {!isOneWay && (
              <p className="pt-1.5 border-t border-border-light text-[11px] text-text-muted">
                Driver stays with you for the duration · no extra distance charge.
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">
              Duration
            </p>
            <div className="space-y-2">
              {slabs.map((slab) => {
                const id = String(slab._id);
                return (
                  <SlabRow
                    key={id}
                    active={selectedKey === id}
                    title={slab.label || `Up to ${slab.maxHours} hours`}
                    subtitle={`Up to ${slab.maxHours} h${
                      pricing.extraHourCharge ? ` · extra ₹${pricing.extraHourCharge}/hr` : ''
                    }${
                      isOneWay && pricing.oneWayCharge?.enabled && pricing.oneWayCharge?.perKmRate
                        ? ` · + ₹${pricing.oneWayCharge.perKmRate}/km`
                        : ''
                    }`}
                    price={`₹${slab.price}`}
                    onClick={() => setSelectedKey(id)}
                  />
                );
              })}

              {customEnabled && (
                <CustomRow
                  active={selectedKey === CUSTOM_KEY}
                  label={pricing.customHours?.label || 'Custom duration'}
                  rate={customRate}
                  maxHours={customMaxHours}
                  hours={customHours}
                  isOneWay={isOneWay}
                  perKmRate={pricing.oneWayCharge?.enabled ? pricing.oneWayCharge?.perKmRate : 0}
                  onSelect={() => setSelectedKey(CUSTOM_KEY)}
                  onHoursChange={setCustomHours}
                />
              )}
            </div>
          </div>

          {selectedKey && foodRequired && (
            <FoodRequiredCheckbox
              thresholdHours={Number(foodCfg.thresholdHours)}
              checked={foodAcknowledged}
              onChange={(v) => setHourly({ foodAcknowledged: v })}
            />
          )}

          {selectedKey && showStayToggle && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
                Driver care for longer bookings
              </p>
              <ExtraToggleRow
                icon={BedDouble}
                title="Provide driver's stay"
                helper={`Bookings ≥ ${stayCfg.thresholdHours}h normally include ₹${stayCfg.amount} stay allowance.`}
                enabled={stayProvided}
                onChange={(value) => setHourly({ stayProvided: value })}
                amount={stayCfg.amount}
              />
            </div>
          )}

          {selectedKey && (
            <OfflineTipSelector value={offlineTip} onChange={setOfflineTip} />
          )}

          {selectedKey && Number(estimate?.fareBreakdown?.nightCharge) > 0 && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Moon className="w-4 h-4 text-indigo-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-indigo-900">
                  Night charge applied (₹{estimate.fareBreakdown.nightCharge})
                </p>
                <p className="text-[12px] text-indigo-800 leading-snug mt-0.5">
                  Automatically applied for bookings active between 10:00 PM and 6:00 AM.
                </p>
              </div>
            </div>
          )}

          {selectedKey && (
            <FareCard
              estimate={estimate}
              estimating={estimating}
              error={estimateError}
            />
          )}

        </div>
      )}
    </PageShell>
  );
};

/**
 * Mandatory acknowledgement: when the booked duration crosses the food
 * threshold the customer must explicitly tick "I'll arrange the
 * driver's meal" before they can move on. No fee is ever added — this
 * is purely a consent gate so drivers aren't left hungry on long
 * bookings.
 */
function FoodRequiredCheckbox({ thresholdHours, checked, onChange }) {
  return (
    <label
      className={`rounded-2xl border p-3 flex items-start gap-3 cursor-pointer transition ${checked
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-amber-300 bg-amber-50'
        }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${checked
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700'
          }`}
      >
        <Utensils className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`text-sm font-bold ${checked ? 'text-emerald-900' : 'text-amber-900'
              }`}
          >
            I&apos;ll arrange the driver&apos;s meal
          </p>
          {!checked && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
              Required
            </span>
          )}
          {checked && <Info className="w-3.5 h-3.5 text-emerald-700" />}
        </div>
        <p
          className={`text-[12px] leading-snug mt-0.5 ${checked ? 'text-emerald-800' : 'text-amber-800'
            }`}
        >
          Bookings of {thresholdHours} hours or longer cross meal time. We
          don&apos;t add a food charge to your fare — please confirm you&apos;ll
          arrange a meal for the driver during the trip.
        </p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(!!e.target.checked)}
        className="mt-1 w-4 h-4 accent-emerald-600 shrink-0"
        aria-label="Confirm you will arrange the driver's meal"
      />
    </label>
  );
}

function ExtraToggleRow({ icon: Icon, title, helper, enabled, onChange, amount }) {
  // `enabled === true` means the user has NOT opted out — i.e. food/stay
  // allowance is billed. The toggle reads "I will provide it" (saves the
  // allowance) so we flip the semantics for the user-facing copy.
  const userProvides = !enabled; // user provides => no allowance billed
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border bg-white p-3 cursor-pointer">
      <div className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className={`text-xs font-semibold ${userProvides ? 'text-success' : 'text-text-muted'}`}>
            {userProvides ? `Save ₹${amount}` : `+ ₹${amount}`}
          </p>
        </div>
        <p className="text-[11px] text-text-muted mt-0.5">{helper}</p>
      </div>
      <input
        type="checkbox"
        checked={userProvides}
        onChange={(e) => onChange(!e.target.checked)}
        className="mt-2 w-4 h-4 accent-primary"
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */

function SlabRow({ active, title, subtitle, price, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-3 flex items-center gap-3 transition ${active ? 'border-primary bg-primary/5' : 'border-border bg-white hover:bg-gray-50'
        }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-primary bg-primary' : 'border-gray-300'
          }`}
      >
        {active && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-[11px] text-text-muted">{subtitle}</p>
      </div>
      <p className="text-base font-bold text-text">{price}</p>
    </button>
  );
}

function CustomRow({ active, label, rate, maxHours, hours, onSelect, onHoursChange, isOneWay = false, perKmRate = 0 }) {
  return (
    <div
      className={`rounded-2xl border p-3 transition ${active ? 'border-primary bg-primary/5' : 'border-border bg-white'
        }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-3 text-left"
      >
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-primary bg-primary' : 'border-gray-300'
            }`}
        >
          {active && <Check className="w-3 h-3 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">{label}</p>
          <p className="text-[11px] text-text-muted">
            ₹{rate}/hour
            {maxHours > 0 ? ` · up to ${maxHours} hours` : ''}
            {isOneWay && perKmRate > 0 ? ` · + ₹${perKmRate}/km` : ''}
          </p>
        </div>
        {!active && <p className="text-xs font-semibold text-primary">Choose</p>}
      </button>

      {active && (
        <div className="mt-3 pt-3 border-t border-border-light">
          <label className="block text-xs font-semibold text-text-secondary mb-1.5">
            How many hours?
          </label>
          <div className="flex items-center gap-2">
            <Stepper
              value={hours}
              min={1}
              max={maxHours > 0 ? maxHours : 24}
              onChange={onHoursChange}
            />
            <p className="text-xs text-text-muted ml-2">
              ≈ ₹{Math.round((rate || 0) * (Number(hours) || 1))}{' '}
              <span className="text-[10px]">(before taxes & charges)</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ value, min, max, onChange }) {
  const decrement = () => onChange(Math.max(min, Number(value) - 1));
  const increment = () => onChange(Math.min(max, Number(value) + 1));
  return (
    <div className="inline-flex items-center rounded-xl border border-border bg-white">
      <button
        type="button"
        onClick={decrement}
        disabled={Number(value) <= min}
        className="w-9 h-9 text-lg font-bold text-text-muted disabled:opacity-40 hover:bg-gray-50 rounded-l-xl"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          onChange(Math.min(max, Math.max(min, n)));
        }}
        className="w-12 h-9 text-center text-sm font-bold text-text bg-transparent border-x border-border focus:outline-none"
      />
      <button
        type="button"
        onClick={increment}
        disabled={Number(value) >= max}
        className="w-9 h-9 text-lg font-bold text-text-muted disabled:opacity-40 hover:bg-gray-50 rounded-r-xl"
      >
        +
      </button>
    </div>
  );
}

export default HourlySlabSelectionPage;
