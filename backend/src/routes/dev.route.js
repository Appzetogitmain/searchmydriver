/**
 * DEV-ONLY test routes for scheduled ride end-to-end testing.
 *
 * Mounted at /api/v1/dev — only available when NODE_ENV !== 'production'.
 * These routes bypass auth and let you manually trigger any phase of the
 * scheduled booking lifecycle without waiting for real timers to fire.
 *
 * ⚠️  NEVER expose these routes in production. The guard at the top of
 *     app.js enforces this, but double-check before any deployment.
 *
 * ---
 * Available endpoints:
 *
 *   GET  /api/v1/dev/bookings/:id/inspect
 *        → Full booking snapshot with scheduled metadata + queue jobs
 *
 *   POST /api/v1/dev/bookings/:id/trigger-assign
 *        → Runs kickoffScheduledAssignment — flips PENDING_ASSIGNMENT → SEARCHING
 *          and starts the wave dispatcher immediately (simulates BullMQ assign job)
 *
 *   POST /api/v1/dev/bookings/:id/trigger-escalate
 *        → Runs escalateToEmergencyPool — moves booking to IN_EMERGENCY_POOL
 *          (simulates BullMQ escalate job)
 *
 *   POST /api/v1/dev/bookings/:id/trigger-remind
 *        Body: { minutesAhead: 60 }
 *        → Fires the reminder socket event to the user / driver
 *
 *   POST /api/v1/dev/bookings/:id/force-status
 *        Body: { status: "searching" }
 *        → Directly sets the booking status in the DB (escape hatch)
 *
 *   POST /api/v1/dev/bookings/:id/force-dispatch
 *        → Immediately triggers dispatchNextDriverService (starts wave search)
 *          even if booking is not in SEARCHING status (forces it first)
 *
 *   GET  /api/v1/dev/drivers/available
 *        Query: ?lat=...&lng=...&radius=2000
 *        → Lists online, idle, approved drivers near a coordinate for verification
 *
 *   GET  /api/v1/dev/queue/jobs
 *        → Lists pending BullMQ scheduled-booking jobs (requires Redis)
 *
 *   GET  /api/v1/dev/dispatch/diagnose?bookingId=...
 *        → Per-driver breakdown of exactly which dispatch filter excluded
 *          them, plus whether each driver has a live socket to receive on.
 *          Answers "why didn't the driver's phone ring?" in one call.
 */

import express from 'express';
import Booking from '../models/booking.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { kickoffScheduledAssignment, sendScheduledReminder } from '../services/bookingScheduled.service.js';
import { dispatchNextDriverService } from '../services/bookingDispatch.service.js';
import { BOOKING_STATUS, BOOKING_STATUS_LIST } from '../constants/bookingStatus.js';

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Guard — never run in production                                     */
/* ------------------------------------------------------------------ */
router.use((_req, _res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next(new ApiError(403, 'Dev routes are disabled in production'));
  }
  next();
});

