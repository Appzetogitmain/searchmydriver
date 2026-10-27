// MUST be the first import. ES module imports are hoisted and evaluated before
// any statement in this file's body, so a plain `dotenv.config()` call below
// would run *after* './app.js' — and everything app.js pulls in — has already
// been evaluated. Modules that read process.env at import time (rateLimiter.js)
// would see an empty environment and silently fall back to production defaults.
import 'dotenv/config';

import { createServer } from 'node:http';
import { connectDB } from './config/connectDB.js';
import { initSuperAdmin } from './utils/initAdmin.js';
import { initializeSocket } from './config/socket.js';
import { initializeFirebase } from './config/firebase.js';
import { startScheduledBookingWorker } from './queues/scheduledBooking.worker.js';
import { startLifecycleSweep } from './services/lifecycleSweep.service.js';
import { isRazorpayWebhookConfigured } from './utils/razorpay.js';
import app from './app.js';

const PORT = process.env.PORT || 9000;

async function bootstrap() {
  await connectDB();
  await initSuperAdmin();
  await initializeFirebase();

  const httpServer = createServer(app);
  initializeSocket(httpServer);

  // Scheduled-ride dispatcher + emergency-pool escalator. No-ops with
  // a warning when REDIS_URL is unset so dev/CI boots without Redis.
  await startScheduledBookingWorker();

  // Durable backstop for every in-process deadline timer (payment, search
  // cap, no-show, stuck driver locks) plus captured-payment reconciliation.
  // Must start after connectDB — the first pass queries immediately.
  startLifecycleSweep();

  // Without the webhook secret `verifyRazorpayWebhookSignature` fails closed,
  // so every Razorpay delivery is rejected with a 400 and payments are only
  // ever settled by the browser callback. The reconciler covers for this, but
  // it polls — webhook delivery is the fast path and should be configured.
  if (!isRazorpayWebhookConfigured()) {
    console.warn(
      '⚠️  RAZORPAY_WEBHOOK_SECRET is not set — all Razorpay webhooks will be ' +
        'rejected (400). Payments will only settle via the browser callback or ' +
        'the reconciliation sweep. Set it from the Razorpay dashboard webhook config.',
    );
  }

  // The reconciler moves real money, so it starts in dry-run unless told
  // otherwise. Make the active mode impossible to miss in the boot log.
  const reconcileMode = (process.env.PAYMENT_RECONCILIATION_MODE || 'dry_run').toLowerCase();
  if (reconcileMode === 'on') {
    console.log('💳 Payment reconciliation is ARMED — it will settle and refund automatically.');
  } else if (reconcileMode === 'off') {
    console.warn('⚠️  Payment reconciliation is OFF — captured-but-unsettled payments will not be recovered.');
  } else {
    console.warn(
      '🔍 Payment reconciliation is in DRY-RUN — it will report what it would ' +
        'settle/refund but change nothing. Set PAYMENT_RECONCILIATION_MODE=on to arm it.',
    );
  }

  httpServer.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Server bootstrap failed:', err);
  process.exit(1);
});
