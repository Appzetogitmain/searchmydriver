import PlatformRevenue, { PLATFORM_REVENUE_SOURCE } from '../models/platformRevenue.model.js';
import PlatformSettings from '../models/platformSettings.model.js';
import { recordPlatformRevenue } from './platformRevenue.service.js';
import { ApiError } from '../utils/apiError.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function getDateRangeForPeriod(period, customFrom, customTo) {
  if (customFrom || customTo) {
    return {
      from: customFrom ? new Date(customFrom) : null,
      to: customTo ? new Date(customTo) : null,
    };
  }

  const now = new Date();
  let from = null;
  let to = null;

  if (period === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (period === 'week') {
    const day = now.getDay(); // 0 is Sun, 1 is Mon...
    const diff = (day === 0 ? -6 : 1) - day; // Monday as start of week
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
    to = new Date(now);
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    to = new Date(now);
  } else if (period === 'year') {
    from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    to = new Date(now);
  }

  return { from, to };
}

/**
 * Get current admin wallet state with commission stats
 */
export async function getAdminWalletStateService({ period = 'all', from: customFrom, to: customTo } = {}) {
  const settings = await PlatformSettings.findOne({}).lean();
  const balance = settings?.adminWalletBalance || 0;

  const { from, to } = getDateRangeForPeriod(period, customFrom, customTo);
  const filter = {};
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = from;
    if (to) filter.occurredAt.$lte = to;
  }

  const aggregates = await PlatformRevenue.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$source',
        count: { $sum: 1 },
        amount: { $sum: '$amountRupees' },
      },
    },
  ]);

  const breakdown = {};
  let totalCommission = 0;
  let commissionCount = 0;
  let totalRevenue = 0;

  aggregates.forEach((row) => {
    const amt = round2(row.amount);
    breakdown[row._id] = {
      count: row.count,
      amount: amt,
    };
    if (row._id === PLATFORM_REVENUE_SOURCE.COMMISSION) {
      totalCommission = amt;
      commissionCount = row.count;
    }
    // All platform earnings (positive revenue)
    if (amt > 0) {
      totalRevenue = round2(totalRevenue + amt);
    }
  });

  return {
    balance: round2(balance),
    commission: {
      totalAmount: totalCommission,
      count: commissionCount,
      period: period || 'all',
    },
    totalRevenue,
    breakdown,
    dateRange: {
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
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