/* ------------------------------------------------------------------ */
/* GET /bookings/:id/inspect                                           */
/* ------------------------------------------------------------------ */
router.get(
  '/bookings/:id/inspect',
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone_no isOnline isOnTrip')
      .lean();

    if (!booking) throw new ApiError(404, 'Booking not found');

    // Summarise the dispatch wave history for easy reading
    const dispatchSummary = (booking.dispatch?.offers || []).map((o) => ({
      driverId: String(o.driverId),
      offeredAt: o.offeredAt,
      response: o.response,
      respondedAt: o.respondedAt,
    }));

    const info = {
      _id: String(booking._id),
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      serviceType: booking.serviceType,
      bookingType: booking.bookingType,
      pickupAddress: booking.pickup?.address,
      scheduledStartAt: booking.hourly?.scheduledStartAt || null,
      durationHours: booking.hourly?.durationHours || null,
      fareTotal: booking.fareSnapshot?.total || null,
      paymentStatus: booking.paymentStatus,
      scheduled: booking.scheduled || null,
      dispatch: {
        attemptsCount: booking.dispatch?.attemptsCount || 0,
        maxAttempts: booking.dispatch?.maxAttempts || null,
        currentRadiusMeters: booking.dispatch?.currentRadiusMeters || null,
        pendingOfferIds: (booking.dispatch?.pendingOfferIds || []).map(String),
        currentExpiresAt: booking.dispatch?.currentExpiresAt || null,
        offersHistory: dispatchSummary,
      },
      timeline: booking.timeline || null,
      user: booking.userId || null,
      driver: booking.driverId || null,
    };

    res.json(new ApiResponse(200, info, 'Booking inspection'));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/trigger-assign                                   */
/* Simulates the BullMQ "assign" job firing.                          */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/trigger-assign',
  asyncHandler(async (req, res) => {
    const result = await kickoffScheduledAssignment(req.params.id);
    res.json(new ApiResponse(200, result, 'Assign job triggered'));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/trigger-escalate                                 */
/* Simulates the BullMQ "escalate" job firing.                        */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/trigger-escalate',
  asyncHandler(async (req, res) => {
    const { escalateToEmergencyPool } = await import('../services/bookingEmergencyPool.service.js');
    const result = await escalateToEmergencyPool(req.params.id);
    res.json(new ApiResponse(200, result, 'Escalate job triggered'));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/trigger-remind                                   */
/* Body: { minutesAhead: 60 }                                         */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/trigger-remind',
  asyncHandler(async (req, res) => {
    const minutesAhead = Number(req.body?.minutesAhead) || 15;
    const result = await sendScheduledReminder(req.params.id, minutesAhead);
    res.json(new ApiResponse(200, result, `Reminder fired (${minutesAhead}m ahead)`));
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/force-status                                     */
/* Body: { status: "searching" }   ← any valid BOOKING_STATUS value  */
/* Use as an escape hatch to put a booking into any state.            */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/force-status',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!status || !BOOKING_STATUS_LIST.includes(status)) {
      throw new ApiError(
        400,
        `Invalid status. Must be one of: ${BOOKING_STATUS_LIST.join(', ')}`,
      );
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const previousStatus = booking.status;
    booking.status = status;
    await booking.save();

    res.json(
      new ApiResponse(
        200,
        { previousStatus, newStatus: status },
        `Status forced to "${status}"`,
      ),
    );
  }),
);

/* ------------------------------------------------------------------ */
/* POST /bookings/:id/force-dispatch                                   */
/* Forces the booking into SEARCHING then immediately runs a          */
/* dispatch wave — useful to test driver offer flow without needing   */
/* the booking to be in the right state.                              */
/* ------------------------------------------------------------------ */
router.post(
  '/bookings/:id/force-dispatch',
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.status !== BOOKING_STATUS.SEARCHING) {
      booking.status = BOOKING_STATUS.SEARCHING;
      await booking.save();
    }

    const result = await dispatchNextDriverService(req.params.id);
    res.json(new ApiResponse(200, result, 'Dispatch wave triggered'));
  }),
);

/* ------------------------------------------------------------------ */
/* GET /drivers/available                                              */
/* Query: ?lat=...&lng=...&radius=2000                                */
/* Lists online idle approved drivers — verify drivers exist before   */
/* running dispatch tests.                                            */
/* ------------------------------------------------------------------ */
router.get(
  '/drivers/available',
  asyncHandler(async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 5000;

    let filter = {
      approvalStatus: 'approved',
      isDeleted: { $ne: true },
      isOnTrip: false,
      isOnline: true,
    };

    // Geo filter if coordinates provided
    if (!isNaN(lat) && !isNaN(lng)) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius,
        },
      };
    }

    const drivers = await Driver.find(filter)
      .select('name phone_no rating isOnline isOnTrip location lastLocationAt approvalStatus')
      .limit(50)
      .lean();

    res.json(
      new ApiResponse(
        200,
        { count: drivers.length, drivers },
        `${drivers.length} available driver(s)${!isNaN(lat) ? ` within ${radius}m` : ''}`,
      ),
    );
  }),
);

