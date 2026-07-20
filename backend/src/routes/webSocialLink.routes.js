import { Router } from 'express';
import {
  adminListSocials,
  adminCreateSocial,
  adminUpdateSocial,
  adminDeleteSocial,
  listActiveSocials,
} from '../controllers/webSocialLink.controller.js';
import { protectStaff, restrictTo } from '../middlewares/authMiddleware.js';

const router = Router();

// Public routes (for public website)
router.get('/common', listActiveSocials);

// Admin routes
router.use('/admin', protectStaff, restrictTo('admin', 'sub_admin'));
router.get('/admin', adminListSocials);
router.post('/admin', adminCreateSocial);
router.put('/admin/:id', adminUpdateSocial);
router.delete('/admin/:id', adminDeleteSocial);

export default router;
