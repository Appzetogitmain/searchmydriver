import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  getAdminWalletStateService,
  addFundsDummyService,
  withdrawFundsService,
  manualAdjustmentService,
} from '../services/adminWallet.service.js';

export const getAdminWalletState = asyncHandler(async (req, res) => {
  const state = await getAdminWalletStateService(req.query);
  return res.status(200).json(new ApiResponse(200, state, 'Admin wallet state fetched'));
});

export const addFunds = asyncHandler(async (req, res) => {
  const { amount, note } = req.body;
  const result = await addFundsDummyService(req.staff._id, amount, note);
  return res.status(200).json(new ApiResponse(200, result, 'Funds added successfully'));
});

export const withdrawFunds = asyncHandler(async (req, res) => {
  const { amount, note } = req.body;
  const result = await withdrawFundsService(req.staff._id, amount, note);
  return res.status(200).json(new ApiResponse(200, result, 'Funds withdrawn successfully'));
});

export const manualAdjustment = asyncHandler(async (req, res) => {
  const { amount, type, note } = req.body;
  const result = await manualAdjustmentService(req.staff._id, amount, type, note);
  return res.status(200).json(new ApiResponse(200, result, 'Manual adjustment successful'));
});
