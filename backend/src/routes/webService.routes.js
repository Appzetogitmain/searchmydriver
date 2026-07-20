import { Router } from 'express';
import {
  adminListServices,
  adminCreateService,
  adminUpdateService,
  adminDeleteService,
  listActiveServices,
} from '../controllers/webService.controller.js';
import { protectStaff, restrictTo } from '../middlewares/authMiddleware.js';

const router = Router();

// Public routes
router.get('/common', listActiveServices);

// Admin routes
router.use('/admin', protectStaff, restrictTo('admin', 'sub_admin'));
router.get('/admin', adminListServices);
router.post('/admin', adminCreateService);
router.put('/admin/:id', adminUpdateService);
router.delete('/admin/:id', adminDeleteService);

export default router;
