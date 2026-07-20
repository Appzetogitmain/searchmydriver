import WebPage from '../models/webPage.model.js';
import { ApiError } from '../utils/apiError.js';

export const createWebPageService = async (data) => {
  const { slug, title, content, isActive } = data;
  if (!slug || !title || !content) {
    throw new ApiError(400, 'Slug, title, and content are required');
  }

  const existingPage = await WebPage.findOne({ slug: slug.toLowerCase() });
  if (existingPage) {
    throw new ApiError(400, 'A page with this slug already exists');
  }

  return await WebPage.create({
    slug: slug.toLowerCase(),
    title,
    content,
    isActive: isActive !== undefined ? isActive : true,
  });
};

export const getAllWebPagesService = async () => {
  return await WebPage.find().sort({ createdAt: -1 });
};

export const getWebPageBySlugService = async (slug) => {
  const page = await WebPage.findOne({ slug: slug.toLowerCase(), isActive: true });
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }
  return page;
};

export const updateWebPageService = async (id, data) => {
  const page = await WebPage.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }
  return page;
};

export const deleteWebPageService = async (id) => {
  const page = await WebPage.findByIdAndDelete(id);
  if (!page) {
    throw new ApiError(404, 'Page not found');
  }
  return { id };
};
