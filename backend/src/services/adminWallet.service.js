import PlatformSettings from '../models/platformSettings.model.js';
import { recordPlatformRevenue } from './platformRevenue.service.js';
import { PLATFORM_REVENUE_SOURCE } from '../models/platformRevenue.model.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Get current admin wallet state
 */
export async function getAdminWalletStateService() {
  const settings = await PlatformSettings.findOne({}).lean();
  return {
    balance: settings?.adminWalletBalance || 0,
  };
}

/**
 * Simulate adding funds via Razorpay (dummy)
 */
export async function addFundsDummyService(adminId, amount, note) {
  if (amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');

  const doc = await recordPlatformRevenue({
    source: PLATFORM_REVENUE_SOURCE.WALLET_TOP_UP,
    amountRupees: amount,
    userId: adminId,
    meta: { note: note || 'Funds added via Dummy Gateway' },
  });

  return { success: true, revenueId: doc._id };
}

/**
 * Withdraw funds (dummy)
 */
export async function withdrawFundsService(adminId, amount, note) {
  if (amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');

  const settings = await PlatformSettings.findOne({});
  const currentBalance = settings?.adminWalletBalance || 0;

  if (currentBalance < amount) {
    throw new ApiError(400, 'Insufficient balance in Admin Wallet');
  }

  // Record a negative amount to deduct from balance
  const doc = await recordPlatformRevenue({
    source: PLATFORM_REVENUE_SOURCE.WALLET_WITHDRAWAL,
    amountRupees: -amount,
    userId: adminId,
    meta: { note: note || 'Funds withdrawn to bank' },
  });

  return { success: true, revenueId: doc._id };
}

/**
 * Manual adjustment (Add or Deduct)
 */
export async function manualAdjustmentService(adminId, amount, type, note) {
  if (amount <= 0) throw new ApiError(400, 'Amount must be greater than 0');
  
  const source = type === 'add' ? PLATFORM_REVENUE_SOURCE.MANUAL_ADD : PLATFORM_REVENUE_SOURCE.MANUAL_DEDUCT;
  const actualAmount = type === 'add' ? amount : -amount;

  const doc = await recordPlatformRevenue({
    source,
    amountRupees: actualAmount,
    userId: adminId,
    meta: { note: note || `Manual ${type}` },
  });

  return { success: true, revenueId: doc._id };
}
