import { Router } from 'express';
import {
  getAdminWalletState,
  addFunds,
  withdrawFunds,
  manualAdjustment,
} from '../controllers/adminWallet.controller.js';
import { protectStaff, restrictTo } from '../middlewares/authMiddleware.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';

const router = Router();

// Only Super Admins and high-level Admins should manage wallet funds
router.use(protectStaff, restrictTo('admin', 'sub_admin'));

router.get('/state', getAdminWalletState);
router.post('/add-funds', addFunds);
router.post('/withdraw-funds', withdrawFunds);
router.post('/manual-adjustment', manualAdjustment);

export default router;
