import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import {
  getWalletService,
  listWalletTransactionsService,
  createTopupOrderService,
  verifyTopupPaymentService,
  WALLET_LIMITS,
} from '../services/wallet.service.js';

/**
 * User-facing wallet endpoints.
 *
 *   GET    /auth/wallet                 → current balance + lifetime totals
 *   GET    /auth/wallet/transactions    → paginated ledger
 *   POST   /auth/wallet/topup           → start a Razorpay top-up order
 *   POST   /auth/wallet/topup/verify    → confirm Razorpay payment → credit
 */

export const getMyWallet = asyncHandler(async (req, res) => {
  const userEntity = req.user || req.driver;
  const userType = req.driver ? 'Driver' : 'User';
  const wallet = await getWalletService(userEntity._id, userType);
  return res
    .status(200)
    .json(new ApiResponse(200, { wallet, limits: WALLET_LIMITS }, 'Wallet fetched'));
});

export const getMyWalletTransactions = asyncHandler(async (req, res) => {
  const userEntity = req.user || req.driver;
  const userType = req.driver ? 'Driver' : 'User';
  const result = await listWalletTransactionsService(userEntity._id, {
    page: req.query.page,
    limit: req.query.limit,
    userType,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Wallet transactions fetched'));
});

export const createWalletTopupOrder = asyncHandler(async (req, res) => {
  const userEntity = req.user || req.driver;
  const userType = req.driver ? 'Driver' : 'User';
  const order = await createTopupOrderService(userEntity._id, req.body?.amount, userType);
  return res
    .status(201)
    .json(new ApiResponse(201, { razorpay: order }, 'Top-up order created'));
});

export const verifyWalletTopupPayment = asyncHandler(async (req, res) => {
  const userEntity = req.user || req.driver;
  const userType = req.driver ? 'Driver' : 'User';
  const result = await verifyTopupPaymentService(userEntity._id, { ...(req.body || {}), userType });
  return res
    .status(200)
    .json(new ApiResponse(200, result, 'Top-up successful'));
});

import WithdrawalRequest from '../models/withdrawalRequest.model.js';
import WalletTransaction, { WALLET_TXN_DIRECTION, WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import { debitWalletService } from '../services/wallet.service.js';
import { emitNotification } from '../utils/socketEmitters.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';

export const requestWithdrawal = asyncHandler(async (req, res) => {
  const userEntity = req.user || req.driver;
  const userType = req.driver ? 'Driver' : 'User';
  const userId = userEntity._id;
  const { amount, payoutMethod, payoutDetails } = req.body;

  if (!amount || amount <= 0 || !payoutMethod || !payoutDetails) {
    return res.status(400).json(new ApiResponse(400, null, 'Invalid withdrawal request details'));
  }

  const withdrawal = new WithdrawalRequest({
    userType,
    ...(userType === 'Driver' ? { driverId: userId } : { userId }),
    amount,
    payoutMethod,
    payoutDetails,
    status: 'pending',
  });

  // Validate before deducting
  await withdrawal.validate();

  // Deduct immediately, if rejected admin will refund
  const transaction = await debitWalletService({
    userId,
    userType,
    amount,
    source: WALLET_TXN_SOURCE.WITHDRAWAL,
    description: `Withdrawal request via ${payoutMethod}`,
  });

  // Link transaction to the withdrawal request
  transaction.refType = 'WithdrawalRequest';
  transaction.refId = withdrawal._id;
  
  await withdrawal.save();
  await transaction.save();

  // Notify admins
  emitNotification(
    { admin: true },
    {
      title: 'New Withdrawal Request',
      body: `${userEntity.name} (${userType}) has requested a withdrawal of \u20B9${amount}.`,
      data: { withdrawalId: withdrawal._id, userType },
      severity: 'info',
    }
  );

  return res.status(201).json(new ApiResponse(201, { withdrawal }, 'Withdrawal request submitted successfully'));
});

export const updateBankDetails = asyncHandler(async (req, res) => {
  const userEntity = req.user || req.driver;
  const userType = req.driver ? 'Driver' : 'User';
  const userId = userEntity._id;
  const { accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;

  if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
    return res.status(400).json(new ApiResponse(400, null, 'Please provide all required bank details'));
  }

  const Model = userType === 'Driver' ? Driver : User;
  
  const updated = await Model.findByIdAndUpdate(
    userId,
    {
      $set: {
        bankDetails: { accountHolderName, accountNumber, ifscCode, bankName, upiId },
      },
    },
    { new: true, runValidators: true }
  ).select('bankDetails name');

  if (!updated) {
    return res.status(404).json(new ApiResponse(404, null, `${userType} not found`));
  }

  return res.status(200).json(new ApiResponse(200, { bankDetails: updated.bankDetails }, 'Bank details updated successfully'));
});

export const getMyWithdrawals = asyncHandler(async (req, res) => {
  const userEntity = req.user || req.driver;
  const userType = req.driver ? 'Driver' : 'User';
  const userId = userEntity._id;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const query = userType === 'Driver' ? { driverId: userId } : { userId };

  const [withdrawals, total] = await Promise.all([
    WithdrawalRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WithdrawalRequest.countDocuments(query),
  ]);

  const hasMore = skip + withdrawals.length < total;

  return res.status(200).json(
    new ApiResponse(
      200,
      { withdrawals, hasMore, total },
      'Withdrawals fetched successfully',
    ),
  );
});
