import mongoose from 'mongoose';
import BookingChat from '../models/bookingChat.model.js';
import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getIoOrNull } from '../config/socket.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { sendFcmNotification } from '../config/firebase.js';

export const getBookingChat = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new ApiError(400, 'Invalid booking ID');
    }

    const messages = await BookingChat.find({ bookingId })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name email phone_no role');

    res.status(200).json(new ApiResponse(200, messages, 'Chat fetched successfully'));
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { message, senderModel } = req.body;
    const senderId = req.user ? req.user._id : req.driver ? req.driver._id : null;

    if (!senderId) {
      throw new ApiError(401, 'Unauthorized sender');
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new ApiError(400, 'Invalid booking ID');
    }
    if (!message || message.trim() === '') {
      throw new ApiError(400, 'Message cannot be empty');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    const newMsg = await BookingChat.create({
      bookingId,
      senderId,
      senderModel,
      message,
    });

    const populatedMsg = await BookingChat.findById(newMsg._id).populate('senderId', 'name email phone_no role');

    // Notify via socket
    const io = getIoOrNull();
    if (io) {
      io.to(`booking:${bookingId}`).emit('NEW_CHAT_MESSAGE', populatedMsg);
    }

    // Send FCM push notification
    try {
      let fcmToken = '';
      if (senderModel === 'User') {
        const driver = await Driver.findById(booking.driverId).select('fcmToken').lean();
        fcmToken = driver?.fcmToken;
      } else if (senderModel === 'Driver') {
        const user = await User.findById(booking.customerId).select('fcmToken').lean();
        fcmToken = user?.fcmToken;
      }
      
      if (fcmToken) {
        sendFcmNotification(fcmToken, {
          title: `New message from ${populatedMsg.senderId?.name || (senderModel === 'User' ? 'Customer' : 'Driver')}`,
          body: message,
          data: {
            type: 'CHAT_MESSAGE',
            bookingId: bookingId.toString()
          }
        }).catch(err => console.error('[FCM] chat message notify error:', err));
      }
    } catch (err) {
      console.error('[Chat] FCM notification failed:', err);
    }

    res.status(201).json(new ApiResponse(201, populatedMsg, 'Message sent successfully'));
  } catch (error) {
    next(error);
  }
};
