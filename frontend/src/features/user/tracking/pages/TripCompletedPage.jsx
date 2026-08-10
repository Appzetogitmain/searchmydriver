import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Clock, MapPin } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { formatDistance, haversineMeters } from '../../../../utils/geo';
import api from '../../../../utils/api';

/**
 * Post-ride summary screen — pulls the real fare, distance, and duration
 * out of `useUserActiveBookingStore` or URL/REST hydration so the figures match
 * exactly what the backend computed (including any accepted extensions).
 */
const TripCompletedPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlBookingId = searchParams.get('bookingId') || searchParams.get('id');

  const storeBooking = useUserActiveBookingStore((s) => s.booking);
  const fetchById = useUserActiveBookingStore((s) => s.fetchById);
  const setBooking = useUserActiveBookingStore((s) => s.setBooking);

  const [fetchedBooking, setFetchedBooking] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadBooking() {
      // 1. If URL has a specific bookingId, load it via fetchById
      if (urlBookingId) {
        try {
          setLoading(true);
          const b = await fetchById(urlBookingId);
          if (active && b) setFetchedBooking(b);
        } catch {
          // ignore
        } finally {
          if (active) setLoading(false);
        }
        return;
      }

      // 2. If store already has a booking, use it
      if (storeBooking) {
        setFetchedBooking(storeBooking);
        return;
      }

      // 3. Fallback on hard refresh: fetch user's latest booking from REST list
      try {
        setLoading(true);
        const res = await api.get('/auth/bookings');
        const list = res?.data?.data?.bookings || [];
        if (list.length > 0 && active) {
          const latest = [...list].sort(
            (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
          )[0];
          setFetchedBooking(latest);
          setBooking(latest);
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBooking();

    return () => {
      active = false;
    };
  }, [urlBookingId, storeBooking, fetchById, setBooking]);

  const booking = fetchedBooking || storeBooking;

  const totalFare = useMemo(() => {
    if (!booking) return null;
    const base =
      booking.effectiveTotal ??
      booking.fareSnapshot?.total ??
      booking.totalFare ??
      booking.payment?.amountPaidRupees ??
      0;
    const extensions = (booking.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
      0,
    );
    const sum = Number(base) + Number(extensions);
    return sum > 0 ? sum : (booking.fareSnapshot?.total || null);
  }, [booking]);

  const durationMinutes = useMemo(() => {
    if (!booking) return null;
    const started = booking.timeline?.startedAt;
    const completed = booking.timeline?.completedAt || booking.timeline?.cancelledAt || booking.updatedAt;
    if (started && completed) {
      const diffMs = new Date(completed).getTime() - new Date(started).getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) {
        return Math.max(1, Math.round(diffMs / 60_000));
      }
    }
    // Fallback to booked duration
    if (booking.hourly?.durationHours) {
      return Math.round(booking.hourly.durationHours * 60);
    }
    if (booking.outstation?.days) {
      return Math.round(booking.outstation.days * 24 * 60);
    }
    return null;
  }, [booking]);

  const distanceMeters = useMemo(() => {
    if (!booking) return null;
    const dist =
      booking.distanceMeters ??
      booking.fareSnapshot?.distanceMeters ??
      booking.fareSnapshot?.breakdown?.distanceMeters ??
      booking.tripSummary?.distanceMeters ??
      (booking.outstation?.estimatedKm ? booking.outstation.estimatedKm * 1000 : null);

    if (dist != null && Number.isFinite(Number(dist))) {
      return Number(dist);
    }

    // Compute haversine straight-line distance if pickup and dropoff coordinates exist
    const pCoords = booking.pickup?.location?.coordinates;
    const dCoords = booking.dropoff?.location?.coordinates;
    if (Array.isArray(pCoords) && pCoords.length >= 2 && Array.isArray(dCoords) && dCoords.length >= 2) {
      const p = { lat: pCoords[1], lng: pCoords[0] };
      const d = { lat: dCoords[1], lng: dCoords[0] };
      const computed = haversineMeters(p, d);
      if (Number.isFinite(computed) && computed > 0) {
        return computed;
      }
    }
    return null;
  }, [booking]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh px-6">
      <div className="animate-bounce-in mb-6">
        <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-success" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-text mb-1 animate-fade-in-up">Trip Completed</h1>
      <p className="text-sm text-text-muted mb-6 animate-fade-in-up">
        Thank you for riding with us!
      </p>

      <Card className="w-full animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="text-center mb-4">
          <p className="text-sm text-text-muted">Total Fare</p>
          <p className="text-3xl font-bold text-text">
            {loading && !booking ? '...' : totalFare != null ? `₹${totalFare}` : '—'}
          </p>
          {booking?.bookingNumber ? (
            <p className="text-[11px] text-text-muted mt-1 font-mono">
              {booking.bookingNumber}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-bg rounded-xl">
            <Clock className="w-5 h-5 text-text-muted mx-auto mb-1" />
            <p className="text-sm font-bold">
              {loading && !booking ? '...' : durationMinutes != null ? `${durationMinutes} min` : '—'}
            </p>
            <p className="text-[10px] text-text-muted">Duration</p>
          </div>
          <div className="text-center p-3 bg-bg rounded-xl">
            <MapPin className="w-5 h-5 text-text-muted mx-auto mb-1" />
            <p className="text-sm font-bold">
              {loading && !booking ? '...' : distanceMeters != null ? formatDistance(distanceMeters) : '—'}
            </p>
            <p className="text-[10px] text-text-muted">Distance</p>
          </div>
        </div>
      </Card>

      <div className="w-full mt-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
        <Button
          fullWidth
          onClick={() =>
            navigate(
              booking?._id
                ? `/user/tracking/rate?bookingId=${booking._id}`
                : '/user/tracking/rate',
            )
          }
        >
          Rate & Pay
        </Button>
      </div>
    </div>
  );
};

export default TripCompletedPage;
