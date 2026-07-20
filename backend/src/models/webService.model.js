import mongoose from 'mongoose';

const webServiceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    subtitle: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    iconName: {
      type: String,
      required: true,
      default: 'Clock',
      trim: true,
    },
    features: [
      {
        type: String,
        trim: true,
      },
    ],
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
  { timestamps: true },
);

webServiceSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model('WebService', webServiceSchema);
