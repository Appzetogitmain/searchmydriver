import express from 'express';
import notificationRouter from './notification.route.js';
import { getUserProfile } from '../controllers/user.controller.js';
import {
  loginAdmin,
  getStaffMe,
  getCustomers,
  getDrivers,
  getDriverById,
  updateDriverStatus,
  suspendDriver,
  unsuspendDriver,
  updateDriverDocument,
  deleteDriverDocument,
  suspendUser,
  unsuspendUser,
  toggleUserActive,
  deleteUser,
  deleteDriver,
  addAdminMember,
  getAdminTeam,
  updateAdminMember,
  deleteAdminMember,
  getIncomingRegistrations,
  getDriverWalletHistory,
  adjustDriverWallet,
  getUserWalletHistory,
  adjustUserWallet,
  getDashboardStats,
} from '../controllers/admin.controller.js';

import {
  sendBroadcast,
  getBroadcasts,
  getBroadcastStats,
  searchUsers,
  searchDrivers,
} from '../controllers/broadcast.controller.js';

import { protectStaff, restrictTo, requirePermission } from '../middlewares/authMiddleware.js';
import { ROUTE_ROLES, PERMISSIONS } from '../constants/staffPermissions.js';
import { getActiveServiceCities } from '../controllers/serviceCities.controller.js';
import {
  createCarType,
  updateCarType,
  deleteCarType,
  createCondition,
  updateCondition,
  deleteCondition,
  createTrainingVideo,
  getAdminCarTypes,
  getAdminConditions,
  getAdminTrainingVideos,
  updateTrainingVideo,
  deleteTrainingVideo,
  getPlatformSettings,
  updatePlatformSettings,
} from '../controllers/platform.controller.js';
import {
  getAdminFuelTypes,
  createFuelType,
  updateFuelType,
  deleteFuelType,
  getAdminCarBrands,
  createCarBrand,
  updateCarBrand,
  deleteCarBrand,
  getAdminCarModels,
  createCarModel,
  updateCarModel,
  deleteCarModel,
} from '../controllers/vehicleCatalog.controller.js';
import {
  createKit,
  getKits,
  getKitById,
  updateKit,
  deleteKit,
} from '../controllers/kit.controller.js';
import {
  getAdminKitOrders,
  getAdminKitOrderById,
  approveKitOrder,
  rejectKitOrder,
  dispatchKitOrder,
  deliverKitOrder,
} from '../controllers/kitOrder.controller.js';
import { getLiveDriversSnapshot } from '../controllers/driverLocation.controller.js';
import {
  createZone,
  listZones,
  getZoneById,
  updateZone,
  deleteZone,
} from '../controllers/zone.controller.js';
import {
  adminListServicePricings,
  adminUpsertServicePricing,
  adminUpdateServicePricing,
  adminDeleteServicePricing,
} from '../controllers/pricing.controller.js';
import {
  getTaskAssignees,
  getTaskSummary,
  listTasks,
  listTaskActivity,
  getTaskByResource,
  assignTasks,
  assignTask,
  claimTask,
  syncReviewTasks,
} from '../controllers/adminTask.controller.js';
import {
  listRefunds,
  updateRefundStatus,
} from '../controllers/refund.controller.js';
import { listPlatformRevenue } from '../controllers/revenue.controller.js';
import {
  getAdminBookings,
  getAdminBookingById,
  cancelAdminBooking,
  updateAdminBookingStatus,
  getEmergencyPoolBookings,
  getEmergencyPoolAvailableDrivers,
  assignDriverToEmergencyPoolBooking,
  getScheduledJobs,
  getOutstationAssignments,
  getOutstationAssignmentDetail,
  getOutstationAssignmentDrivers,
  assignDriverToOutstation,
  probeOutstationDriverConflict,
} from '../controllers/booking.controller.js';
import {
  adminListAds,
  adminCreateAd,
  adminUpdateAd,
  adminDeleteAd,
  adminUploadAdMedia,
} from '../controllers/ad.controller.js';
import {
  adminListBanners,
  adminUploadBannerMedia,
  adminCreateBanner,
  adminUpdateBanner,
  adminDeleteBanner,
} from '../controllers/banner.controller.js';
import { downloadDriverProfilePdf } from '../controllers/driverPdf.controller.js';
import { uploadAdMedia } from '../middlewares/multer.js';
import {
  getAdminSupportTickets,
  resolveSupportTicket,
  replySupportTicketAdmin,
} from '../controllers/support.controller.js';
import {
  getReferralSettings,
  updateReferralSettings,
  listReferrals,
  approveReferral,
  rejectReferral,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} from '../controllers/referralAdmin.controller.js';
