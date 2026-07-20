import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema(
  {
    userType: {
      type: String,
      enum: ['Driver', 'User'],
      required: true,
      default: 'Driver',
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    payoutMethod: {
      type: String,
      enum: ['bank', 'upi'],
      required: true,
    },
    payoutDetails: {
      type: String,
      required: true,
      maxlength: 500,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    transactionRef: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const WithdrawalRequest =
  mongoose.models.WithdrawalRequest ||
  mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

export default WithdrawalRequest;
