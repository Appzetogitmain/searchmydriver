import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} from '../controllers/notification.controller.js';

const router = Router();

router.get('/', getNotifications);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/clear-all', clearAllNotifications);
router.delete('/:id', deleteNotification);

export default router;

