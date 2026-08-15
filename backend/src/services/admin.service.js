import mongoose from 'mongoose';
import { Driver } from '../models/driverModels/driver.model.js';
import User from '../models/user.model.js';
import Zone from '../models/zone.model.js';
import Car from '../models/user/car.model.js';
import Payment from '../models/payment.model.js';
import PlatformRevenue, { PLATFORM_REVENUE_SOURCE } from '../models/platformRevenue.model.js';
import Booking from '../models/booking.model.js';
import WalletTransaction from '../models/walletTransaction.model.js';
import { creditWalletService, debitWalletService } from './wallet.service.js';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/apiError.js';
import { USER_ROLES } from '../constants/roles.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import { dedupeDocumentsByType } from '../utils/driverDocuments.util.js';
import { emitNotification } from '../utils/socketEmitters.js';
import {
  getActiveTrainingVideos,
  mergeTrainingProgress,
  isDriverTrainingComplete,
} from '../utils/driverTraining.util.js';
import {
  generateAccessToken,
  generateRefreshToken,
  tokenPayloadFromUser,
} from '../utils/jwt.util.js';
import {
  attachReviewTasks,
  assertStaffCanActOnResource,
  assertStaffCanAccessResource,
  completeTaskForResource,
  upsertDriverReviewTask,
  getResourceIdScopeForStaff,
} from './adminTask.service.js';
import { TASK_TYPE } from '../constants/adminTask.js';
import AdminTask from '../models/adminTask.model.js';

export const loginStaffService = async (email, password) => {
  if (!email || !password) {
    throw new ApiError(400, 'Email and password required');
  }
  console.log("email and password is ", email, password);
  const staff = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(401, 'Invalid credentials or unauthorized');
  }

  if (!staff.isActive) {
    throw new ApiError(403, 'Your account has been deactivated. Please contact the administrator.');
  }

  const isMatch = await bcrypt.compare(password, staff.password);
  if (!isMatch) {
    console.log("password did not match");
    throw new ApiError(401, 'Invalid credentials');
  }

  staff.password = undefined;
  const payload = tokenPayloadFromUser(staff);

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    admin: staff,
  };
};

export const getStaffProfileService = async (staffId) => {
  const staff = await User.findById(staffId).select('-password');
  if (!staff || staff.isDeleted || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(404, 'Profile not found');
  }
  return staff;
};

