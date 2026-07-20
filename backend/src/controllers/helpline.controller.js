import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import Helpline from '../models/helpline.model.js';

export const adminListHelplines = asyncHandler(async (req, res) => {
  const helplines = await Helpline.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  return res.status(200).json(new ApiResponse(200, helplines, 'Helplines fetched successfully'));
});

export const adminCreateHelpline = asyncHandler(async (req, res) => {
  const { cityName, contactNumber, description, sortOrder, isActive } = req.body;
  if (!cityName || !contactNumber) {
    throw new ApiError(400, 'City name and contact number are required');
  }

  // Check for duplicate city name
  const existing = await Helpline.findOne({ cityName });
  if (existing) {
    throw new ApiError(400, `Helpline for city "${cityName}" already exists.`);
  }

  const helpline = await Helpline.create({
    cityName,
    contactNumber,
    description: description || 'Emergency Support',
    sortOrder: Number(sortOrder) || 0,
    isActive: isActive !== false,
  });

  return res.status(201).json(new ApiResponse(201, helpline, 'Helpline created successfully'));
});

export const adminUpdateHelpline = asyncHandler(async (req, res) => {
  const { cityName, contactNumber, description, sortOrder, isActive } = req.body;
  const helpline = await Helpline.findById(req.params.id);
  if (!helpline) {
    throw new ApiError(404, 'Helpline not found');
  }

  if (cityName && cityName !== helpline.cityName) {
    const existing = await Helpline.findOne({ cityName });
    if (existing) {
      throw new ApiError(400, `Helpline for city "${cityName}" already exists.`);
    }
    helpline.cityName = cityName;
  }

  helpline.contactNumber = contactNumber ?? helpline.contactNumber;
  helpline.description = description ?? helpline.description;
  helpline.sortOrder = sortOrder !== undefined ? Number(sortOrder) : helpline.sortOrder;
  helpline.isActive = isActive !== undefined ? isActive : helpline.isActive;

  await helpline.save();

  return res.status(200).json(new ApiResponse(200, helpline, 'Helpline updated successfully'));
});

export const adminDeleteHelpline = asyncHandler(async (req, res) => {
  const helpline = await Helpline.findById(req.params.id);
  if (!helpline) {
    throw new ApiError(404, 'Helpline not found');
  }

  await helpline.deleteOne();

  return res.status(200).json(new ApiResponse(200, null, 'Helpline deleted successfully'));
});

export const listActiveHelplines = asyncHandler(async (req, res) => {
  const helplines = await Helpline.find({ isActive: true }).sort({ sortOrder: 1, cityName: 1 }).lean();
  return res.status(200).json(new ApiResponse(200, helplines, 'Active helplines fetched successfully'));
});
