import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      index: true,
    },
    creatorType: {
      type: String,
      enum: ['user', 'driver'],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
    },
    contactName: {
      type: String,
    },
    contactPhone: {
      type: String,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
    },
    resolvedAt: {
      type: Date,
    },
    replies: [
      {
        senderType: {
          type: String,
          enum: ['admin', 'user', 'driver'],
          required: true,
        },
        senderId: {
          type: mongoose.Schema.Types.ObjectId,
        },
        senderName: {
          type: String,
        },
        message: {
          type: String,
          required: true,
          trim: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Auto-generate unique sequential ticket number before saving
supportTicketSchema.pre('save', async function (next) {
  if (this.isNew && !this.ticketNumber) {
    let nextNum = 1;
    const latest = await mongoose.model('SupportTicket')
      .findOne({ ticketNumber: /^TKT-\d+$/ })
      .sort({ createdAt: -1, _id: -1 })
      .select('ticketNumber')
      .lean();

    if (latest && latest.ticketNumber) {
      const match = latest.ticketNumber.match(/\d+$/);
      if (match) {
        nextNum = parseInt(match[0], 10) + 1;
      }
    }

    let candidate = `TKT-${String(nextNum).padStart(5, '0')}`;
    let exists = await mongoose.model('SupportTicket').exists({ ticketNumber: candidate });
    while (exists) {
      nextNum += 1;
      candidate = `TKT-${String(nextNum).padStart(5, '0')}`;
      exists = await mongoose.model('SupportTicket').exists({ ticketNumber: candidate });
    }

    this.ticketNumber = candidate;
  }
  next();
});

export default mongoose.model('SupportTicket', supportTicketSchema);
