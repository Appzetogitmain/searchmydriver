import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, DollarSign, Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import api from '../../../../utils/api';
import { useFirebaseDriverLocations } from '../../../../hooks/useFirebaseDriverLocations';
import { BOOKING_STATUS } from '../../../../constants/bookingStatus';
import { formatDistance, haversineMeters } from '../../../../utils/geo';
import { SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';

/**
 * Live "trip in progress" screen — shows the driver gliding along the
 * route, a running ride clock and the latest fare snapshot pulled from
 * the active booking. Replaces the previous dummy-driven mock.
 */
const TripInProgressPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  
  const [offlineTip, setOfflineTip] = useState('');
  const [isSubmittingTip, setIsSubmittingTip] = useState(false);
  const [tipSuccess, setTipSuccess] = useState(false);

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  const driverObj = typeof booking?.driverId === 'object' ? booking?.driverId : null;
  const driverId = driverObj?._id || (typeof booking?.driverId === 'string' ? booking.driverId : null);
  const { map: liveDrivers } = useFirebaseDriverLocations();
  const liveDriver = driverId ? liveDrivers[String(driverId)] : null;

  const pickupPoint = useMemo(() => {
    const c = booking?.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.pickup]);

  const dropPoint = useMemo(() => {
    const c = booking?.outstation?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.outstation]);

  const driverPoint = useMemo(() => {
    if (!liveDriver) return null;
    return { lat: liveDriver.lat, lng: liveDriver.lng, heading: liveDriver.heading };
  }, [liveDriver]);

  // Live ride clock — anchored on `timeline.startedAt` when available, so
  // a page refresh during the ride continues from the right elapsed time.
  const startedAtMs = useMemo(() => {
    const ts = booking?.timeline?.startedAt;
    return ts ? new Date(ts).getTime() : null;
  }, [booking?.timeline?.startedAt]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = useMemo(() => {
    if (!startedAtMs) return 0;
    return Math.max(0, Math.floor((now - startedAtMs) / 1000));
  }, [startedAtMs, now]);

  useEffect(() => {
    if (!booking?.status) return;
    if (booking.status === BOOKING_STATUS.COMPLETED) {
      navigate('/user/tracking/completed', { replace: true });
    } else if (booking.status === BOOKING_STATUS.CANCELLED) {
      navigate('/user/home', { replace: true });
    }
  }, [booking?.status, navigate]);

  const formatTime = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const totalFare = booking?.fareSnapshot?.total || 0;
  const minutesElapsed = Math.floor(elapsedSec / 60);
  const tripDistance = useMemo(() => {
    if (driverPoint && pickupPoint) return haversineMeters(driverPoint, pickupPoint);
    return null;
  }, [driverPoint, pickupPoint]);

  const tripLabel =
    booking?.serviceType && SERVICE_TYPE_LABELS[booking.serviceType]
      ? `${SERVICE_TYPE_LABELS[booking.serviceType]} trip`
      : 'Trip in progress';

  const handleAddTip = async (amount) => {
    if (!booking?._id || isSubmittingTip) return;
    setIsSubmittingTip(true);
    try {
      await api.post(`/user/bookings/${booking._id}/offline-tip`, { amount });
      setOfflineTip('');
      setTipSuccess(true);
      setTimeout(() => setTipSuccess(false), 3000);
      fetchActive();
    } catch (err) {
      console.error('Failed to add tip', err);
    } finally {
      setIsSubmittingTip(false);
    }
  };

  const handleCustomTipSubmit = () => {
    const amount = Number(offlineTip);
    if (amount > 0) handleAddTip(amount);
  };

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      {pickupPoint ? (
        <TripTrackingMap
          driver={driverPoint}
          pickup={pickupPoint}
          dropoff={dropPoint}
          height={224}
          showRoute
          followDriver
          emphasis="driver"
        />
      ) : (
        <div className="h-56 bg-[#f4efe6] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      <div className="flex-1 -mt-8 z-10 px-4 space-y-4">
        <Card className="text-center animate-fade-in-up">
          <p className="text-sm text-text-muted mb-1">{tripLabel}</p>
          <p className="text-4xl font-bold text-text font-mono tracking-wider">
            {formatTime(elapsedSec)}
          </p>
          {booking?.bookingNumber ? (
            <p className="text-[11px] text-text-muted mt-1 font-mono">
              {booking.bookingNumber}
            </p>
          ) : null}
        </Card>

        <div className="grid grid-cols-3 gap-3 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <Card className="text-center !p-3">
            <MapPin className="w-5 h-5 text-info mx-auto mb-1" />
            <p className="text-lg font-bold">
              {tripDistance != null ? formatDistance(tripDistance).replace(' km', '').replace(' m', '') : '—'}
            </p>
            <p className="text-[10px] text-text-muted">
              {tripDistance != null && tripDistance >= 1000 ? 'km' : 'm'}
            </p>
          </Card>
          <Card className="text-center !p-3">
            <Clock className="w-5 h-5 text-warning mx-auto mb-1" />
            <p className="text-lg font-bold">{minutesElapsed}</p>
            <p className="text-[10px] text-text-muted">minutes</p>
          </Card>
          <Card className="text-center !p-3">
            <DollarSign className="w-5 h-5 text-success mx-auto mb-1" />
            <p className="text-lg font-bold">₹{totalFare}</p>
            <p className="text-[10px] text-text-muted">fare</p>
          </Card>
        </div>

        {/* Offline Extra Pay (Tip) */}
        <Card className="!p-3 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-bold text-text">Offline Extra Pay</p>
              <p className="text-[10px] text-text-muted leading-tight">
                Optional: Give an extra tip directly to the driver
              </p>
            </div>
            {booking?.offlineTip > 0 && (
              <div className="bg-success/10 text-success text-[10px] font-bold px-2 py-1 rounded-full">
                Added: ₹{booking.offlineTip}
              </div>
            )}
          </div>
          
          <div className="flex gap-2 mb-2">
            {[20, 40, 60].map((amt) => (
              <button
                key={amt}
                onClick={() => handleAddTip(amt)}
                disabled={isSubmittingTip}
                className="flex-1 py-1.5 border border-border rounded-lg text-xs font-bold text-text hover:bg-gray-50 hover:border-primary transition-colors disabled:opacity-50"
              >
                +₹{amt}
              </button>
            ))}
          </div>
          
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Custom ₹"
              value={offlineTip}
              onChange={(e) => setOfflineTip(e.target.value)}
              className="flex-1 min-w-0 bg-gray-50 border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              disabled={isSubmittingTip}
            />
            <button
              onClick={handleCustomTipSubmit}
              disabled={!offlineTip || isSubmittingTip || Number(offlineTip) <= 0}
              className="bg-primary text-text px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {isSubmittingTip ? '...' : 'Add'}
            </button>
          </div>
          {tipSuccess && <p className="text-success text-[10px] font-bold mt-1 text-center">Tip added successfully!</p>}
        </Card>

        <Button fullWidth variant="danger" onClick={() => navigate('/user/tracking/completed')}>
          View Trip Summary
        </Button>
      </div>
    </div>
  );
};

export default TripInProgressPage;