/* ------------------------------------------------------------------ */
/* GET /queue/jobs                                                     */
/* Lists pending BullMQ jobs for the scheduled-booking queue.         */
/* ------------------------------------------------------------------ */
router.get(
  '/queue/jobs',
  asyncHandler(async (req, res) => {
    let jobs = [];
    let queueInfo = null;

    try {
      const { getScheduledBookingQueue } = await import('../queues/scheduledBooking.queue.js');
      const queue = await getScheduledBookingQueue();
      if (queue) {
        const [waiting, delayed, active, completed, failed] = await Promise.all([
          queue.getWaiting(0, 50),
          queue.getDelayed(0, 50),
          queue.getActive(0, 50),
          queue.getCompleted(0, 20),
          queue.getFailed(0, 20),
        ]);
        queueInfo = {
          waiting: waiting.map((j) => ({ id: j.id, name: j.name, data: j.data, delay: j.delay })),
          delayed: delayed.map((j) => ({
            id: j.id,
            name: j.name,
            data: j.data,
            processesAt: j.processedOn ? new Date(j.processedOn) : null,
            delay: j.delay,
          })),
          active: active.map((j) => ({ id: j.id, name: j.name, data: j.data })),
          completedCount: completed.length,
          failedCount: failed.length,
          failed: failed.map((j) => ({
            id: j.id,
            name: j.name,
            data: j.data,
            failedReason: j.failedReason,
          })),
        };
      } else {
        queueInfo = { error: 'Queue not initialized — Redis may not be configured' };
      }
    } catch (err) {
      queueInfo = { error: `Could not access queue: ${err.message}` };
    }

    res.json(new ApiResponse(200, queueInfo, 'Queue jobs'));
  }),
);

/* ------------------------------------------------------------------ */
/* GET /sockets                                                        */
/* Lists all active Socket.IO connections and their rooms.             */
/* ------------------------------------------------------------------ */
router.get(
  '/sockets',
  asyncHandler(async (req, res) => {
    const { getIoOrNull } = await import('../config/socket.js');
    const io = getIoOrNull();
    const sockets = [];
    if (io) {
      for (const [id, socket] of io.sockets.sockets.entries()) {
        sockets.push({
          socketId: id,
          principal: socket.data?.principal || null,
          rooms: Array.from(socket.rooms),
          connected: socket.connected,
        });
      }
    }
    res.json(new ApiResponse(200, sockets, 'Connected sockets list'));
  }),
);

