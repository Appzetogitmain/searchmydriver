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

  httpServer.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Server bootstrap failed:', err);
  process.exit(1);
});