export const getCustomersService = async (query) => {
  const { search, page = 1, limit = 10 } = query;

  const filter = { role: USER_ROLES.USER, isDeleted: { $ne: true } };
  if (search) {
    const s = String(search).trim();
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { phone_no: { $regex: s, $options: 'i' } },
      { userId: { $regex: s, $options: 'i' } },
    ];
    if (mongoose.Types.ObjectId.isValid(s)) {
      filter.$or.push({ _id: s });
    }
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const userIds = users.map((u) => u._id);
  const carCounts = userIds.length
    ? await Car.aggregate([
        { $match: { userId: { $in: userIds }, isActive: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
    : [];

  const cancelledCounts = userIds.length
    ? await Booking.aggregate([
        { $match: { userId: { $in: userIds }, status: 'cancelled', 'cancellation.cancelledBy': 'user' } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
    : [];

  const countMap = new Map(carCounts.map((c) => [String(c._id), c.count]));
  const cancelledCountMap = new Map(cancelledCounts.map((c) => [String(c._id), c.count]));

  const data = users.map((u) => {
    const doc = u.toObject();
    doc.carsCount = countMap.get(String(u._id)) || 0;
    doc.cancelledRidesCount = cancelledCountMap.get(String(u._id)) || 0;
    return doc;
  });

  return {
    data,
    pagination: {
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)) || 1,
    },
  };
};

export const getDriversService = async (staff, query) => {
  const { status, search, assigneeId, page = 1, limit = 10 } = query;

  const scope = await getResourceIdScopeForStaff(
    staff,
    TASK_TYPE.DRIVER_REVIEW,
    assigneeId,
    page,
    limit,
  );
  if (scope?.empty) {
    return { data: [], pagination: scope.pagination };
  }

  const filter = { isDeleted: { $ne: true } };
  if (status) filter.approvalStatus = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { driverId: { $regex: search, $options: 'i' } },
    ];
  }
  if (scope?.resourceIds) {
    filter._id = { $in: scope.resourceIds };
  }

  // Enforce zone restrictions for team members by filtering by zone cities
  if (staff && staff.role === 'team_member' && staff.assignedZones?.length) {
    const zones = await Zone.find({ _id: { $in: staff.assignedZones } }).select('city');
    const cities = zones.map((z) => z.city).filter(Boolean);
    const regexes = cities.map((c) => new RegExp(`^${c.trim()}$`, 'i'));
    filter.city = { $in: regexes };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const total = await Driver.countDocuments(filter);
  const data = await Driver.find(filter)
    .populate('carTypeExperience', 'name')
    .populate('homeZone', 'name city code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const normalized = data.map((driver) => {
    const doc = driver.toObject();
    doc.documents = dedupeDocumentsByType(doc.documents);
    return doc;
  });

  const withTasks = await attachReviewTasks(staff, normalized, TASK_TYPE.DRIVER_REVIEW);

  return {
    data: withTasks,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    },
  };
};

export const getDriverByIdService = async (staff, driverId) => {
  await assertStaffCanAccessResource(staff, AdminTask, TASK_TYPE.DRIVER_REVIEW, driverId);

  const driver = await Driver.findById(driverId)
    .populate('homeZone', 'name code city description')
    .populate('carTypeExperience', 'name image')
    .populate('vehicleExperience.carTypeId', 'name')
    .populate('vehicleExperience.brandId', 'name')
    .populate('vehicleExperience.modelId', 'name')
    .populate('vehicleExperience.fuelTypeId', 'name')
    .populate('approvedBy', 'name email');

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const doc = driver.toObject();
  doc.documents = dedupeDocumentsByType(doc.documents);

  const videos = await getActiveTrainingVideos();
  const training = mergeTrainingProgress(videos, doc.trainingProgress);
  const trainingComplete = await isDriverTrainingComplete(driver);

  return {
    driver: doc,
    training,
    trainingComplete,
  };
};

export const updateDriverStatusService = async (staff, driverId, data) => {
  const { approvalStatus, approvalNote } = data;

  if (!['approved', 'rejected', 'suspended'].includes(approvalStatus)) {
    throw new ApiError(400, 'Invalid status');
  }

  const note = (approvalNote || '').trim();
  if (['approved', 'rejected'].includes(approvalStatus) && note.length < 10) {
    throw new ApiError(400, 'Approval note is required (minimum 10 characters) for approve or reject actions');
  }

  if (['approved', 'rejected'].includes(approvalStatus)) {
    await assertStaffCanActOnResource(staff, TASK_TYPE.DRIVER_REVIEW, driverId);
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  driver.approvalStatus = approvalStatus;
  driver.approvalNote = note;

  if (approvalStatus === 'approved') {
    driver.approvedAt = new Date();
    driver.approvedBy = staff._id;
  } else if (approvalStatus === 'rejected') {
    driver.approvedAt = null;
    driver.approvedBy = staff._id;
  } else if (approvalStatus === 'suspended') {
    driver.isOnline = false;
    driver.isOnTrip = false;
  } else {
    driver.approvedAt = null;
    driver.approvedBy = null;
  }

  await driver.save();

  if (['approved', 'rejected'].includes(approvalStatus)) {
    await completeTaskForResource(staff, TASK_TYPE.DRIVER_REVIEW, driverId, {
      action: approvalStatus,
      note,
    });
    
    // Notify the driver
    const title = approvalStatus === 'approved' ? 'Account Approved' : 'Account Rejected';
    const body = approvalStatus === 'approved' 
      ? 'Congratulations! Your account has been approved. You can now go online and accept trips.' 
      : `Your account application was rejected. Note: ${note}`;
    
    emitNotification({ driverId: driver._id }, {
      title,
      body,
      severity: approvalStatus === 'approved' ? 'success' : 'error',
      data: { type: `account_${approvalStatus}` }
    }).catch((err) => console.error('Failed to notify driver of account status:', err));
  } else if (approvalStatus === 'suspended') {
    await upsertDriverReviewTask(driver);
  }

  return driver;
};

export const suspendDriverService = async (adminId, driverId, data = {}) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (driver.approvalStatus === 'suspended') {
    throw new ApiError(400, 'Driver is already suspended');
  }

  if (driver.approvalStatus !== 'approved') {
    throw new ApiError(400, 'Only approved drivers can be suspended');
  }

  const note = (data.note || data.approvalNote || '').trim();
  driver.approvalStatus = 'suspended';
  if (note) driver.approvalNote = note;
  driver.isOnline = false;
  driver.isOnTrip = false;

  await driver.save();
  return driver;
};

export const unsuspendDriverService = async (adminId, driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (driver.approvalStatus !== 'suspended') {
    throw new ApiError(400, 'Driver is not suspended');
  }

  driver.approvalStatus = 'approved';
  if (!driver.approvedAt) {
    driver.approvedAt = new Date();
  }
  if (!driver.approvedBy) {
    driver.approvedBy = adminId;
  }

  await driver.save();
  return driver;
};

export const updateDriverDocumentService = async (staff, driverId, docData) => {
  const { docId, type, fileUrl, status = 'approved', verificationStatus = 'approved' } = docData;
  if (!type || !fileUrl) {
    throw new ApiError(400, 'Document type and fileUrl are required');
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  let existingIndex = -1;
  if (docId) {
    existingIndex = driver.documents.findIndex(d => d._id?.toString() === docId.toString());
  }
  if (existingIndex === -1) {
    existingIndex = driver.documents.findIndex(d => d.type === type);
  }

  const docStatus = status || verificationStatus || 'approved';

  if (existingIndex > -1) {
    driver.documents[existingIndex].type = type;
    driver.documents[existingIndex].fileUrl = fileUrl;
    driver.documents[existingIndex].verificationStatus = docStatus;
    driver.documents[existingIndex].status = docStatus;
    driver.documents[existingIndex].uploadedAt = new Date();
  } else {
    driver.documents.push({
      type,
      fileUrl,
      verificationStatus: docStatus,
      status: docStatus,
      uploadedAt: new Date(),
    });
  }

  await driver.save();
  return driver;
};

export const deleteDriverDocumentService = async (staff, driverId, docId) => {
  if (!docId) {
    throw new ApiError(400, 'Document ID or type is required');
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const initialLength = driver.documents.length;
  driver.documents = driver.documents.filter(
    (d) => d._id?.toString() !== docId && d.type !== docId
  );

  if (driver.documents.length === initialLength) {
    throw new ApiError(404, 'Document not found');
  }

  await driver.save();
  return driver;
};

async function assertSingleSuperAdmin(role, excludeUserId = null) {
  if (role !== USER_ROLES.ADMIN) return;

  const filter = { role: USER_ROLES.ADMIN, isDeleted: false };
  if (excludeUserId) filter._id = { $ne: excludeUserId };

  const count = await User.countDocuments(filter);
  if (count >= 1) {
    throw new ApiError(400, 'Only one super admin is allowed in the application');
  }
}

/**
 * Normalise an `assignedZones` payload into an array of valid ObjectIds.
 * Drops `null`/`undefined` and anything that can't be coerced. Used for
 * both create + update so the team_member zone-scoped emergency-pool
 * filter has a clean array to work with.
 */
function normalizeAssignedZones(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export const addAdminMemberService = async (data) => {
  const {
    name,
    email,
    phone_no,
    password,
    role: requestedRole,
    assignedZones,
    permissions = [],
  } = data;

  if (!name || !email || !phone_no || !password) {
    throw new ApiError(400, 'Missing required fields');
  }

  const role =
    requestedRole && [USER_ROLES.SUB_ADMIN, USER_ROLES.TEAM_MEMBER].includes(requestedRole)
      ? requestedRole
      : USER_ROLES.TEAM_MEMBER;

  await assertSingleSuperAdmin(role);

  const adminExists = await User.findOne({ email });
  if (adminExists) {
    throw new ApiError(400, 'Admin with this email already exists');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newAdmin = new User({
    name,
    email,
    phone_no,
    password: hashedPassword,
    role,
    // Only team_member uses `assignedZones`; admin + sub_admin see all
    // zones regardless. Empty array for other roles keeps schemas tidy.
    assignedZones:
      role === USER_ROLES.TEAM_MEMBER ? normalizeAssignedZones(assignedZones) : [],
    permissions: Array.isArray(permissions) ? permissions : [],
  });

  await newAdmin.save();
  newAdmin.password = undefined;
  return newAdmin;
};

export const getAdminTeamService = async (query) => {
  const { search, page = 1, limit = 10 } = query;
  
  const filter = {
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.SUB_ADMIN, USER_ROLES.TEAM_MEMBER] },
  };

  if (search) {
    const s = String(search).trim();
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { userId: { $regex: s, $options: 'i' } },
    ];
    if (mongoose.Types.ObjectId.isValid(s)) {
      filter.$or.push({ _id: s });
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const total = await User.countDocuments(filter);
  const data = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    }
  };
};

export const updateAdminMemberService = async (id, data) => {
  const { name, email, phone_no, role, isActive, assignedZones, permissions } = data;
  const staff = await User.findById(id);
  
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(404, 'Staff member not found');
  }

  if (name) staff.name = name;
  if (email) staff.email = email;
  if (phone_no) staff.phone_no = phone_no;
  if (role && STAFF_ROLES.includes(role)) {
    if (role === USER_ROLES.ADMIN) {
      await assertSingleSuperAdmin(role, staff._id);
    }
    if (staff.role === USER_ROLES.ADMIN && role !== USER_ROLES.ADMIN) {
      throw new ApiError(400, 'The super admin role cannot be changed');
    }
    staff.role = role;
  }
  if (isActive !== undefined) staff.isActive = isActive;
  // Zone assignments only matter for team_members (the others see all
  // emergency-pool entries regardless). Switching a member off of
  // team_member clears the array so stale data doesn't linger.
  if (assignedZones !== undefined) {
    staff.assignedZones =
      staff.role === USER_ROLES.TEAM_MEMBER
        ? normalizeAssignedZones(assignedZones)
        : [];
  } else if (staff.role !== USER_ROLES.TEAM_MEMBER && staff.assignedZones?.length) {
    staff.assignedZones = [];
  }
  
  if (permissions !== undefined && Array.isArray(permissions)) {
    staff.permissions = permissions;
  }

  await staff.save();
  staff.password = undefined;
  return staff;
};

export const deleteAdminMemberService = async (id) => {
  const staff = await User.findById(id);
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(404, 'Staff member not found');
  }

  if (staff.role === USER_ROLES.ADMIN) {
    throw new ApiError(400, 'The super admin account cannot be deleted');
  }

  await User.findByIdAndDelete(id);
  return { id };
};

export const getIncomingRegistrationsService = async (query) => {
  const { page = 1, limit = 10 } = query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const parsedLimit = parseInt(limit, 10);

  // 1. Fetch incomplete drivers
  const driverFilter = {
    isDeleted: false,
    $or: [{ approvalStatus: 'pending' }, { onboardingStep: { $lt: 6 } }],
  };
  const totalDrivers = await Driver.countDocuments(driverFilter);
  const incompleteDrivers = await Driver.find(driverFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit)
    .lean();

  // 2. Fetch incomplete users
  // An incomplete user has no verified phone OR no cars
  const userFilter = { role: 'user', isDeleted: false };
  const allUsers = await User.find(userFilter)
    .sort({ createdAt: -1 })
    .select('-password')
    .lean();

  const userIds = allUsers.map((u) => u._id);
  const carCounts = userIds.length
    ? await Car.aggregate([
        { $match: { userId: { $in: userIds }, isActive: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
    : [];
  const countMap = new Map(carCounts.map((c) => [String(c._id), c.count]));

  const incompleteUsers = allUsers.filter((u) => {
    const carsCount = countMap.get(String(u._id)) || 0;
    // Condition check can be added if needed, but phone and cars cover 99%
    return !u.isPhoneVerified || carsCount === 0;
  });

  const paginatedUsers = incompleteUsers.slice(skip, skip + parsedLimit);
  const totalUsers = incompleteUsers.length;

  return {
    drivers: {
      data: incompleteDrivers,
      pagination: {
        total: totalDrivers,
        page: parseInt(page, 10),
        pages: Math.ceil(totalDrivers / parsedLimit) || 1,
      },
    },
    users: {
      data: paginatedUsers.map((u) => ({ ...u, carsCount: countMap.get(String(u._id)) || 0 })),
      pagination: {
        total: totalUsers,
        page: parseInt(page, 10),
        pages: Math.ceil(totalUsers / parsedLimit) || 1,
      },
    },
  };
};

export const getDriverWalletHistoryService = async (query) => {
  const { page = 1, limit = 20, type = 'all', search = '' } = query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const parsedLimit = parseInt(limit, 10);

  const filter = { driverId: { $ne: null } };

  if (type === 'withdrawals') {
    filter.purpose = 'withdrawal';
  } else if (type === 'transactions') {
    filter.purpose = { $ne: 'withdrawal' };
  }

  // If search is provided, we need to lookup driver by name/phone.
  let driverIds = [];
  if (search) {
    const drivers = await Driver.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();
    driverIds = drivers.map((d) => d._id);
    filter.driverId = { $in: driverIds };
  }

  const [total, payments] = await Promise.all([
    Payment.countDocuments(filter),
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('driverId', 'name phone profilePicture wallet')
      .lean(),
  ]);

  const formatted = payments.map((p) => {
    let description = '';
    let isCredit = false;

    if (['trip_fare', 'trip_allowance', 'trip_waiting', 'admin_adjustment_credit'].includes(p.purpose)) {
      isCredit = true;
      description = p.purpose === 'admin_adjustment_credit' 
        ? `Manual Credit: ${p.meta?.reason || 'Admin adjustment'}`
        : `Credit for ${p.purpose.replace('_', ' ')}`;
    } else if (p.purpose === 'withdrawal') {
      isCredit = false;
      description = `Withdrawal Request (${p.status})`;
    } else if (p.purpose === 'admin_adjustment_debit') {
      isCredit = false;
      description = `Manual Debit: ${p.meta?.reason || 'Admin adjustment'}`;
    } else {
      isCredit = false;
      description = `Payment for ${p.purpose}`;
    }

    if (p.meta?.bookingNumber) {
      description += ` (Trip ${p.meta.bookingNumber})`;
    }

    return {
      _id: p._id,
      driver: {
        name: p.driverId?.name || 'Unknown',
        phone: p.driverId?.phone || '',
        profilePicture: p.driverId?.profilePicture || '',
        walletBalance: p.driverId?.wallet?.balance || 0,
      },
      type: isCredit ? 'CREDIT' : 'DEBIT',
      amount: p.amount,
      description,
      date: p.createdAt,
      status: p.status,
    };
  });

  return {
    data: formatted,
    pagination: {
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parsedLimit) || 1,
    },
  };
};

export const adjustDriverWalletService = async (driverId, amount, action, reason) => {
  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, 'Driver not found');

  const adjustAmount = Math.abs(Number(amount));
  if (isNaN(adjustAmount) || adjustAmount <= 0) {
    throw new ApiError(400, 'Invalid adjustment amount');
  }

  const isCredit = action === 'CREDIT';
  
  // 1. Update wallet balance
  const updateAmount = isCredit ? adjustAmount : -adjustAmount;
  await Driver.updateOne(
    { _id: driverId },
    { $inc: { 'wallet.balance': updateAmount } }
  );

  // 2. Create ledger payment record
  const paymentId = new mongoose.Types.ObjectId();
  const payment = await Payment.create({
    _id: paymentId,
    driverId,
    amount: adjustAmount,
    currency: 'INR',
    purpose: isCredit ? 'admin_adjustment_credit' : 'admin_adjustment_debit',
    status: 'captured', // valid enum for completed internal settlement
    provider: 'wallet', // from PAYMENT_PROVIDER.WALLET
    referenceId: paymentId, // satisfies required field without breaking unique index
    referenceModel: 'Payment',
    meta: {
      reason: reason || 'Manual admin adjustment',
    },
  });

  // 3. If DEBIT, route the deducted amount to PlatformRevenue
  if (!isCredit) {
    await PlatformRevenue.create({
      source: PLATFORM_REVENUE_SOURCE.ADMIN_ADJUSTMENT,
      amountRupees: adjustAmount,
      driverId,
      meta: {
        reason: reason || 'Manual admin deduction',
      },
    });
  }

  return { payment };
};

export const getUserWalletHistoryService = async (query) => {
  const { page = 1, limit = 10, type, search } = query;
  const parsedLimit = parseInt(limit, 10) || 10;
  const skip = (parseInt(page, 10) - 1) * parsedLimit;

  let filter = { userType: 'User' };

  if (type === 'credit') {
    filter.direction = 'credit';
  } else if (type === 'debit') {
    filter.direction = 'debit';
  }

  // Search by name or phone
  if (search) {
    const users = await User.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { phone_no: { $regex: search, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }

  const [total, txns] = await Promise.all([
    WalletTransaction.countDocuments(filter),
    WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('userId', 'name phone_no profilePicture wallet')
      .lean(),
  ]);

  const formatted = txns.map((t) => ({
    _id: t._id,
    user: {
      name: t.userId?.name || 'Unknown',
      phone: t.userId?.phone_no || '',
      profilePicture: t.userId?.profilePicture || '',
      walletBalance: t.userId?.wallet?.balance || 0,
    },
    type: t.direction.toUpperCase(), // 'CREDIT' or 'DEBIT'
    amount: t.amountRupees,
    description: t.description || t.source.replace(/_/g, ' '),
    date: t.createdAt,
    status: t.status,
  }));

  return {
    data: formatted,
    pagination: {
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parsedLimit) || 1,
    },
  };
};

export const adjustUserWalletService = async (staff, userId, amount, action, reason) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const adjustAmount = Math.abs(Number(amount));
  if (isNaN(adjustAmount) || adjustAmount <= 0) {
    throw new ApiError(400, 'Invalid adjustment amount');
  }

  if (action === 'CREDIT') {
    return await creditWalletService({
      userId,
      amount: adjustAmount,
      source: 'admin_credit',
      description: `Manual Credit: ${reason || 'Admin adjustment'}`,
      initiatedBy: staff._id,
    });
  } else {
    return await debitWalletService({
      userId,
      amount: adjustAmount,
      source: 'admin_debit',
      description: `Manual Debit: ${reason || 'Admin adjustment'}`,
      initiatedBy: staff._id,
      allowNegative: true, // Allow admins to deduct even if it sends balance negative
    });
  }
};

export const getDashboardStatsService = async () => {
  const [
    totalUsers,
    totalDrivers,
    recentDrivers,
    recentBookings,
  ] = await Promise.all([
    User.countDocuments({ role: USER_ROLES.USER, isDeleted: false }),
    Driver.countDocuments({}),
    Driver.find({}).sort({ createdAt: -1 }).limit(4).select('name phone approvalStatus createdAt profilePicture').lean(),
    Booking.find({}).sort({ createdAt: -1 }).limit(4).select('_id serviceType status createdAt').lean(),
  ]);

  // Bookings Today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const bookingsToday = await Booking.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  // Revenue this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const revenueAggregation = await PlatformRevenue.aggregate([
    { $match: { createdAt: { $gte: startOfMonth } } },
    { $group: { _id: null, total: { $sum: '$amountRupees' } } }
  ]);
  const revenueMonth = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;

  return {
    stats: {
      totalUsers,
      totalDrivers,
      bookingsToday,
      revenueMonth,
    },
    recentDrivers,
    recentBookings,
  };
};

const findUserByIdOrCustomId = async (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    const user = await User.findById(id);
    if (user) return user;
  }
  return await User.findOne({ userId: id });
};

