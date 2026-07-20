import mongoose from 'mongoose';

const broadcastSchema = new mongoose.Schema(
  {
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    audience: {
      type: String,
      required: true,
      enum: ['all_users', 'all_drivers', 'all', 'specific_user', 'specific_driver', 'city_users', 'city_drivers', 'zone_drivers'],
    },
    targetCity: {
      type: String,
      default: null,
      trim: true,
    },
    targetZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      default: null,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    recipientModel: {
      type: String,
      enum: ['User', 'Driver', null],
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info',
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'partial', 'failed'],
      default: 'sent',
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying by history
broadcastSchema.index({ createdAt: -1 });

export const Broadcast = mongoose.models.Broadcast || mongoose.model('Broadcast', broadcastSchema);
