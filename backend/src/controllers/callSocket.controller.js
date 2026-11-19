import crypto from 'crypto';
import Booking from '../models/booking.model.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import { C2S_EVENTS, S2C_EVENTS, SOCKET_ROOM_PREFIX } from '../constants/socketEvents.js';

/**
 * App-to-app (WebRTC) call signaling.
 *
 * Signals are routed to the other party's *personal* room (`user:{id}` /
 * `driver:{id}`), which every socket joins on connect, so a call rings no
 * matter which page the callee has open. Booking rooms are no longer involved.
 *
 * Every call has a client-generated `callId`. The server keeps a small
 * in-memory registry of live calls so it can:
 *   - check that both sockets belong to the booking,
 *   - reject a second call to someone already on a call (busy),
 *   - end a call that rings too long (no_answer),
 *   - hand the offer to a callee who opens the app from the push
 *     notification after the offer was sent (CALL_FETCH_PENDING),
 *   - stop the callee's other devices ringing once one of them answers.
 *
 * The registry is per-process. If the backend ever runs more than one node
 * behind a load balancer, it must move to Redis along with a Socket.IO adapter.
 */

const RING_TIMEOUT_MS = 40_000;
/** Max lifetime of an answered call in the registry (safety net only). */
const ACTIVE_CALL_MAX_MS = 4 * 60 * 60 * 1000;
/** How long a party may be fully offline before their call is torn down. */
const DISCONNECT_GRACE_MS = 15_000;
/** Caller ICE candidates kept for a callee who fetches the call late. */
const MAX_BUFFERED_CANDIDATES = 60;
const CALL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** callId → call record */
const calls = new Map();
/** "type:id" → callId, for busy detection */
const partyCalls = new Map();

const partyKey = (p) => `${p.type}:${p.id}`;
const roomFor = (p) =>
  `${p.type === 'driver' ? SOCKET_ROOM_PREFIX.DRIVER : SOCKET_ROOM_PREFIX.USER}:${p.id}`;

/**
 * Who is on the other end of this booking for the given principal.
 * Returns null when the principal is not a party to the booking.
 */
async function resolveBookingParties(bookingId, principal) {
  if (!bookingId || typeof bookingId !== 'string' || !/^[a-f0-9]{24}$/i.test(bookingId)) {
    return null;
  }
  const booking = await Booking.findById(bookingId).select('userId driverId').lean();
  if (!booking || !booking.userId || !booking.driverId) return null;
  const userId = String(booking.userId);
  const driverId = String(booking.driverId);

  if (principal.type === 'user' && principal.id === userId) {
    return { peer: { type: 'driver', id: driverId } };
  }
  if (principal.type === 'driver' && principal.id === driverId) {
    return { peer: { type: 'user', id: userId } };
  }
  return null;
}

/** Whether a principal may join `booking:{id}` (a party to it, or staff). */
export async function canAccessBooking(bookingId, principal) {
  if (principal.type === 'user' && STAFF_ROLES.includes(principal.role)) return true;
  if (!/^[a-f0-9]{24}$/i.test(String(bookingId || ''))) return false;
  // No driver needed here: the customer watches the room while still searching.
  const booking = await Booking.findById(bookingId).select('userId driverId').lean();
  if (!booking) return false;
  if (principal.type === 'user') return String(booking.userId) === principal.id;
  if (principal.type === 'driver') return Boolean(booking.driverId) && String(booking.driverId) === principal.id;
  return false;
}

function callerInfo(principal) {
  const e = principal.entity || {};
  return {
    type: principal.type,
    name: e.name || (principal.type === 'driver' ? 'Driver' : 'Customer'),
    photo: e.profilePicture || null,
  };
}

function removeCall(callId) {
  const call = calls.get(callId);
  if (!call) return null;
  clearTimeout(call.timer);
  calls.delete(callId);
  if (partyCalls.get(partyKey(call.caller)) === callId) partyCalls.delete(partyKey(call.caller));
  if (partyCalls.get(partyKey(call.callee)) === callId) partyCalls.delete(partyKey(call.callee));
  return call;
}

/** End a call and tell both sides (every device). */
function endCall(nsp, callId, reason, { except } = {}) {
  const call = removeCall(callId);
  if (!call) return;
  const payload = { callId, bookingId: call.bookingId, reason };
  let target = nsp.to(roomFor(call.caller)).to(roomFor(call.callee));
  if (except) target = target.except(except);
  target.emit(S2C_EVENTS.CALL_ENDED, payload);
}

/** The other party of a call relative to `principal`, or null if not a party. */
function otherParty(call, principal) {
  const key = partyKey(principal);
  if (key === partyKey(call.caller)) return call.callee;
  if (key === partyKey(call.callee)) return call.caller;
  return null;
}

