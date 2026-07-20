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