import {
  adminListHelplines,
  adminCreateHelpline,
  adminUpdateHelpline,
  adminDeleteHelpline,
} from '../controllers/helpline.controller.js';
import { makeRefreshAccessToken, makeLogout } from '../controllers/common.controller.js';
import { AUDIENCES } from '../utils/cookie.util.js';

const router = express.Router();
const { ALL_STAFF, OPERATIONS, SUPER_ADMIN } = ROUTE_ROLES;

// ── Auth ──────────────────────────────────────────────────────────────────
router.post('/auth/login', loginAdmin);
// Own cookie pair — see the driver equivalent in driver.route.js.
router.post('/auth/refresh-token', makeRefreshAccessToken(AUDIENCES.ADMIN));
router.post('/auth/logout', makeLogout(AUDIENCES.ADMIN));

// ============================================================================
// ALL ROUTES BELOW THIS REQUIRE A VALID STAFF JWT
// ============================================================================
router.use(protectStaff);

// ── Referrals & Withdrawals ─────────────────────────────────────────────────
router.get('/referral-settings', restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.REFERRALS), getReferralSettings);
router.put('/referral-settings', restrictTo(...SUPER_ADMIN), updateReferralSettings);
router.get('/referrals', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.REFERRALS), listReferrals);
router.put('/referrals/:id/approve', restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.REFERRALS), approveReferral);
router.put('/referrals/:id/reject', restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.REFERRALS), rejectReferral);
router.get('/withdrawals', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.REFERRALS), listWithdrawals);
router.put('/withdrawals/:id/approve', restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.REFERRALS), approveWithdrawal);
router.put('/withdrawals/:id/reject', restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.REFERRALS), rejectWithdrawal);

// ── Current Staff User ────────────────────────────────────────────────────
router.get('/auth/me', getStaffMe);

router.get('/dashboard/stats', protectStaff, restrictTo(...ALL_STAFF), getDashboardStats);

router.use('/notifications', notificationRouter);

// ── Broadcasts ─────────────────────────────────────────────────────────────
router.post('/broadcast', restrictTo(...SUPER_ADMIN), requirePermission(PERMISSIONS.BROADCAST), sendBroadcast);
router.get('/broadcasts', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.BROADCAST), getBroadcasts);
router.get('/broadcasts/stats', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.BROADCAST), getBroadcastStats);
router.get('/broadcasts/search-users', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.BROADCAST), searchUsers);
router.get('/broadcasts/search-drivers', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.BROADCAST), searchDrivers);

router.get('/service-cities', restrictTo(...ALL_STAFF), getActiveServiceCities);
router.get('/users', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), getCustomers);
router.get('/users/:userId/profile', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), getUserProfile);
router.get('/users/:userId', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), getUserProfile);
router.patch('/users/:id/suspend', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), suspendUser);
router.patch('/users/:id/unsuspend', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), unsuspendUser);
router.patch('/users/:id/toggle-active', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), toggleUserActive);
router.delete('/users/:id', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), deleteUser);

router.get('/incoming-registrations', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.INCOMING_REGISTRATIONS), getIncomingRegistrations);
router.get('/driver-wallet-history', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVER_WALLET), getDriverWalletHistory);
router.post('/driver-wallet/adjust', restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.DRIVER_WALLET), adjustDriverWallet);

router.get('/user-wallet-history', restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.USERS), getUserWalletHistory);
router.post('/user-wallet/adjust', restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.USERS), adjustUserWallet);

// ----- Help Desk / Support Tickets -----
// Only SUPER_ADMIN (or others if you assign them the permission, defaulting to SUPER_ADMIN here)
router.get('/support/tickets', protectStaff, restrictTo(...SUPER_ADMIN), getAdminSupportTickets);
router.patch('/support/tickets/:id/status', protectStaff, restrictTo(...SUPER_ADMIN), resolveSupportTicket);
router.post('/support/tickets/:id/reply', protectStaff, restrictTo(...SUPER_ADMIN), replySupportTicketAdmin);

