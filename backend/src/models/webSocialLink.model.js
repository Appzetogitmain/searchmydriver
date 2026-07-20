import mongoose from 'mongoose';

const webSocialLinkSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      required: true,
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

webSocialLinkSchema.index({ isActive: 1, sortOrder: 1 });

const WebSocialLink = mongoose.models.WebSocialLink || mongoose.model('WebSocialLink', webSocialLinkSchema);

export default WebSocialLink;
