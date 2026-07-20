import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import WebSocialLink from '../models/webSocialLink.model.js';

const INITIAL_SOCIALS = [
  { platform: 'Facebook', url: 'https://facebook.com', icon: 'facebook', sortOrder: 0 },
  { platform: 'Twitter', url: 'https://twitter.com', icon: 'twitter', sortOrder: 1 },
  { platform: 'Instagram', url: 'https://instagram.com', icon: 'instagram', sortOrder: 2 },
  { platform: 'LinkedIn', url: 'https://linkedin.com', icon: 'linkedin', sortOrder: 3 },
  { platform: 'YouTube', url: 'https://youtube.com', icon: 'youtube', sortOrder: 4 },
];

const seedSocialsIfNeeded = async () => {
  const count = await WebSocialLink.countDocuments();
  if (count === 0) {
    await WebSocialLink.create(INITIAL_SOCIALS);
    console.log('[seeder] Dynamic website social links seeded successfully');
  }
};

export const adminListSocials = asyncHandler(async (req, res) => {
  await seedSocialsIfNeeded();
  const socials = await WebSocialLink.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  return res.status(200).json(new ApiResponse(200, socials, 'Social links fetched successfully'));
});

export const adminCreateSocial = asyncHandler(async (req, res) => {
  const { platform, url, icon, sortOrder, isActive } = req.body;
  if (!platform || !url || !icon) {
    throw new ApiError(400, 'Platform, URL, and Icon are required');
  }

  const social = await WebSocialLink.create({
    platform,
    url,
    icon,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
    isActive: isActive !== false,
  });

  return res.status(201).json(new ApiResponse(201, social, 'Social link created successfully'));
});

export const adminUpdateSocial = asyncHandler(async (req, res) => {
  const { platform, url, icon, sortOrder, isActive } = req.body;
  const social = await WebSocialLink.findById(req.params.id);
  if (!social) {
    throw new ApiError(404, 'Social link not found');
  }

  social.platform = platform ?? social.platform;
  social.url = url ?? social.url;
  social.icon = icon ?? social.icon;
  social.sortOrder = sortOrder !== undefined ? Number(sortOrder) : social.sortOrder;
  social.isActive = isActive !== undefined ? isActive : social.isActive;

  await social.save();

  return res.status(200).json(new ApiResponse(200, social, 'Social link updated successfully'));
});

export const adminDeleteSocial = asyncHandler(async (req, res) => {
  const social = await WebSocialLink.findById(req.params.id);
  if (!social) {
    throw new ApiError(404, 'Social link not found');
  }

  await social.deleteOne();
  return res.status(200).json(new ApiResponse(200, null, 'Social link deleted successfully'));
});

export const listActiveSocials = asyncHandler(async (req, res) => {
  await seedSocialsIfNeeded();
  const socials = await WebSocialLink.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  return res.status(200).json(new ApiResponse(200, socials, 'Active social links fetched successfully'));
});
