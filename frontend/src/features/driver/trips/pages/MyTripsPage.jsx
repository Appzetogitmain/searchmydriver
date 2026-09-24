import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Inbox, RefreshCw, Car, Sparkles } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { mergeLiveBookingIntoList } from '../../../../utils/mergeLiveBooking';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverTripsListStore } from '../../../../store/driver/useDriverTripsStore';
import {
  useDriverEligibleRequestsQueryStore,
  useDriverTripRequestsStore,
} from '../../../../store/driver/useDriverTripRequestsStore';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../../constants/socketEvents';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUS,
} from '../../../../constants/bookingStatus';
import DriverScreenShell from '../../components/DriverScreenShell';
import DriverTripCard from '../components/DriverTripCard';
import DriverTripRequestCard from '../components/DriverTripRequestCard';
import api from '../../../../utils/api';

const MAIN_TABS = [
  { id: 'requests', label: 'Trip Requests' },
  { id: 'all', label: 'All Trips' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const REQUEST_SUB_FILTERS = [
  { id: 'all', label: 'All Requests' },
  { id: 'incity', label: 'In-City' },
  { id: 'outstation', label: 'Outstation' },
  { id: 'current', label: 'Current' },
  { id: 'scheduled', label: 'Scheduled' },
];

const PAGE_LIMIT = 15;
const VALID_TABS = new Set(MAIN_TABS.map((t) => t.id));

const MyTripsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(() => {
    const initial = searchParams.get('tab');
    return initial && VALID_TABS.has(initial) ? initial : 'requests';
  });

  const [requestFilter, setRequestFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [acceptingId, setAcceptingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const liveTakenBookings = useDriverTripRequestsStore((s) => s.liveTakenBookings);
  const markBookingTaken = useDriverTripRequestsStore((s) => s.markBookingTaken);

  const handleTabChange = useCallback(
    (next) => {
      setTab(next);
      setPage(1);
      setActionError(null);
      const params = new URLSearchParams(searchParams);
      if (next === 'requests') params.delete('tab');
      else params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Trips History Query
  const tripsParams = useMemo(
    () => ({ tab, page, limit: PAGE_LIMIT }),
    [tab, page],
  );
  const tripsCacheKey = buildCacheKey('driver-trips-list', tripsParams);

  const {
    data: tripsData,
    loading: tripsLoading,
    error: tripsError,
    refetch: refetchTrips,
  } = useCachedQuery(useDriverTripsListStore, tripsCacheKey, tripsParams);

  // Eligible Trip Requests Query
  const requestsParams = useMemo(
    () => ({ category: requestFilter }),
    [requestFilter],
  );
  const requestsCacheKey = buildCacheKey('driver-eligible-requests', requestsParams);

  const {
    data: requestsData,
    loading: requestsLoading,
    error: requestsError,
    refetch: refetchRequests,
  } = useCachedQuery(
    useDriverEligibleRequestsQueryStore,
    requestsCacheKey,
    requestsParams,
  );

  // Active Trip store
  const activeBooking = useDriverActiveTripStore((s) => s.booking);
  const fetchActive = useDriverActiveTripStore((s) => s.fetchActive);
  const applyActiveUpdate = useDriverActiveTripStore((s) => s.applyUpdate);
  const setActiveBooking = useDriverActiveTripStore((s) => s.setBooking);
  const clearActiveBooking = useDriverActiveTripStore((s) => s.clear);

  useEffect(() => {
    fetchActive().catch(() => {});
    if (tab === 'requests') {
      refetchRequests?.().catch(() => {});
    } else {
      refetchTrips?.().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Socket updates
  const refetchTripsRef = useRef(refetchTrips);
  const refetchRequestsRef = useRef(refetchRequests);
  useEffect(() => {
    refetchTripsRef.current = refetchTrips;
    refetchRequestsRef.current = refetchRequests;
  }, [refetchTrips, refetchRequests]);

  useSocketEvent(
    S2C_EVENTS.BOOKING_UPDATED,
    useCallback(
      (payload) => {
        if (!payload) return;
        applyActiveUpdate(payload);
        if (
          payload.status === BOOKING_STATUS.COMPLETED ||
          payload.status === BOOKING_STATUS.CANCELLED ||
          payload.status === BOOKING_STATUS.NO_DRIVERS_FOUND
        ) {
          clearActiveBooking();
        } else if (
          payload.status === BOOKING_STATUS.DRIVER_ASSIGNED ||
          payload.status === BOOKING_STATUS.AWAITING_PAYMENT
        ) {
          if (payload.bookingId) {
            markBookingTaken(payload.bookingId);
          }
        }
        refetchTripsRef.current?.().catch(() => {});
        refetchRequestsRef.current?.().catch(() => {});
      },
      [applyActiveUpdate, clearActiveBooking, markBookingTaken],
    ),
  );

  useSocketEvent(
    S2C_EVENTS.BOOKING_OFFERED,
    useCallback(() => {
      refetchRequestsRef.current?.().catch(() => {});
    }, []),
  );

  useSocketEvent(
    S2C_EVENTS.BOOKING_OFFER_WITHDRAWN,
    useCallback(
      (payload) => {
        if (payload?.bookingId) {
          markBookingTaken(payload.bookingId);
        }
        refetchRequestsRef.current?.().catch(() => {});
      },
      [markBookingTaken],
    ),
  );

  // Accept Booking Action from Card
  const handleAcceptRequest = async (reqItem) => {
    if (!reqItem?.bookingId) return;
    setAcceptingId(reqItem.bookingId);
    setActionError(null);

    try {
      const res = await api.post(`/driver/bookings/${reqItem.bookingId}/accept`);
      const booking = res?.data?.data?.booking || res?.data?.data;
      
      // Invalidate queries
      useDriverEligibleRequestsQueryStore.getState().invalidate();
      useDriverTripsListStore.getState().invalidate();

      if (booking?._id || reqItem.bookingId) {
        const targetId = booking?._id || reqItem.bookingId;
        setActiveBooking(booking);
        navigate(`/driver/trip/${targetId}`);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not accept booking. It may have been claimed by another driver.';
      setActionError(msg);
      markBookingTaken(reqItem.bookingId);
      refetchRequestsRef.current?.().catch(() => {});
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDeclineRequest = (reqItem) => {
    // Optionally mark declined locally
  };

  const trips = tripsData?.data || [];
  const pagination = tripsData?.pagination || { total: 0, page: 1, pages: 1 };
  const visibleTrips = useMemo(
    () => mergeLiveBookingIntoList(activeBooking, trips),
    [activeBooking, trips],
  );

  // Map requests and inject live taken status
  const rawRequests = Array.isArray(requestsData) ? requestsData : [];
  const eligibleRequests = useMemo(() => {
    return rawRequests.map((item) => {
      const isLiveTaken = liveTakenBookings.has(String(item.bookingId));
      if (isLiveTaken) {
        return { ...item, isTaken: true, takenByOther: true, canAccept: false };
      }
      return item;
    });
  }, [rawRequests, liveTakenBookings]);

  // Request Counts for Filter Badges
  const filterCounts = useMemo(() => {
    const counts = { all: rawRequests.length, incity: 0, outstation: 0, current: 0, scheduled: 0 };
    rawRequests.forEach((r) => {
      if (r.serviceType === 'hourly') counts.incity += 1;
      if (r.serviceType === 'outstation') counts.outstation += 1;
      if (r.category === 'current' || (!r.isTaken && r.status === BOOKING_STATUS.SEARCHING)) counts.current += 1;
      if (r.bookingType === 'scheduled' || r.category === 'scheduled') counts.scheduled += 1;
    });
    return counts;
  }, [rawRequests]);

  const handleSelectHistoryTrip = (trip) => {
    if (!trip?._id) return;
    if (ACTIVE_BOOKING_STATUSES.includes(trip.status)) {
      setActiveBooking(trip);
    }
    navigate(`/driver/trip/${trip._id}`);
  };

  const isRequestsTab = tab === 'requests';
  const totalHistoryTrips = pagination.total || 0;

  return (
    <DriverScreenShell
      header={
        <header className="bg-dark px-4 pt-4 pb-4 rounded-b-3xl shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">
                {isRequestsTab ? 'Trip Requests' : 'My Trips'}
              </h1>
              {isRequestsTab && eligibleRequests.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500 text-white animate-pulse">
                  {eligibleRequests.length} Available
                </span>
              )}
            </div>

            {isRequestsTab && (
              <button
                type="button"
                onClick={() => refetchRequests()}
                disabled={requestsLoading}
                className="p-1.5 rounded-full bg-white/10 text-white/80 hover:bg-white/20 active:scale-95 transition disabled:opacity-40"
                title="Refresh requests"
              >
                <RefreshCw className={`w-4 h-4 ${requestsLoading ? 'animate-spin' : ''}`} />
              </button>
            )}

            {!isRequestsTab && totalHistoryTrips > 0 && (
              <span className="text-[11px] text-white/60">
                {totalHistoryTrips} trip{totalHistoryTrips === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* Main Tabs */}
          <TabBar tabs={MAIN_TABS} active={tab} onChange={handleTabChange} />

          {/* Sub-Filters Pill Bar (Only on Trip Requests Tab) */}
          {isRequestsTab && (
            <div className="flex gap-2 overflow-x-auto pt-3 pb-1 -mx-1 px-1 scrollbar-hide border-t border-white/10 mt-3">
              {REQUEST_SUB_FILTERS.map((f) => {
                const isActive = requestFilter === f.id;
                const count = filterCounts[f.id] || 0;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRequestFilter(f.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 shadow-sm font-bold'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    <span>{f.label}</span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isActive
                            ? 'bg-slate-900 text-amber-300 font-bold'
                            : 'bg-white/20 text-white'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </header>
      }
      bodyClassName="p-4 -mt-2 pb-8 space-y-3.5"
    >
      {/* Error message banner */}
      {actionError && (
        <Card className="border-l-4 border-l-danger bg-rose-50/90 animate-shake">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-900">Request Error</p>
              <p className="text-xs text-rose-700 mt-0.5">{actionError}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ─────────────────── REQUESTS TAB VIEW ─────────────────── */}
      {isRequestsTab ? (
        <>
          {requestsLoading && !requestsData && (
            <Card className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
              <p className="text-xs text-text-muted">Checking available trip requests in your area...</p>
            </Card>
          )}

          {requestsError && (
            <Card className="border-l-4 border-l-danger">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">Couldn't load trip requests</p>
                  <p className="text-xs text-text-muted mt-0.5">{requestsError}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => refetchRequests()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!requestsLoading && !requestsError && eligibleRequests.length === 0 && (
            <Card className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Car className="w-7 h-7 text-primary" />
              </div>
              <p className="text-base font-bold text-text">No Trip Requests Available</p>
              <p className="text-xs text-text-muted mt-1.5 max-w-[280px] leading-relaxed">
                When customers search for drivers for In-City, Outstation, or Scheduled trips in your area, they will appear here instantly.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetchRequests()}
              >
                Check for New Requests
              </Button>
            </Card>
          )}

          {eligibleRequests.map((reqItem, idx) => (
            <DriverTripRequestCard
              key={reqItem.bookingId || idx}
              request={reqItem}
              onAccept={handleAcceptRequest}
              onDecline={handleDeclineRequest}
              isAccepting={acceptingId === reqItem.bookingId}
              className="animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.04}s` }}
            />
          ))}
        </>
      ) : (
        /* ─────────────────── HISTORY TABS VIEW ─────────────────── */
        <>
          {tripsLoading && !tripsData && (
            <Card className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </Card>
          )}

          {tripsError && (
            <Card className="border-l-4 border-l-danger">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">Couldn't load trips</p>
                  <p className="text-xs text-text-muted mt-0.5">{tripsError}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => refetchTrips()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!tripsLoading && !tripsError && trips.length === 0 && (
            <Card className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Inbox className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-semibold text-text">No trips found</p>
              <p className="text-xs text-text-muted mt-1 max-w-[240px]">
                Trips you accept and complete will appear in this list with their full history.
              </p>
            </Card>
          )}

          {visibleTrips.map((trip, idx) => (
            <DriverTripCard
              key={trip._id}
              trip={trip}
              onClick={() => handleSelectHistoryTrip(trip)}
              className="animate-fade-in-up"
              style={{ animationDelay: `${idx * 0.04}s` }}
            />
          ))}

          {pagination.pages > 1 && (
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              onChange={setPage}
              disabled={tripsLoading}
            />
          )}
        </>
      )}
    </DriverScreenShell>
  );
};

/* ------------------------------------------------------------------ */
/* Tab bar + Pagination                                                */
/* ------------------------------------------------------------------ */

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              isActive
                ? 'bg-white text-text shadow-card'
                : 'bg-white/10 text-white/80 hover:bg-white/15'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Pagination({ page, pages, total, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between pt-1 pb-2 text-xs text-text-muted">
      <span>
        Page {page} of {pages} · {total} trip{total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default MyTripsPage;
