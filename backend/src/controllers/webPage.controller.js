import { asyncHandler } from '../utils/asyncHandler.js';
import * as webPageService from '../services/webPage.service.js';

export const createWebPage = asyncHandler(async (req, res) => {
  const page = await webPageService.createWebPageService(req.body);
  res.status(201).json({ status: 201, data: page, message: 'Page created successfully' });
});

export const getAllWebPages = asyncHandler(async (req, res) => {
  const pages = await webPageService.getAllWebPagesService();
  res.status(200).json({ status: 200, data: pages, message: 'Pages fetched successfully' });
});

export const getWebPageBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const page = await webPageService.getWebPageBySlugService(slug);
  res.status(200).json({ status: 200, data: page, message: 'Page fetched successfully' });
});

export const updateWebPage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const page = await webPageService.updateWebPageService(id, req.body);
  res.status(200).json({ status: 200, data: page, message: 'Page updated successfully' });
});

export const deleteWebPage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await webPageService.deleteWebPageService(id);
  res.status(200).json({ status: 200, data: result, message: 'Page deleted successfully' });
});

export const getContactInfo = asyncHandler(async (req, res) => {
  const contactInfo = await webPageService.getContactInfoService();
  res.status(200).json({ status: 200, data: contactInfo, message: 'Contact info fetched successfully' });
});

export const updateContactInfo = asyncHandler(async (req, res) => {
  const updatedBy = req.staff?._id || null;
  const contactInfo = await webPageService.updateContactInfoService(req.body, updatedBy);
  res.status(200).json({ status: 200, data: contactInfo, message: 'Contact info updated successfully' });
});