/* ------------------------------------------------------------------ */
/* GET /dispatch/diagnose?bookingId=...                                */
/* Why didn't the driver's phone ring? Replays every clause of the     */
/* dispatcher's eligibility query one driver at a time and names the   */
/* ones that actually excluded them — then checks whether the driver   */
/* even has a live socket in `driver:{id}` to receive the offer on.    */
/*                                                                     */
/* A driver can be perfectly eligible and still see nothing if their   */
/* app isn't connected, so both halves are reported side by side.      */
/* ------------------------------------------------------------------ */
router.get(
  '/dispatch/diagnose',
  asyncHandler(async (req, res) => {
    const { bookingId } = req.query;
    if (!bookingId) throw new ApiError(400, 'bookingId query param is required');

    const booking = await Booking.findById(bookingId).lean();
    if (!booking) throw new ApiError(404, 'Booking not found');

    const [{ default: Car }, { SERVICE_TYPES }, { resolveOutstationWalletFloorService }] =
      await Promise.all([
        import('../models/user/car.model.js'),
        import('../constants/serviceTypes.js'),
        import('../services/platform.service.js'),
      ]);
    await import('../models/carType.model.js');

    const car = booking.carId
      ? await Car.findById(booking.carId).populate('carTypeId', 'name').lean()
      : null;
    const requiredCarTypeId = car?.carTypeId?._id ? String(car.carTypeId._id) : null;

    // Mirror the dispatcher's own rule set exactly — see
    // `dispatchNextDriverService` / `findAllEligibleOnlineDrivers`.
    const isCash = booking.paymentMethod === 'cash';
    const allowsOnTrip = booking.serviceType === SERVICE_TYPES.MONTHLY;
    const minWalletBalance =
      booking.serviceType === SERVICE_TYPES.OUTSTATION
        ? await resolveOutstationWalletFloorService()
        : null;

    const rejectedIds = new Set(
      (booking.dispatch?.offers || [])
        .filter((o) => o.response === 'rejected')
        .map((o) => String(o.driverId)),
    );

    // Live socket rooms, so "eligible but unreachable" is distinguishable
    // from "never selected in the first place".
    const { getIoOrNull } = await import('../config/socket.js');
    const io = getIoOrNull();
    const connectedDriverIds = new Set();
    if (io) {
      for (const socket of io.sockets.sockets.values()) {
        const p = socket.data?.principal;
        if (p?.type === 'driver') connectedDriverIds.add(String(p.id));
      }
    }

    const drivers = await Driver.find({ isDeleted: { $ne: true } })
      .select('name isOnline isOnTrip approvalStatus carTypeExperience wallet.balance location')
      .populate('carTypeExperience', 'name')
      .lean();

    const report = drivers.map((d) => {
      const id = String(d._id);
      const balance = d.wallet?.balance ?? 0;
      const blockedBy = [];

      if (!d.isOnline) blockedBy.push('isOnline: driver is offline');
      if (d.approvalStatus !== 'approved') {
        blockedBy.push(`approvalStatus: "${d.approvalStatus}" (needs "approved")`);
      }
      if (d.isOnTrip && !allowsOnTrip) blockedBy.push('isOnTrip: already on a trip');
      if (requiredCarTypeId) {
        const has = (d.carTypeExperience || []).some(
          (t) => String(t?._id ?? t) === requiredCarTypeId,
        );
        if (!has) {
          blockedBy.push(
            `carTypeExperience: missing "${car.carTypeId.name}" ` +
              `(driver has: ${(d.carTypeExperience || []).map((t) => t?.name).filter(Boolean).join(', ') || 'none'})`,
          );
        }
      }
      if (isCash && minWalletBalance === null && balance < 0) {
        blockedBy.push(`wallet.balance: ${balance} is negative (cash booking requires >= 0)`);
      }
      if (minWalletBalance !== null && balance < minWalletBalance) {
        blockedBy.push(
          `wallet.balance: ${balance} is below the outstation floor of ${minWalletBalance}`,
        );
      }
      if (rejectedIds.has(id)) blockedBy.push('dispatch: driver already rejected this booking');

      const eligible = blockedBy.length === 0;
      return {
        driverId: id,
        name: d.name,
        eligible,
        blockedBy,
        socketConnected: connectedDriverIds.has(id),
        // The case that looks like a backend bug but isn't: the offer was
        // emitted into `driver:{id}` with nobody listening in that room.
        wouldReceiveOffer: eligible && connectedDriverIds.has(id),
      };
    });

    const eligible = report.filter((r) => r.eligible);
    res.json(
      new ApiResponse(
        200,
        {
          booking: {
            bookingNumber: booking.bookingNumber,
            status: booking.status,
            serviceType: booking.serviceType,
            bookingType: booking.bookingType,
            paymentMethod: booking.paymentMethod,
            requiredCarType: car?.carTypeId?.name || null,
            pickupCoordinates: booking.pickup?.location?.coordinates || null,
            dispatchAttempts: booking.dispatch?.attemptsCount || 0,
            pendingOfferIds: (booking.dispatch?.pendingOfferIds || []).map(String),
          },
          rulesApplied: {
            requiresCarType: car?.carTypeId?.name || null,
            requiresNonNegativeWallet: isCash && minWalletBalance === null,
            outstationWalletFloor: minWalletBalance,
            allowsDriversOnTrip: allowsOnTrip,
          },
          summary: {
            totalDrivers: report.length,
            eligible: eligible.length,
            eligibleAndConnected: report.filter((r) => r.wouldReceiveOffer).length,
          },
          drivers: report,
        },
        'Dispatch eligibility diagnosis',
      ),
    );
  }),
);

export default router;
