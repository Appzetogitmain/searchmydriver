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

import {
  getStaffScope,
  assertStaffCanAccessDriver,
} from '../utils/staffScope.util.js';

export const loginStaffService = async (email, password) => {
  if (!email || !password) {
    throw new ApiError(400, 'Email and password required');
  }
  console.log("email and password is ", email, password);
  const staff = await User.findOne({ email: email.toLowerCase() })
    .populate('assignedZones', 'name city code')
    .select('+password');
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
  const staff = await User.findById(staffId)
    .populate('assignedZones', 'name city code')
    .select('-password');
  if (!staff || staff.isDeleted || !STAFF_ROLES.includes(staff.role)) {
    throw new ApiError(404, 'Profile not found');
  }
  return staff;
};

export const getCustomersService = async (staff, query = {}) => {
  const { search, page = 1, limit = 10, city } = query;

  const staffScope = await getStaffScope(staff);
  if (staffScope.isScoped && staffScope.isEmptyScope) {
    return {
      data: [],
      pagination: {
        total: 0,
        page: parseInt(page, 10) || 1,
        pages: 1,
      },
    };
  }

  const filter = { role: USER_ROLES.USER, isDeleted: { $ne: true } };

  if (staffScope.isScoped) {
    const matchingBookingsUserIds = staffScope.zoneObjectIds.length > 0
      ? await Booking.distinct('userId', { zoneIds: { $in: staffScope.zoneObjectIds } })
      : [];

    const userScopeConditions = [];
    if (staffScope.cityRegexes.length > 0) {
      userScopeConditions.push({ city: { $in: staffScope.cityRegexes } });
    }
    if (matchingBookingsUserIds.length > 0) {
      userScopeConditions.push({ _id: { $in: matchingBookingsUserIds } });
    }

    if (userScopeConditions.length > 0) {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: userScopeConditions });
    } else {
      return {
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page, 10) || 1,
          pages: 1,
        },
      };
    }
  }

  // Location filter (via City Dropdown)
  if (city && typeof city === 'string' && city.trim() && city.trim().toLowerCase() !== 'all') {
    const c = city.trim();
    const cityRegex = new RegExp(`^${c}$`, 'i');

    const bookingUserIds = await Booking.distinct('userId', {
      $or: [
        { city: cityRegex },
        { 'pickup.address': { $regex: c, $options: 'i' } },
      ],
    });

    const cityFilter = {
      $or: [
        { city: cityRegex },
        { 'savedLocations.city': cityRegex },
        { 'savedAddresses.city': cityRegex },
      ],
    };

    if (bookingUserIds.length > 0) {
      cityFilter.$or.push({ _id: { $in: bookingUserIds } });
    }

    if (filter.$and) {
      filter.$and.push(cityFilter);
    } else {
      filter.$and = [cityFilter];
    }
  }

  // General & Location-wise search
  if (search) {
    const s = String(search).trim();
    const matchingCityBookingUserIds = await Booking.distinct('userId', {
      $or: [
        { city: { $regex: s, $options: 'i' } },
        { 'pickup.address': { $regex: s, $options: 'i' } },
      ],
    });

    const searchFilter = {
      $or: [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone_no: { $regex: s, $options: 'i' } },
        { userId: { $regex: s, $options: 'i' } },
        { city: { $regex: s, $options: 'i' } },
        { 'savedLocations.city': { $regex: s, $options: 'i' } },
        { 'savedLocations.address': { $regex: s, $options: 'i' } },
        { 'savedAddresses.city': { $regex: s, $options: 'i' } },
        { 'savedAddresses.address': { $regex: s, $options: 'i' } },
      ],
    };

    if (matchingCityBookingUserIds.length > 0) {
      searchFilter.$or.push({ _id: { $in: matchingCityBookingUserIds } });
    }

    if (mongoose.Types.ObjectId.isValid(s)) {
      searchFilter.$or.push({ _id: s });
    }
    if (filter.$and) {
      filter.$and.push(searchFilter);
    } else {
      filter.$and = [searchFilter];
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

  const staffScope = await getStaffScope(staff);
  if (staffScope.isScoped && staffScope.isEmptyScope) {
    return { data: [], pagination: { total: 0, page: parseInt(page, 10) || 1, pages: 1 } };
  }

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

  // Enforce zone/city restrictions for scoped staff
  if (staffScope.isScoped) {
    const scopeOr = [];
    if (staffScope.cityRegexes.length > 0) {
      scopeOr.push({ city: { $in: staffScope.cityRegexes } });
      scopeOr.push({ 'address.city': { $in: staffScope.cityRegexes } });
    }
    if (staffScope.zoneObjectIds.length > 0) {
      scopeOr.push({ homeZone: { $in: staffScope.zoneObjectIds } });
    }
    if (scopeOr.length > 0) {
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: scopeOr }];
        delete filter.$or;
      } else {
        filter.$or = scopeOr;
      }
    }
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

  await assertStaffCanAccessDriver(staff, driver);

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

  await assertStaffCanAccessDriver(staff, driver);

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

