import mongoose from 'mongoose';

const bookingChatSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderModel: {
      type: String,
      required: true,
      enum: ['User', 'Driver', 'Admin'],
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const BookingChat = mongoose.models.BookingChat || mongoose.model('BookingChat', bookingChatSchema);
export default BookingChat;