router.get('/tasks/assignees', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.TEAM_TASKS), getTaskAssignees);
router.get('/tasks/activity', protectStaff, restrictTo(...SUPER_ADMIN), listTaskActivity);
router.get('/tasks/summary', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.TEAM_TASKS), getTaskSummary);
router.get('/tasks', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.TEAM_TASKS), listTasks);
router.get('/tasks/by-resource', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.TEAM_TASKS), getTaskByResource);
router.post('/tasks/assign', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.TEAM_TASKS), assignTasks);
router.post('/tasks/sync', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.TEAM_TASKS), syncReviewTasks);
router.patch('/tasks/:id/assign', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.TEAM_TASKS), assignTask);
router.post('/tasks/:id/claim', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.TEAM_TASKS), claimTask);

router.get('/bookings', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.BOOKINGS_ALL), getAdminBookings);
/* ---- Scheduled Jobs (BullMQ snapshot) --------------------------------- */
// Mounted under /bookings/* so it lives in the same admin sub-section as
// the all-bookings table. Listed before /bookings/:id so the static
// segment wins over the param route.
router.get(
  '/bookings/scheduled-jobs',
  protectStaff,
  restrictTo(...OPERATIONS),
  requirePermission(PERMISSIONS.BOOKINGS_SCHEDULED),
  getScheduledJobs,
);
router.get('/bookings/:id', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.BOOKINGS_ALL), getAdminBookingById);
// Cancelling on the customer's behalf refunds real money and frees a
// driver mid-job, so it stays with OPERATIONS (admin + sub_admin) — the
// same bar as manual driver assignment. The service additionally scopes
// team_members by zone should that ever be widened.
router.patch(
  '/bookings/:id/cancel',
  protectStaff,
  restrictTo(...OPERATIONS),
  requirePermission(PERMISSIONS.BOOKINGS_ALL),
  cancelAdminBooking,
);
router.patch(
  '/bookings/:id/status',
  protectStaff,
  restrictTo(...ALL_STAFF),
  requirePermission(PERMISSIONS.BOOKINGS_ALL),
  updateAdminBookingStatus,
);

/* ---- Emergency Pool (scheduled-ride manual assignment) ---------------- */
// `ALL_STAFF` is used here because team_members must be able to view
// the pool too — the service itself scopes by `assignedZones` for them.
// Driver assignment is restricted to OPERATIONS (admin + sub_admin),
// matching the "admin manually assigns" requirement.
router.get(
  '/emergency-pool',
  protectStaff,
  restrictTo(...ALL_STAFF),
  requirePermission(PERMISSIONS.BOOKINGS_EMERGENCY),
  getEmergencyPoolBookings,
);
router.get(
  '/emergency-pool/:id/available-drivers',
  protectStaff,
  restrictTo(...OPERATIONS),
  requirePermission(PERMISSIONS.BOOKINGS_EMERGENCY),
  getEmergencyPoolAvailableDrivers,
);
router.post(
  '/emergency-pool/:id/assign-driver',
  protectStaff,
  restrictTo(...OPERATIONS),
  requirePermission(PERMISSIONS.BOOKINGS_EMERGENCY),
  assignDriverToEmergencyPoolBooking,
);

/* ---- Outstation Assignments (manual driver pick for round trips) ---- */
// Outstation bookings never auto-dispatch — they sit in
// PENDING_ASSIGNMENT until staff manually assign a driver here.
// `ALL_STAFF` for read endpoints because team_members must see their
// zone's queue; mutation endpoints are OPERATIONS-only so only
// admin/sub_admin can actually commit an assignment.
router.get(
  '/outstation-assignments',
  protectStaff,
  restrictTo(...ALL_STAFF),
  requirePermission(PERMISSIONS.BOOKINGS_OUTSTATION),
  getOutstationAssignments,
);
router.get(
  '/outstation-assignments/:id',
  protectStaff,
  restrictTo(...ALL_STAFF),
  requirePermission(PERMISSIONS.BOOKINGS_OUTSTATION),
  getOutstationAssignmentDetail,
);
router.get(
  '/outstation-assignments/:id/available-drivers',
  protectStaff,
  restrictTo(...ALL_STAFF),
  requirePermission(PERMISSIONS.BOOKINGS_OUTSTATION),
  getOutstationAssignmentDrivers,
);
router.get(
  '/outstation-assignments/:id/driver-conflict',
  protectStaff,
  restrictTo(...ALL_STAFF),
  requirePermission(PERMISSIONS.BOOKINGS_OUTSTATION),
  probeOutstationDriverConflict,
);
router.post(
  '/outstation-assignments/:id/assign-driver',
  protectStaff,
  restrictTo(...OPERATIONS),
  requirePermission(PERMISSIONS.BOOKINGS_OUTSTATION),
  assignDriverToOutstation,
);