export const suspendDriverService = async (staffOrId, driverId, data = {}) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const staff = (staffOrId && typeof staffOrId === 'object' && staffOrId.role)
    ? staffOrId
    : await User.findById(staffOrId);
  await assertStaffCanAccessDriver(staff, driver);

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

export const unsuspendDriverService = async (staffOrId, driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const staff = (staffOrId && typeof staffOrId === 'object' && staffOrId.role)
    ? staffOrId
    : await User.findById(staffOrId);
  await assertStaffCanAccessDriver(staff, driver);

  if (driver.approvalStatus !== 'suspended') {
    throw new ApiError(400, 'Driver is not suspended');
  }

  driver.approvalStatus = 'approved';
  if (!driver.approvedAt) {
    driver.approvedAt = new Date();
  }
  if (!driver.approvedBy) {
    driver.approvedBy = staff?._id || staffOrId;
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

  await assertStaffCanAccessDriver(staff, driver);

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

  await assertStaffCanAccessDriver(staff, driver);

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
 * Drops `null`/`undefined` and anything that can't be coerced.
 */
function normalizeAssignedZones(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id?._id || id));
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
    assignedZones:
      [USER_ROLES.SUB_ADMIN, USER_ROLES.TEAM_MEMBER].includes(role)
        ? normalizeAssignedZones(assignedZones)
        : [],
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
    .populate('assignedZones', 'name city code')
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
  if (assignedZones !== undefined) {
    staff.assignedZones =
      [USER_ROLES.SUB_ADMIN, USER_ROLES.TEAM_MEMBER].includes(staff.role)
        ? normalizeAssignedZones(assignedZones)
        : [];
  } else if (![USER_ROLES.SUB_ADMIN, USER_ROLES.TEAM_MEMBER].includes(staff.role) && staff.assignedZones?.length) {
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

export const getIncomingRegistrationsService = async (staff, query = {}) => {
  const { page = 1, limit = 10 } = query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const parsedLimit = parseInt(limit, 10);

  const staffScope = await getStaffScope(staff);
  if (staffScope.isScoped && staffScope.isEmptyScope) {
    return {
      drivers: { data: [], pagination: { total: 0, page: parseInt(page, 10) || 1, pages: 1 } },
      users: { data: [], pagination: { total: 0, page: parseInt(page, 10) || 1, pages: 1 } },
    };
  }

  // 1. Fetch incomplete drivers
  const driverFilter = {
    isDeleted: false,
    $or: [{ approvalStatus: 'pending' }, { onboardingStep: { $lt: 6 } }],
  };

  if (staffScope.isScoped) {
    const scopeOr = [];
    if (staffScope.cityRegexes.length > 0) {
      scopeOr.push({ city: { $in: staffScope.cityRegexes } });
      scopeOr.push({ 'address.city': { $in: staffScope.cityRegexes } });
    }
    if (staffScope.zoneObjectIds.length > 0) {
      scopeOr.push({ homeZone: { $in: staffScope.zoneObjectIds } });
    }
    if (scopeOr.length > 0) {
      driverFilter.$and = [{ $or: scopeOr }];
    }
  }

  const totalDrivers = await Driver.countDocuments(driverFilter);
  const incompleteDrivers = await Driver.find(driverFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parsedLimit)
    .lean();

  // 2. Fetch incomplete users
  const userFilter = { role: 'user', isDeleted: false };
  if (staffScope.isScoped && staffScope.cityRegexes.length > 0) {
    userFilter.city = { $in: staffScope.cityRegexes };
  }

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

export const getDriverWalletHistoryService = async (staff, query = {}) => {
  const { page = 1, limit = 20, type = 'all', search = '' } = query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const parsedLimit = parseInt(limit, 10);

  const staffScope = await getStaffScope(staff);
  if (staffScope.isScoped && staffScope.isEmptyScope) {
    return { data: [], pagination: { total: 0, page: parseInt(page, 10) || 1, pages: 1 } };
  }

  const filter = { driverId: { $ne: null } };

  if (type === 'withdrawals') {
    filter.purpose = 'withdrawal';
  } else if (type === 'transactions') {
    filter.purpose = { $ne: 'withdrawal' };
  }

  if (staffScope.isScoped) {
    const scopedDrivers = await Driver.find({
      isDeleted: { $ne: true },
      $or: [
        { city: { $in: staffScope.cityRegexes } },
        { 'address.city': { $in: staffScope.cityRegexes } },
        { homeZone: { $in: staffScope.zoneObjectIds } },
      ],
    }).select('_id').lean();
    const scopedDriverIds = scopedDrivers.map((d) => d._id);
    filter.driverId = { $in: scopedDriverIds };
  }

  // If search is provided, we need to lookup driver by name/phone.
  if (search) {
    const searchFilter = {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ],
    };
    const drivers = await Driver.find(searchFilter)
      .select('_id')
      .lean();
    const searchedDriverIds = drivers.map((d) => d._id);

    if (filter.driverId && Array.isArray(filter.driverId.$in)) {
      const allowedSet = new Set(filter.driverId.$in.map(String));
      filter.driverId = { $in: searchedDriverIds.filter((id) => allowedSet.has(String(id))) };
    } else {
      filter.driverId = { $in: searchedDriverIds };
    }
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

export const getUserWalletHistoryService = async (staff, query = {}) => {
  const { page = 1, limit = 10, type, search } = query;
  const parsedLimit = parseInt(limit, 10) || 10;
  const skip = (parseInt(page, 10) - 1) * parsedLimit;

  const staffScope = await getStaffScope(staff);
  if (staffScope.isScoped && staffScope.isEmptyScope) {
    return { data: [], pagination: { total: 0, page: parseInt(page, 10) || 1, pages: 1 } };
  }

  let filter = { userType: 'User' };

  if (type === 'credit') {
    filter.direction = 'credit';
  } else if (type === 'debit') {
    filter.direction = 'debit';
  }

  if (staffScope.isScoped && staffScope.cityRegexes.length > 0) {
    const scopedUsers = await User.find({
      role: USER_ROLES.USER,
      isDeleted: { $ne: true },
      city: { $in: staffScope.cityRegexes },
    }).select('_id').lean();
    filter.userId = { $in: scopedUsers.map((u) => u._id) };
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
    const searchedUserIds = users.map((u) => u._id);

    if (filter.userId && Array.isArray(filter.userId.$in)) {
      const allowedSet = new Set(filter.userId.$in.map(String));
      filter.userId = { $in: searchedUserIds.filter((id) => allowedSet.has(String(id))) };
    } else {
      filter.userId = { $in: searchedUserIds };
    }
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

export const getDashboardStatsService = async (staff = null) => {
  const staffScope = await getStaffScope(staff);

  const userFilter = { role: USER_ROLES.USER, isDeleted: false };
  const driverFilter = { isDeleted: { $ne: true } };
  const bookingFilter = { isDeleted: false };

  if (staffScope.isScoped) {
    if (staffScope.isEmptyScope) {
      return {
        stats: {
          totalUsers: 0,
          totalDrivers: 0,
          bookingsToday: 0,
          revenueMonth: 0,
        },
        recentDrivers: [],
        recentBookings: [],
      };
    }

    if (staffScope.cityRegexes.length > 0) {
      userFilter.city = { $in: staffScope.cityRegexes };
    }

    const driverOr = [];
    if (staffScope.cityRegexes.length > 0) {
      driverOr.push({ city: { $in: staffScope.cityRegexes } });
      driverOr.push({ 'address.city': { $in: staffScope.cityRegexes } });
    }
    if (staffScope.zoneObjectIds.length > 0) {
      driverOr.push({ homeZone: { $in: staffScope.zoneObjectIds } });
    }
    if (driverOr.length > 0) {
      driverFilter.$or = driverOr;
    }

    if (staffScope.zoneObjectIds.length > 0) {
      bookingFilter.zoneIds = { $in: staffScope.zoneObjectIds };
    }
  }

  const [
    totalUsers,
    totalDrivers,
    recentDrivers,
    recentBookings,
  ] = await Promise.all([
    User.countDocuments(userFilter),
    Driver.countDocuments(driverFilter),
    Driver.find(driverFilter).sort({ createdAt: -1 }).limit(4).select('name phone approvalStatus createdAt profilePicture city').lean(),
    Booking.find(bookingFilter).sort({ createdAt: -1 }).limit(4).select('_id serviceType status createdAt bookingNumber pickup').lean(),
  ]);

  // Bookings Today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const bookingsToday = await Booking.countDocuments({
    ...bookingFilter,
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  // Revenue this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const revenueMatch = {
    createdAt: { $gte: startOfMonth },
  };

  if (staffScope.isScoped && staffScope.zoneObjectIds.length > 0) {
    const zoneBookingIds = await Booking.distinct('_id', { zoneIds: { $in: staffScope.zoneObjectIds } });
    revenueMatch.bookingId = { $in: zoneBookingIds };
  }

  const revenueAggregation = await PlatformRevenue.aggregate([
    { $match: revenueMatch },
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

export const deleteDriverService = async (staffOrId, driverId) => {
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

  const staff = (staffOrId && typeof staffOrId === 'object' && staffOrId.role)
    ? staffOrId
    : await User.findById(staffOrId);
  await assertStaffCanAccessDriver(staff, driver);

  if (!driver.isDeleted) {
    driver.isDeleted = true;
    driver.deletedAt = new Date();
    driver.isOnline = false;
    driver.approvalStatus = 'rejected';
    await driver.save();
  }

  return { id: driver._id, message: 'Driver account deleted successfully' };
};

