import mongoose from 'mongoose';
import BookingChat from '../models/bookingChat.model.js';
import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getIoOrNull } from '../config/socket.js';
import { sendPushToRecipient } from '../utils/socketEmitters.js';

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

    // Push to the other party. Booking stores the customer as `userId`.
    const recipient =
      senderModel === 'User'
        ? { model: 'Driver', id: booking.driverId }
        : senderModel === 'Driver'
          ? { model: 'User', id: booking.userId }
          : null;
    if (recipient?.id) {
      // Fire-and-forget: never delays the chat response, never throws.
      sendPushToRecipient(recipient, {
        title: `New message from ${populatedMsg.senderId?.name || (senderModel === 'User' ? 'Customer' : 'Driver')}`,
        body: message,
        data: {
          type: 'CHAT_MESSAGE',
          bookingId: bookingId.toString(),
        },
      });
    }

    res.status(201).json(new ApiResponse(201, populatedMsg, 'Message sent successfully'));
  } catch (error) {
    next(error);
  }
};
