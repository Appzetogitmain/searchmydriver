import { Driver } from '../models/driverModels/driver.model.js';
import DriverKit from '../models/driverKit.model.js';
import KitOrder from '../models/kitOrder.model.js';
import { PAYMENT_STATUS, KIT_ADMIN_STATUS } from '../constants/kitStatus.js';

export async function getActiveKits() {
  return DriverKit.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

export async function getDriverKitEligibility(driverId) {
  const driver = await Driver.findById(driverId).lean();
  if (!driver) {
    return { allowed: false, code: 'DRIVER_NOT_FOUND', reasons: ['Driver not found'] };
  }

  const reasons = [];

  if (driver.approvalStatus !== 'approved') {
    reasons.push('Driver account is not approved yet');
  }
  if ((driver.onboardingStep || 0) < 6) {
    reasons.push('Complete onboarding before going online');
  }
  if (!driver.documents || driver.documents.length === 0) {
    reasons.push('All required documents must be uploaded');
  }
  if (driver.approvalStatus === 'suspended') {
    reasons.push('Your account is suspended');
  }

  const activeKits = await getActiveKits();
  if (!activeKits.length) {
    return {
      allowed: reasons.length === 0,
      hasKit: true,
      code: reasons.length ? 'NOT_ELIGIBLE' : 'NO_KIT_REQUIRED',
      reasons,
      warnings: [],
      activeKits: [],
      activeOrder: null,
    };
  }

  const kitIds = activeKits.map((k) => k._id);

  const approvedOrder = await KitOrder.findOne({
    driverId,
    kitId: { $in: kitIds },
    paymentStatus: PAYMENT_STATUS.PAID,
    adminStatus: KIT_ADMIN_STATUS.APPROVED,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (approvedOrder) {
    return {
      allowed: reasons.length === 0,
      hasKit: true,
      code: reasons.length ? 'NOT_ELIGIBLE' : 'ELIGIBLE',
      reasons,
      warnings: [],
      activeKits,
      activeOrder: approvedOrder,
    };
  }

  const pendingOrder = await KitOrder.findOne({
    driverId,
    kitId: { $in: kitIds },
    paymentStatus: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PAID] },
    adminStatus: { $in: [KIT_ADMIN_STATUS.PENDING, KIT_ADMIN_STATUS.APPROVED] },
  })
    .sort({ createdAt: -1 })
    .lean();

  const warnings = [];
  if (pendingOrder?.paymentStatus === PAYMENT_STATUS.PENDING) {
    warnings.push('Complete payment for your selected kit');
  } else if (
    pendingOrder?.paymentStatus === PAYMENT_STATUS.PAID &&
    pendingOrder?.adminStatus === KIT_ADMIN_STATUS.PENDING
  ) {
    warnings.push('Your kit purchase is awaiting admin approval');
  } else {
    warnings.push('Purchase a driver kit to avoid penalties on trips');
  }

  return {
    allowed: reasons.length === 0,
    hasKit: false,
    code: 'KIT_REQUIRED',
    reasons,
    warnings,
    activeKits,
    activeOrder: pendingOrder,
  };
}

export async function syncDriverKitEligibility(driverId) {
  const eligibility = await getDriverKitEligibility(driverId);
  await Driver.findByIdAndUpdate(driverId, {
    canGoOnline: eligibility.allowed,
    activeKitOrderId: eligibility.activeOrder?._id || null,
    kitEligibilityCheckedAt: new Date(),
  });
  return eligibility;
}
