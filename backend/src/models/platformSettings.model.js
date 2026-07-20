import mongoose from 'mongoose';

const platformSettingsSchema = new mongoose.Schema(
  {
    cashCancelFeeThresholdMinutes: { type: Number, default: 30, min: 0 },
    cashCancelFeeAmount: { type: Number, default: 50, min: 0 },
    driverCancelFeeAmount: { type: Number, default: 50, min: 0 },
    noKitPenaltyAmount: { type: Number, default: 50, min: 0 },
    monthlyRideRegistrationFee: { type: Number, default: 2000, min: 0 },
    outstationMinWalletBalance: { type: Number, default: 1000, min: 0 },
    adminWalletBalance: { type: Number, default: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    supportEmail: { type: String, default: 'support@searchmydriver.com', trim: true },
    supportPhone: { type: String, default: '18001234567', trim: true },
    referral: {
      user: {
        enabled: { type: Boolean, default: false },
        rewardAmount: { type: Number, default: 100, min: 0 },
        signupBonus: { type: Number, default: 0, min: 0 },
        minRideAmountForEligibility: { type: Number, default: 0, min: 0 },
        walletExpiryDays: { type: Number, default: 365, min: 0 },
        maxWalletUsagePercentage: { type: Number, default: 10, min: 0, max: 100 },
        validityDays: { type: Number, default: 30, min: 0 },
        autoApproveRewards: { type: Boolean, default: true },
      },
      driver: {
        enabled: { type: Boolean, default: false },
        rewardAmount: { type: Number, default: 100, min: 0 },
        signupBonus: { type: Number, default: 0, min: 0 },
        minCompletedTripsForEligibility: { type: Number, default: 1, min: 0 },
        minEarningsForEligibility: { type: Number, default: 0, min: 0 },
        walletExpiryDays: { type: Number, default: 365, min: 0 },
        maxWalletUsagePercentage: { type: Number, default: 10, min: 0, max: 100 },
        validityDays: { type: Number, default: 30, min: 0 },
        autoApproveRewards: { type: Boolean, default: true },
        withdrawalRules: { type: String, default: 'Minimum withdrawal \u20b9500' },
      },
    },
    ratingQuestions: {
      type: [
        {
          id: { type: String, required: true },
          question: { type: String, required: true },
          type: { type: String, enum: ['boolean', 'scale', 'text'], default: 'boolean' },
          isActive: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    driverRatingQuestions: {
      type: [
        {
          id: { type: String, required: true },
          question: { type: String, required: true },
          type: { type: String, enum: ['boolean', 'scale', 'text'], default: 'boolean' },
          isActive: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const PlatformSettings = mongoose.models.PlatformSettings || mongoose.model('PlatformSettings', platformSettingsSchema);

export default PlatformSettings;
