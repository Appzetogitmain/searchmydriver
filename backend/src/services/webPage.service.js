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

export const getContactInfoService = async () => {
  const PlatformSettings = (await import('../models/platformSettings.model.js')).default;
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({});
  }
  return {
    supportPhone: settings.supportPhone || '2222222222',
    supportEmail: settings.supportEmail || 'support@searchmydriver.com',
    supportDescription:
      settings.supportDescription ||
      'Our support team is available 24/7 to assist you. Choose whichever channel is most convenient for you.',
    responseTime: settings.responseTime || 'Usually under 15 minutes',
    officeAddress: settings.officeAddress || '123 Main Street, Suite 400, City, Country',
  };
};

export const updateContactInfoService = async (data, updatedBy) => {
  const PlatformSettings = (await import('../models/platformSettings.model.js')).default;
  let settings = await PlatformSettings.findOne();
  const updatePayload = {
    supportPhone: data.supportPhone,
    supportEmail: data.supportEmail,
    supportDescription: data.supportDescription,
    responseTime: data.responseTime,
    officeAddress: data.officeAddress,
    updatedBy: updatedBy || null,
  };
  if (!settings) {
    settings = await PlatformSettings.create(updatePayload);
  } else {
    Object.assign(settings, updatePayload);
    await settings.save();
  }
  return {
    supportPhone: settings.supportPhone,
    supportEmail: settings.supportEmail,
    supportDescription: settings.supportDescription,
    responseTime: settings.responseTime,
    officeAddress: settings.officeAddress,
  };
};
