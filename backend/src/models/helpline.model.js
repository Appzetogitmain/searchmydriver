import mongoose from 'mongoose';

const helplineSchema = new mongoose.Schema(
  {
    cityName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: 'Emergency Support',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

helplineSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model('Helpline', helplineSchema);
