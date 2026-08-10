import { Router } from 'express';
import {
  getAllWebPages,
  createWebPage,
  updateWebPage,
  deleteWebPage,
  getWebPageBySlug,
  getContactInfo,
  updateContactInfo,
} from '../controllers/webPage.controller.js';
import { protectStaff, restrictTo } from '../middlewares/authMiddleware.js';

const router = Router();

// Public routes (for public website)
router.get('/contact-info', getContactInfo);
router.get('/common/:slug', getWebPageBySlug);

// Admin routes
router.use('/admin', protectStaff, restrictTo('admin', 'sub_admin'));
router.get('/admin/contact-info', getContactInfo);
router.put('/admin/contact-info', updateContactInfo);
router.get('/admin', getAllWebPages);
router.post('/admin', createWebPage);
router.put('/admin/:id', updateWebPage);
router.delete('/admin/:id', deleteWebPage);

export default router;
