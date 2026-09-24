import { Router } from 'express';
import {
  adminListSocials,
  adminCreateSocial,
  adminUpdateSocial,
  adminDeleteSocial,
  listActiveSocials,
  getWebSocialAppLinks,
  updateWebSocialAppLinks,
} from '../controllers/webSocialLink.controller.js';
import { protectStaff, restrictTo } from '../middlewares/authMiddleware.js';

const router = Router();

// Public routes (for public website)
router.get('/common', listActiveSocials);
router.get('/app-links', getWebSocialAppLinks);

// Admin routes
router.use('/admin', protectStaff, restrictTo('admin', 'sub_admin'));
router.get('/admin', adminListSocials);
router.get('/admin/app-links', getWebSocialAppLinks);
router.put('/admin/app-links', updateWebSocialAppLinks);
router.post('/admin', adminCreateSocial);
router.put('/admin/:id', adminUpdateSocial);
router.delete('/admin/:id', adminDeleteSocial);

export default router;
