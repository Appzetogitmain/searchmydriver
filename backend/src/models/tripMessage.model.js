import mongoose from 'mongoose';

const tripMessageSchema = new mongoose.Schema(
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
      enum: ['User', 'Driver'],
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const TripMessage = mongoose.model('TripMessage', tripMessageSchema);

export default TripMessage;
