import CarType from '../models/carType.model.js';
import PlatformCondition from '../models/platformCondition.model.js';
import TrainingVideo from '../models/trainingVideo.model.js';
import { ApiError } from '../utils/apiError.js';
import { deleteFromCloudinary } from '../utils/cloudinary.js';

// ─── Car Types ────────────────────────────────────────────────────────────────

export const createCarTypeService = async (data) => {
  const { name, description, image } = data;
  if (!name) throw new ApiError(400, 'Car type name is required');
  
  const exists = await CarType.findOne({ name });
  if (exists) throw new ApiError(400, 'Car type already exists');

  return await CarType.create({ name, description, image });
};

export const getAllCarTypesService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return await CarType.find(filter).sort({ name: 1 });
};

export const updateCarTypeService = async (id, data) => {
  const carType = await CarType.findByIdAndUpdate(id, data, { new: true });
  if (!carType) throw new ApiError(404, 'Car type not found');
  return carType;
};

export const deleteCarTypeService = async (id) => {
  const carType = await CarType.findByIdAndDelete(id);
  if (!carType) throw new ApiError(404, 'Car type not found');
  return { id };
};

// ─── Platform Conditions (Checklist) ──────────────────────────────────────────

export const createConditionService = async (data) => {
  const { question, key, isRequired } = data;
  if (!question || !key) throw new ApiError(400, 'Question and key are required');

  const exists = await PlatformCondition.findOne({ key: key.toLowerCase() });
  if (exists) throw new ApiError(400, 'Condition key already exists');

  return await PlatformCondition.create({ question, key: key.toLowerCase(), isRequired });
};

export const getAllConditionsService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return await PlatformCondition.find(filter).sort({ createdAt: 1 });
};

export const updateConditionService = async (id, data) => {
  const condition = await PlatformCondition.findByIdAndUpdate(id, data, { new: true });
  if (!condition) throw new ApiError(404, 'Condition not found');
  return condition;
};

export const deleteConditionService = async (id) => {
  const condition = await PlatformCondition.findByIdAndDelete(id);
  if (!condition) throw new ApiError(404, 'Condition not found');
  return { id };
};

// ─── Driver training videos ───────────────────────────────────────────────────

export function extractYouTubeId(url) {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : '';
}

export const createTrainingVideoService = async (data) => {
  const { title, description, videoUrl, videoType, youtubeId, cloudinaryPublicId, durationSeconds, isRequired, isActive, sortOrder } = data;

  if (!title || !videoUrl) {
    throw new ApiError(400, 'Title and video URL are required');
  }

  const extractedYtId = extractYouTubeId(videoUrl);
  const isYt = videoType === 'youtube' || Boolean(extractedYtId);
  const finalType = isYt ? 'youtube' : 'upload';
  const finalYtId = isYt ? (youtubeId || extractedYtId) : '';
  const finalVideoUrl = isYt && finalYtId ? `https://www.youtube.com/embed/${finalYtId}` : videoUrl;

  if (finalType === 'upload' && !cloudinaryPublicId) {
    throw new ApiError(400, 'Cloudinary ID is required for uploaded video files');
  }

  return TrainingVideo.create({
    title,
    description,
    videoType: finalType,
    videoUrl: finalVideoUrl,
    youtubeId: finalYtId,
    cloudinaryPublicId: finalType === 'upload' ? (cloudinaryPublicId || '') : '',
    durationSeconds: durationSeconds || 0,
    isRequired: isRequired !== false,
    isActive: isActive !== false,
    sortOrder: sortOrder || 0,
  });
};

export const getAllTrainingVideosService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return TrainingVideo.find(filter).sort({ sortOrder: 1, createdAt: 1 });
};