export const suspendUserService = async (adminId, userId, reason) => {
  const user = await findUserByIdOrCustomId(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (user.isSuspended) {
    throw new ApiError(400, 'User is already suspended');
  }

  user.isSuspended = true;
  user.suspensionReason = (reason || '').trim();
  user.isActive = false;

  await user.save();
  return user;
};

export const unsuspendUserService = async (adminId, userId) => {
  const user = await findUserByIdOrCustomId(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.isSuspended) {
    throw new ApiError(400, 'User is not suspended');
  }

  user.isSuspended = false;
  user.suspensionReason = '';
  user.isActive = true;

  await user.save();
  return user;
};

export const toggleUserActiveService = async (adminId, userId, isActive) => {
  const user = await findUserByIdOrCustomId(userId);
  if (!user || user.isDeleted) {
    throw new ApiError(404, 'User not found');
  }

  user.isActive = typeof isActive === 'boolean' ? isActive : !user.isActive;
  await user.save();
  return user;
};

export const deleteUserService = async (adminId, userId) => {
  const user = await findUserByIdOrCustomId(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.isDeleted) {
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.isActive = false;
    await user.save();
  }

  return { id: user._id, message: 'User account deleted successfully' };
};

export const deleteDriverService = async (adminId, driverId) => {
  const findDriverByIdOrCustomId = async (id) => {
    if (!id) return null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      const d = await Driver.findById(id);
      if (d) return d;
    }
    return await Driver.findOne({ driverId: id });
  };

  const driver = await findDriverByIdOrCustomId(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  if (!driver.isDeleted) {
    driver.isDeleted = true;
    driver.deletedAt = new Date();
    driver.isOnline = false;
    driver.approvalStatus = 'rejected';
    await driver.save();
  }

  return { id: driver._id, message: 'Driver account deleted successfully' };
};

