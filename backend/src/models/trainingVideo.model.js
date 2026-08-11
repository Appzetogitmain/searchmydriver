import mongoose from 'mongoose';

const trainingVideoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    videoType: {
      type: String,
      enum: ['upload', 'youtube'],
      default: 'upload',
    },
    videoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    youtubeId: {
      type: String,
      default: '',
      trim: true,
    },
    cloudinaryPublicId: {
      type: String,
      default: '',
      trim: true,
    },
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

const TrainingVideo =
  mongoose.models.TrainingVideo || mongoose.model('TrainingVideo', trainingVideoSchema);

export default TrainingVideo;