export const updateTrainingVideoService = async (id, data) => {
  const existing = await TrainingVideo.findById(id);
  if (!existing) throw new ApiError(404, 'Training video not found');

  const incomingUrl = data.videoUrl || existing.videoUrl;
  const extractedYtId = extractYouTubeId(incomingUrl);
  const isYt = (data.videoType === 'youtube') || Boolean(extractedYtId);
  const finalType = isYt ? 'youtube' : (data.videoType || existing.videoType || 'upload');
  const finalYtId = isYt ? (data.youtubeId || extractedYtId || existing.youtubeId) : '';
  const finalVideoUrl = isYt && finalYtId ? `https://www.youtube.com/embed/${finalYtId}` : incomingUrl;

  if (data.cloudinaryPublicId && existing.videoType === 'upload' && existing.cloudinaryPublicId && data.cloudinaryPublicId !== existing.cloudinaryPublicId) {
    await deleteFromCloudinary(existing.cloudinaryPublicId, 'video').catch(() => {});
  }

  existing.title = data.title ?? existing.title;
  existing.description = data.description ?? existing.description;
  existing.videoType = finalType;
  existing.videoUrl = finalVideoUrl;
  existing.youtubeId = finalYtId;
  existing.cloudinaryPublicId = finalType === 'upload' ? (data.cloudinaryPublicId || existing.cloudinaryPublicId) : '';
  if (data.durationSeconds !== undefined) existing.durationSeconds = data.durationSeconds;
  if (data.isRequired !== undefined) existing.isRequired = data.isRequired;
  if (data.isActive !== undefined) existing.isActive = data.isActive;
  if (data.sortOrder !== undefined) existing.sortOrder = data.sortOrder;

  await existing.save();
  return existing;
};

export const deleteTrainingVideoService = async (id) => {
  const video = await TrainingVideo.findById(id);
  if (!video) throw new ApiError(404, 'Training video not found');

  if (video.videoType === 'upload' && video.cloudinaryPublicId) {
    await deleteFromCloudinary(video.cloudinaryPublicId, 'video').catch(() => {});
  }
  await TrainingVideo.findByIdAndDelete(id);
  return { id };
};

// ─── Platform Settings ────────────────────────────────────────────────────────

import PlatformSettings from '../models/platformSettings.model.js';

export const getPlatformSettingsService = async () => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({});
  }
  return settings;
};

/**
 * The outstation wallet floor, resolved once for every consumer.
 *
 * Returns `null` when the rule must not be applied — either an admin
 * switched it off, or the configured amount is zero/invalid. Callers
 * treat `null` as "no balance requirement" rather than "≥ 0", which
 * matters because a `$gte: 0` filter still quietly drops drivers whose
 * wallet has gone negative.
 *
 * Every place that gates outstation work on driver balance (the
 * broadcast dispatcher, the admin candidate list, the manual-assign
 * guard) goes through here so the toggle can't be honoured in one path
 * and ignored in another.
 */
export const resolveOutstationWalletFloorService = async () => {
  // Goes through the getter (rather than a bare findOne) so a fresh
  // install with no settings row yet still gets the documented schema
  // default instead of silently behaving as "no floor".
  const settings = await getPlatformSettingsService();
  if (settings?.enforceOutstationMinWalletBalance === false) return null;
  const amount = Number(settings?.outstationMinWalletBalance);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

export const updatePlatformSettingsService = async (data, updatedBy) => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({ ...data, updatedBy });
  } else {
    settings.cashCancelFeeThresholdMinutes = data.cashCancelFeeThresholdMinutes ?? settings.cashCancelFeeThresholdMinutes;
    settings.cashCancelFeeAmount = data.cashCancelFeeAmount ?? settings.cashCancelFeeAmount;
    settings.driverCancelFeeAmount = data.driverCancelFeeAmount ?? settings.driverCancelFeeAmount;
    settings.noKitPenaltyAmount = data.noKitPenaltyAmount ?? settings.noKitPenaltyAmount;
    settings.monthlyRideRegistrationFee = data.monthlyRideRegistrationFee ?? settings.monthlyRideRegistrationFee;
    settings.outstationMinWalletBalance = data.outstationMinWalletBalance ?? settings.outstationMinWalletBalance;
    if (data.enforceOutstationMinWalletBalance !== undefined) {
      settings.enforceOutstationMinWalletBalance = !!data.enforceOutstationMinWalletBalance;
    }
    if (data.supportEmail !== undefined) settings.supportEmail = data.supportEmail;
    if (data.supportPhone !== undefined) settings.supportPhone = data.supportPhone;
    if (data.ratingQuestions !== undefined) settings.ratingQuestions = data.ratingQuestions;
    if (data.driverRatingQuestions !== undefined) settings.driverRatingQuestions = data.driverRatingQuestions;
    settings.updatedBy = updatedBy;
    await settings.save();
  }
  return settings;
};

