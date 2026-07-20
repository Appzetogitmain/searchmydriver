import WebService from '../models/webService.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';

// --- Admin Endpoints ---

export const adminListServices = asyncHandler(async (req, res) => {
  const services = await WebService.find().sort({ sortOrder: 1, createdAt: -1 });
  return res.status(200).json(new ApiResponse(200, services, 'Services fetched successfully'));
});

export const adminCreateService = asyncHandler(async (req, res) => {
  const { title, subtitle, description, iconName, features, isActive, sortOrder } = req.body;
  const newService = await WebService.create({
    title,
    subtitle,
    description,
    iconName,
    features: features || [],
    isActive: isActive !== undefined ? isActive : true,
    sortOrder: sortOrder || 0,
  });
  return res.status(201).json(new ApiResponse(201, newService, 'Service created successfully'));
});

export const adminUpdateService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, subtitle, description, iconName, features, isActive, sortOrder } = req.body;

  const service = await WebService.findById(id);
  if (!service) {
    throw new ApiError(404, 'Service not found');
  }

  service.title = title || service.title;
  service.subtitle = subtitle !== undefined ? subtitle : service.subtitle;
  service.description = description || service.description;
  service.iconName = iconName || service.iconName;
  if (features) service.features = features;
  if (isActive !== undefined) service.isActive = isActive;
  if (sortOrder !== undefined) service.sortOrder = sortOrder;

  await service.save();

  return res.status(200).json(new ApiResponse(200, service, 'Service updated successfully'));
});

export const adminDeleteService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const service = await WebService.findByIdAndDelete(id);
  if (!service) {
    throw new ApiError(404, 'Service not found');
  }
  return res.status(200).json(new ApiResponse(200, null, 'Service deleted successfully'));
});

// --- Public Endpoints ---

export const listActiveServices = asyncHandler(async (req, res) => {
  const services = await WebService.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 });
  return res.status(200).json(new ApiResponse(200, services, 'Active services fetched successfully'));
});
