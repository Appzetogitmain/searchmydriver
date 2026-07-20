import { Router } from 'express';
import { getBookingChat, sendMessage } from '../controllers/chat.controller.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';

const router = Router();

// Secure all chat routes with JWT authentication
router.use(verifyJWT);

// Get chat history for a booking
router.get('/:bookingId', getBookingChat);

// Send a new message
router.post('/:bookingId', sendMessage);

export default router;
