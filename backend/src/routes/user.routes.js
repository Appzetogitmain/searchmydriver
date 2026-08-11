import express from 'express';
import { refreshAccessToken, logout } from '../controllers/common.controller.js';
import notificationRouter from './notification.route.js';
import {
  loginUser,
  sendUserOtp,
  sendPasswordResetOtp,
  resetPassword,
  verifyUserOtpAndRegister,
  updateUserOnboardingStep,
  getUserProfile,
  updateUserProfile,
  getRegistrationStatus,
  addCar,
  getUserCars,
  deleteUserCar,
  listSavedLocations,
  addSavedLocation,
  deleteSavedLocation,
  deleteMyAccount,
  updateUserFcmToken,
  triggerUserTestPush,
} from '../controllers/user.controller.js';
import {
  googleSignInUser,
  sendGoogleLinkPhoneOtp,
  linkGoogleUserPhone,
} from '../controllers/googleAuth.controller.js';
import {
  getActiveServicePricings,
  estimateFare,
} from '../controllers/pricing.controller.js';
import { getNearbyDriversForUser } from '../controllers/driverLocation.controller.js';
import {
  createBooking,
  getMyBookings,
  getMyActiveBooking,
  getMyActiveBookings,
  getBookingById,
  cancelBooking,
  createBookingPayment,
  verifyBookingPayment,
  payBookingWithWallet,
  payBookingWithCash,
  initiateBookingExtension,
  verifyBookingExtensionOtp,
  payBookingExtension,
  cancelBookingExtension,
  respondToNoShowPrompt,
  rateDriverByCustomer,
  downloadBookingInvoice,
  addOfflineTip,
} from '../controllers/booking.controller.js';
import {
  getMyWallet,
  getMyWalletTransactions,
  createWalletTopupOrder,
  verifyWalletTopupPayment,
  requestWithdrawal,
  updateBankDetails,
  getMyWithdrawals,
} from '../controllers/wallet.controller.js';
import {
  createSupportTicket,
  createPublicSupportTicket,
  getMySupportTicketsUser,
  replySupportTicketUser,
} from '../controllers/support.controller.js';
import { protectUser, protectProfileViewer } from '../middlewares/authMiddleware.js';
import { authLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

// Support routes
router.post('/support/ticket', protectUser, createSupportTicket);
router.post('/support/public-ticket', createPublicSupportTicket);
router.get('/support/my-tickets', protectUser, getMySupportTicketsUser);
router.post('/support/tickets/:id/reply', protectUser, replySupportTicketUser);
router.post('/send-otp', authLimiter, sendUserOtp);
router.post('/verify-otp', authLimiter, verifyUserOtpAndRegister);
router.post('/forgot-password/send-otp', authLimiter, sendPasswordResetOtp);
router.post('/forgot-password/reset', authLimiter, resetPassword);
router.post('/login', authLimiter, loginUser);
router.post('/google', authLimiter, googleSignInUser);
router.post('/google/link-phone/otp', authLimiter, sendGoogleLinkPhoneOtp);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logout);
router.delete('/account', protectUser, deleteMyAccount);

// Public pricing reads (used by the booking flow before checkout)
router.get('/pricing/services', getActiveServicePricings);

// Profile — customer (own id) or staff (any customer id)
router.get('/users/:userId/profile', protectProfileViewer, getUserProfile);

// Protected Onboarding & Cars
router.use(protectUser);

router.put('/profile', updateUserProfile);

router.use('/notifications', notificationRouter);

// Fare estimate (auth required so we can apply the user's subscription discount)
router.post('/bookings/estimate', estimateFare);


// Booking lifecycle (Phase 4)
router.post('/bookings', createBooking);
router.get('/bookings', getMyBookings);
router.get('/bookings/active', getMyActiveBooking);
router.get('/bookings/active-list', getMyActiveBookings);
router.get('/bookings/:id', getBookingById);
router.get('/bookings/:id/invoice', downloadBookingInvoice);
router.post('/bookings/:id/cancel', cancelBooking);
router.post('/bookings/:id/pay', createBookingPayment);
router.post('/bookings/:id/verify-payment', verifyBookingPayment);
router.post('/bookings/:id/pay-wallet', payBookingWithWallet);
router.post('/bookings/:id/pay-cash', payBookingWithCash);
// Extension flow is a 3-step handshake (initiate → driver OTP →
// customer verifies → customer pays). The old single-shot endpoint is
// gone; the service throws 410 if anything still calls it.
router.post('/bookings/:id/extensions/initiate', initiateBookingExtension);
router.post('/bookings/:id/extensions/verify-otp', verifyBookingExtensionOtp);
router.post('/bookings/:id/extensions/pay', payBookingExtension);
router.post('/bookings/:id/extensions/cancel', cancelBookingExtension);
router.post('/bookings/:id/noshow/respond', respondToNoShowPrompt);
// Post-trip rating — customer rates the driver who completed the trip.
// Once-only; a duplicate submit hits 409 from the service.
router.post('/bookings/:id/rate-driver', rateDriverByCustomer);

// Add offline tip to a booking
router.post('/bookings/:id/offline-tip', addOfflineTip);

// Wallet — read + Razorpay top-up. Mutations go through the
// wallet service so the WalletTransaction ledger stays in sync.
router.get('/wallet', getMyWallet);
router.get('/wallet/transactions', getMyWalletTransactions);
router.get('/wallet/withdrawals', getMyWithdrawals);
router.post('/wallet/topup', createWalletTopupOrder);
router.post('/wallet/topup/verify', verifyWalletTopupPayment);
router.post('/wallet/withdraw', requestWithdrawal);
router.post('/wallet/bank-details', updateBankDetails);

router.post('/google/link-phone', linkGoogleUserPhone);
router.get('/onboarding/status', getRegistrationStatus);
router.put('/onboarding/step', updateUserOnboardingStep);

// Cars management
router.post('/cars', addCar);
router.get('/cars', getUserCars);
router.delete('/cars/:id', deleteUserCar);

// Favourite / saved locations
router.get('/saved-locations', listSavedLocations);
router.post('/saved-locations', addSavedLocation);
router.delete('/saved-locations/:id', deleteSavedLocation);

// Nearby drivers (home screen widget + future surfaces)
router.get('/drivers/nearby', getNearbyDriversForUser);

// FCM Push Notifications
router.post('/fcm-token', updateUserFcmToken);
router.post('/test-push', triggerUserTestPush);

export default router;
