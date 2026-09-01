import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AUDIENCES, setAuthCookies } from '../utils/cookie.util.js';
import * as adminService from '../services/admin.service.js';
import { ApiError } from '../utils/apiError.js';

export const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await adminService.loginStaffService(email, password);

  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  }, AUDIENCES.ADMIN);

  return res.status(200).json(new ApiResponse(200, { admin: result.admin }, 'Staff login successful'));
});

export const getStaffMe = asyncHandler(async (req, res) => {
  const admin = await adminService.getStaffProfileService(req.staff._id);
  return res.status(200).json(new ApiResponse(200, { admin }, 'Profile fetched successfully'));
});

export const getCustomers = asyncHandler(async (req, res) => {
  const result = await adminService.getCustomersService(req.staff, req.query);
  return res.status(200).json(new ApiResponse(200, result, 'Users fetched successfully'));
});

export const getDrivers = asyncHandler(async (req, res) => {
  const result = await adminService.getDriversService(req.staff, req.query);
  return res.status(200).json(new ApiResponse(200, result, "Drivers fetched successfully"));
});

export const getDriverById = asyncHandler(async (req, res) => {
  const result = await adminService.getDriverByIdService(req.staff, req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Driver profile fetched successfully'));
});

export const updateDriverStatus = asyncHandler(async (req, res) => {
  const result = await adminService.updateDriverStatusService(req.staff, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, `Driver status updated successfully`));
});

export const suspendDriver = asyncHandler(async (req, res) => {
  const result = await adminService.suspendDriverService(req.staff, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Driver suspended successfully'));
});

export const unsuspendDriver = asyncHandler(async (req, res) => {
  const result = await adminService.unsuspendDriverService(req.staff, req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Driver unsuspended successfully'));
});

export const updateDriverDocument = asyncHandler(async (req, res) => {
  const result = await adminService.updateDriverDocumentService(req.staff, req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, 'Driver document updated successfully'));
});

export const deleteDriverDocument = asyncHandler(async (req, res) => {
  const result = await adminService.deleteDriverDocumentService(req.staff, req.params.id, req.params.docId);
  return res.status(200).json(new ApiResponse(200, result, 'Driver document deleted successfully'));
});

export const suspendUser = asyncHandler(async (req, res) => {
  const result = await adminService.suspendUserService(req.staff._id, req.params.id, req.body.reason);
  return res.status(200).json(new ApiResponse(200, result, 'User suspended successfully'));
});

export const unsuspendUser = asyncHandler(async (req, res) => {
  const result = await adminService.unsuspendUserService(req.staff._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'User unsuspended successfully'));
});

export const toggleUserActive = asyncHandler(async (req, res) => {
  const result = await adminService.toggleUserActiveService(req.staff._id, req.params.id, req.body.isActive);
  return res.status(200).json(new ApiResponse(200, result, 'User status updated successfully'));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const result = await adminService.deleteUserService(req.staff._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'User deleted successfully'));
});

export const deleteDriver = asyncHandler(async (req, res) => {
  const result = await adminService.deleteDriverService(req.staff, req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Driver deleted successfully'));
});


export const addAdminMember = asyncHandler(async (req, res) => {
  const result = await adminService.addAdminMemberService(req.body);
  return res.status(201).json(new ApiResponse(201, result, "Admin team member added successfully"));
});

export const getAdminTeam = asyncHandler(async (req, res) => {
  const result = await adminService.getAdminTeamService(req.query);
  return res.status(200).json(new ApiResponse(200, result, "Admin team fetched successfully"));
});

export const updateAdminMember = asyncHandler(async (req, res) => {
  const result = await adminService.updateAdminMemberService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, result, "Admin team member updated successfully"));
});

export const deleteAdminMember = asyncHandler(async (req, res) => {
  const result = await adminService.deleteAdminMemberService(req.params.id);
  return res.status(200).json(new ApiResponse(200, result, "Admin team member removed successfully"));
});

export const getIncomingRegistrations = asyncHandler(async (req, res) => {
  const result = await adminService.getIncomingRegistrationsService(req.staff, req.query);
  return res.status(200).json(new ApiResponse(200, result, "Incoming registrations fetched successfully"));
});

export const getDriverWalletHistory = asyncHandler(async (req, res) => {
  const result = await adminService.getDriverWalletHistoryService(req.staff, req.query);
  return res.status(200).json(new ApiResponse(200, result, "Driver wallet history fetched successfully"));
});

export const adjustDriverWallet = asyncHandler(async (req, res) => {
  const { driverId, amount, action, reason } = req.body;
  if (!driverId || !amount || !action) {
    throw new ApiError(400, 'driverId, amount, and action are required');
  }

  const result = await adminService.adjustDriverWalletService(driverId, amount, action, reason);
  return res.status(200).json(new ApiResponse(200, result, 'Driver wallet adjusted successfully'));
});

export const getUserWalletHistory = asyncHandler(async (req, res) => {
  const result = await adminService.getUserWalletHistoryService(req.staff, req.query);
  return res.status(200).json(new ApiResponse(200, result, "User wallet history fetched successfully"));
});

export const adjustUserWallet = asyncHandler(async (req, res) => {
  const { userId, amount, action, reason } = req.body;
  if (!userId || !amount || !action) {
    throw new ApiError(400, 'userId, amount, and action are required');
  }

  const result = await adminService.adjustUserWalletService(req.staff, userId, amount, action, reason);
  return res.status(200).json(new ApiResponse(200, result, 'User wallet adjusted successfully'));
});

export const getDashboardStats = asyncHandler(async (req, res) => {
  const result = await adminService.getDashboardStatsService(req.staff);
  return res.status(200).json(new ApiResponse(200, result, "Dashboard stats fetched successfully"));
});