router.get('/drivers', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), getDrivers);
router.get('/drivers/live', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.LIVE_MAP), getLiveDriversSnapshot);
router.get('/drivers/:id', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), getDriverById);
/* ---- Driver profile PDF export -------------------------------------- */
// Streams a one-click PDF dossier of the driver (identity, licence,
// bank, vehicles, every uploaded document image). Used by ops to
// share offline copies of the profile for verification audits.
router.get(
  '/drivers/:id/pdf',
  protectStaff,
  restrictTo(...ALL_STAFF),
  requirePermission(PERMISSIONS.DRIVERS),
  downloadDriverProfilePdf,
);
router.put('/drivers/:id/status', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), updateDriverStatus);
router.patch('/drivers/:id/suspend', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), suspendDriver);
router.patch('/drivers/:id/unsuspend', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), unsuspendDriver);
router.delete('/drivers/:id', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), deleteDriver);
router.put('/drivers/:id/documents', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), updateDriverDocument);
router.delete('/drivers/:id/documents/:docId', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.DRIVERS), deleteDriverDocument);

/* ---- Ads (admin + sub_admin manage; users get the public feed) ------ */
// Admins upload either an image OR a short video to Cloudinary via
// the existing /common/upload* endpoints, then POST the resulting
// URL + publicId here. Only OPERATIONS (admin/sub_admin) can mutate;
// the team_member role isn't trusted with promotional content.
router.get('/ads', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.ADS), adminListAds);
router.post(
  '/ads/upload',
  protectStaff,
  restrictTo(...OPERATIONS),
  requirePermission(PERMISSIONS.ADS),
  uploadAdMedia.single('media'),
  adminUploadAdMedia,
);
router.post('/ads', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.ADS), adminCreateAd);
router.put('/ads/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.ADS), adminUpdateAd);
router.delete('/ads/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.ADS), adminDeleteAd);

/* ---- Top Banners (admin + sub_admin manage; users get the public feed) ------ */
router.get('/banners', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.BANNERS), adminListBanners);
router.post(
  '/banners/upload',
  protectStaff,
  restrictTo(...OPERATIONS),
  requirePermission(PERMISSIONS.BANNERS),
  uploadAdMedia.single('media'), // Reusing uploadAdMedia since logic is identical
  adminUploadBannerMedia,
);
router.post('/banners', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.BANNERS), adminCreateBanner);
router.put('/banners/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.BANNERS), adminUpdateBanner);
router.delete('/banners/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.BANNERS), adminDeleteBanner);

router.post('/team', protectStaff, restrictTo(...SUPER_ADMIN), addAdminMember);
router.get('/team', protectStaff, restrictTo(...SUPER_ADMIN), getAdminTeam);
router.put('/team/:id', protectStaff, restrictTo(...SUPER_ADMIN), updateAdminMember);
router.delete('/team/:id', protectStaff, restrictTo(...SUPER_ADMIN), deleteAdminMember);

router.get('/settings/platform', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getPlatformSettings);
router.put('/settings/platform', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updatePlatformSettings);

router.get('/settings/car-types', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getAdminCarTypes);
router.post('/settings/car-types', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), createCarType);
router.put('/settings/car-types/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updateCarType);
router.delete('/settings/car-types/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), deleteCarType);

router.get('/settings/fuel-types', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getAdminFuelTypes);
router.post('/settings/fuel-types', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), createFuelType);
router.put('/settings/fuel-types/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updateFuelType);
router.delete('/settings/fuel-types/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), deleteFuelType);

router.get('/settings/car-brands', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getAdminCarBrands);
router.post('/settings/car-brands', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), createCarBrand);
router.put('/settings/car-brands/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updateCarBrand);
router.delete('/settings/car-brands/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), deleteCarBrand);

router.get('/settings/car-models', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getAdminCarModels);
router.post('/settings/car-models', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), createCarModel);
router.put('/settings/car-models/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updateCarModel);
router.delete('/settings/car-models/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), deleteCarModel);

router.get('/settings/conditions', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getAdminConditions);
router.post('/settings/conditions', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), createCondition);
router.put('/settings/conditions/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updateCondition);
router.delete('/settings/conditions/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), deleteCondition);

router.get('/settings/training-videos', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getAdminTrainingVideos);
router.post('/settings/training-videos', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), createTrainingVideo);
router.put('/settings/training-videos/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updateTrainingVideo);
router.delete('/settings/training-videos/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), deleteTrainingVideo);

router.post('/kits', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_KITS), createKit);
router.get('/kits', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.SETTINGS_KITS), getKits);
router.get('/kits/:id', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.SETTINGS_KITS), getKitById);
router.put('/kits/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_KITS), updateKit);
router.delete('/kits/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_KITS), deleteKit);

router.get('/zones', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_ZONES), listZones);
router.post('/zones', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_ZONES), createZone);
router.get('/zones/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_ZONES), getZoneById);
router.put('/zones/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_ZONES), updateZone);
router.delete('/zones/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_ZONES), deleteZone);

router.get('/pricing/services', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.FARE_MANAGEMENT), adminListServicePricings);
router.post('/pricing/services', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.FARE_MANAGEMENT), adminUpsertServicePricing);
router.put('/pricing/services/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.FARE_MANAGEMENT), adminUpdateServicePricing);
router.delete('/pricing/services/:id', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.FARE_MANAGEMENT), adminDeleteServicePricing);





router.get('/kit-orders', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.KIT_ORDERS), getAdminKitOrders);
router.get('/kit-orders/:id', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.KIT_ORDERS), getAdminKitOrderById);
router.patch('/kit-orders/:id/approve', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.KIT_ORDERS), approveKitOrder);
router.patch('/kit-orders/:id/reject', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.KIT_ORDERS), rejectKitOrder);
router.patch('/kit-orders/:id/dispatch', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.KIT_ORDERS), dispatchKitOrder);
router.patch('/kit-orders/:id/deliver', protectStaff, restrictTo(...ALL_STAFF), requirePermission(PERMISSIONS.KIT_ORDERS), deliverKitOrder);

/* ---- Account → Refunds ----------------------------------------------- */
// The cancellation pipeline writes Refund documents; admins review and
// PATCH the status as they manually move the money on the Razorpay
// dashboard. There is no automated retry — the gateway call is human-
// driven and the PATCH is the authoritative state-transition.
router.get('/refunds', protectStaff, restrictTo(...SUPER_ADMIN), requirePermission(PERMISSIONS.ACCOUNT_REFUNDS), listRefunds);
router.patch('/refunds/:id', protectStaff, restrictTo(...SUPER_ADMIN), requirePermission(PERMISSIONS.ACCOUNT_REFUNDS), updateRefundStatus);

router.get('/platform-settings', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), getPlatformSettings);
router.put('/platform-settings', protectStaff, restrictTo(...OPERATIONS), requirePermission(PERMISSIONS.SETTINGS_PLATFORM), updatePlatformSettings);

/* ---- Account → Revenue ----------------------------------------------- */
// Read-only paginated view over the `PlatformRevenue` ledger. Each row
// represents a rupee event the platform kept (trip-completion
// commission, company share of a cancellation fee, etc.) — writes are
// done by the booking pipelines, not here.
router.get('/revenue', protectStaff, restrictTo(...SUPER_ADMIN), requirePermission(PERMISSIONS.ACCOUNT_REVENUE), listPlatformRevenue);

/* ---- Helpline Numbers ------------------------------------------------- */
router.get('/helplines', protectStaff, restrictTo(...ALL_STAFF), adminListHelplines);
router.post('/helplines', protectStaff, restrictTo(...OPERATIONS), adminCreateHelpline);
router.put('/helplines/:id', protectStaff, restrictTo(...OPERATIONS), adminUpdateHelpline);
router.delete('/helplines/:id', protectStaff, restrictTo(...OPERATIONS), adminDeleteHelpline);

export default router;