function ack(fn, value) {
  if (typeof fn === 'function') fn(value);
}

/* ------------------------------------------------------------------ */
/* ICE servers                                                         */
/* ------------------------------------------------------------------ */

/**
 * STUN is always included. TURN is added from env, in one of two modes:
 *   - coturn REST auth: TURN_URLS + TURN_SECRET → short-lived credentials
 *   - static creds:     TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL
 * TURN_URLS is comma-separated, e.g.
 *   "turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp"
 */
export function buildIceServers(principal) {
  const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const iceServers = [{ urls: stunUrls }];

  const turnUrls = (process.env.TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!turnUrls.length) return iceServers;

  if (process.env.TURN_SECRET) {
    const ttl = Number(process.env.TURN_TTL_SECONDS) || 6 * 60 * 60;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${principal.type}-${principal.id}`;
    const credential = crypto
      .createHmac('sha1', process.env.TURN_SECRET)
      .update(username)
      .digest('base64');
    iceServers.push({ urls: turnUrls, username, credential });
  } else if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return iceServers;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

async function handleOffer(socket, payload, cb) {
  const { principal } = socket.data;
  const nsp = socket.nsp;
  const { bookingId, callId, offer } = payload;

  if (!CALL_ID_RE.test(String(callId || '')) || !offer?.sdp) {
    return ack(cb, { ok: false, error: 'invalid' });
  }
  if (calls.has(callId)) return ack(cb, { ok: false, error: 'invalid' });

  const parties = await resolveBookingParties(bookingId, principal);
  if (!parties) return ack(cb, { ok: false, error: 'forbidden' });
  const caller = { type: principal.type, id: principal.id };
  const callee = parties.peer;

  // A stale call of the caller's own (e.g. tab reload mid-ring) is replaced.
  const ownExisting = partyCalls.get(partyKey(caller));
  if (ownExisting) endCall(nsp, ownExisting, 'ended');
  if (partyCalls.has(partyKey(callee))) return ack(cb, { ok: false, error: 'busy' });

  const call = {
    callId,
    bookingId,
    caller,
    callee,
    callerInfo: callerInfo(principal),
    offer,
    callerCandidates: [],
    state: 'ringing',
    createdAt: Date.now(),
    timer: setTimeout(() => endCall(nsp, callId, 'no_answer'), RING_TIMEOUT_MS),
  };
  calls.set(callId, call);
  partyCalls.set(partyKey(caller), callId);
  partyCalls.set(partyKey(callee), callId);

  const calleeSockets = await nsp.in(roomFor(callee)).fetchSockets();
  // The call may have been cancelled while we awaited.
  if (!calls.has(callId)) return ack(cb, { ok: false, error: 'ended' });

  nsp.to(roomFor(callee)).emit(S2C_EVENTS.CALL_SIGNAL, {
    type: 'offer',
    callId,
    bookingId,
    offer,
    caller: call.callerInfo,
  });

  ack(cb, { ok: true, calleeOnline: calleeSockets.length > 0 });

  // Push wakes a callee whose app is backgrounded or closed. Opening it
  // reconnects the socket, and the client picks the call up via
  // CALL_FETCH_PENDING.
  try {
    const { sendPushToRecipient } = await import('../utils/socketEmitters.js');
    const url = callee.type === 'driver'
      ? `/driver/trip/${bookingId}`
      : `/user/book/assigned/${bookingId}`;
    await sendPushToRecipient(
      { model: callee.type === 'driver' ? 'Driver' : 'User', id: callee.id },
      {
        title: 'Incoming Call',
        body: `${call.callerInfo.name} is calling you`,
        data: { bookingId, callId, type: 'INCOMING_CALL', url },
      },
    );
  } catch (e) {
    console.error('[call] failed to send call push notification', e);
  }
}

function handleAnswer(socket, payload, cb) {
  const { principal } = socket.data;
  const call = calls.get(payload.callId);
  if (!call || partyKey(principal) !== partyKey(call.callee) || call.state !== 'ringing') {
    return ack(cb, { ok: false, error: 'ended' });
  }
  if (!payload.answer?.sdp) return ack(cb, { ok: false, error: 'invalid' });

  call.state = 'active';
  call.offer = null;
  call.callerCandidates = [];
  clearTimeout(call.timer);
  call.timer = setTimeout(() => endCall(socket.nsp, call.callId, 'ended'), ACTIVE_CALL_MAX_MS);

  socket.nsp.to(roomFor(call.caller)).emit(S2C_EVENTS.CALL_SIGNAL, {
    type: 'answer',
    callId: call.callId,
    bookingId: call.bookingId,
    answer: payload.answer,
  });
  // Stop the callee's other devices ringing.
  socket.nsp.to(roomFor(call.callee)).except(socket.id).emit(S2C_EVENTS.CALL_ENDED, {
    callId: call.callId,
    bookingId: call.bookingId,
    reason: 'answered_elsewhere',
  });
  ack(cb, { ok: true });
}

function handleCandidate(socket, payload) {
  const { principal } = socket.data;
  const call = calls.get(payload.callId);
  if (!call || !payload.candidate) return;
  const target = otherParty(call, principal);
  if (!target) return;

  if (call.state === 'ringing' && partyKey(principal) === partyKey(call.caller)
    && call.callerCandidates.length < MAX_BUFFERED_CANDIDATES) {
    call.callerCandidates.push(payload.candidate);
  }
  socket.nsp.to(roomFor(target)).emit(S2C_EVENTS.CALL_SIGNAL, {
    type: 'candidate',
    callId: call.callId,
    bookingId: call.bookingId,
    candidate: payload.candidate,
  });
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export function attachCallSocketHandlers(socket) {
  const { principal } = socket.data;
  if (principal.type !== 'user' && principal.type !== 'driver') return;

  socket.on(C2S_EVENTS.CALL_ICE_SERVERS, (_payload, cb) => {
    ack(typeof _payload === 'function' ? _payload : cb, { iceServers: buildIceServers(principal) });
  });

  socket.on(C2S_EVENTS.CALL_FETCH_PENDING, (_payload, cb) => {
    const reply = typeof _payload === 'function' ? _payload : cb;
    const callId = partyCalls.get(partyKey(principal));
    const call = callId && calls.get(callId);
    if (!call || call.state !== 'ringing' || partyKey(call.callee) !== partyKey(principal)) {
      return ack(reply, { call: null });
    }
    ack(reply, {
      call: {
        callId: call.callId,
        bookingId: call.bookingId,
        offer: call.offer,
        caller: call.callerInfo,
        candidates: call.callerCandidates,
      },
    });
  });

  socket.on(C2S_EVENTS.CALL_SIGNAL, async (payload, cb) => {
    try {
      if (!payload || typeof payload !== 'object') return ack(cb, { ok: false, error: 'invalid' });
      if (payload.type === 'offer') return await handleOffer(socket, payload, cb);
      if (payload.type === 'answer') return handleAnswer(socket, payload, cb);
      if (payload.type === 'candidate') return handleCandidate(socket, payload);
      return ack(cb, { ok: false, error: 'invalid' });
    } catch (err) {
      console.error('[call] signal handler error:', err);
      ack(cb, { ok: false, error: 'server' });
    }
  });

  socket.on(C2S_EVENTS.CALL_REJECT, (payload = {}) => {
    const call = calls.get(payload?.callId);
    if (!call || partyKey(call.callee) !== partyKey(principal)) return;
    removeCall(call.callId);
    const out = { callId: call.callId, bookingId: call.bookingId, reason: payload.reason === 'busy' ? 'busy' : 'rejected' };
    socket.nsp.to(roomFor(call.caller)).emit(S2C_EVENTS.CALL_REJECTED, out);
    // Other devices of the callee stop ringing too.
    socket.nsp.to(roomFor(call.callee)).except(socket.id).emit(S2C_EVENTS.CALL_ENDED, { ...out, reason: 'rejected_elsewhere' });
  });

  socket.on(C2S_EVENTS.CALL_END, (payload = {}) => {
    const call = calls.get(payload?.callId);
    if (!call || !otherParty(call, principal)) return;
    const reason = call.state === 'ringing' && partyKey(call.caller) === partyKey(principal)
      ? 'cancelled'
      : payload.reason === 'failed' ? 'failed' : 'ended';
    endCall(socket.nsp, call.callId, reason, { except: socket.id });
  });

  // If this party goes fully offline (no socket left) for longer than the
  // grace period, end their call so the other side isn't left hanging.
  socket.on('disconnect', () => {
    const callId = partyCalls.get(partyKey(principal));
    if (!callId) return;
    setTimeout(async () => {
      const call = calls.get(callId);
      if (!call) return;
      // A ringing callee going offline is expected (app backgrounded) — the
      // push brings them back. Only the caller vanishing ends a ringing call.
      if (call.state === 'ringing' && partyKey(call.caller) !== partyKey(principal)) return;
      const remaining = await socket.nsp.in(roomFor(principal)).fetchSockets();
      if (remaining.length === 0) endCall(socket.nsp, callId, 'peer_disconnected');
    }, DISCONNECT_GRACE_MS);
  });
}
