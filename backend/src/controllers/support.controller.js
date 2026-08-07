import SupportTicket from '../models/supportTicket.model.js';
import { ApiError } from '../utils/apiError.js';
import { emitToAdmins, emitNotification } from '../utils/socketEmitters.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';

export const createSupportTicket = async (req, res, next) => {
  try {
    const { subject, description } = req.body;
    const isUser = !!req.user;
    const isDriver = !!req.driver;

    if (!isUser && !isDriver) {
      throw new ApiError(401, 'Unauthorized');
    }

    if (!subject || !description) {
      throw new ApiError(400, 'Subject and description are required');
    }

    const ticket = await SupportTicket.create({
      creatorType: isUser ? 'user' : 'driver',
      userId: isUser ? req.user._id : undefined,
      driverId: isDriver ? req.driver._id : undefined,
      subject,
      description,
    });

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .lean();

    // Alert admins
    emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
      type: 'support_ticket',
      message: `New Help Desk Ticket from ${isUser ? populatedTicket.userId.name : populatedTicket.driverId.name}`,
      ticketId: ticket._id,
    });
    emitNotification({ admin: true }, {
      title: 'New Help Desk Ticket',
      body: `Ticket submitted by ${isUser ? populatedTicket.userId.name : populatedTicket.driverId.name}`,
      severity: 'info',
      data: {
        url: '/admin/help-desk'
      }
    });

    res.status(201).json({ success: true, ticket: populatedTicket });
  } catch (err) {
    next(err);
  }
};

export const createPublicSupportTicket = async (req, res, next) => {
  try {
    const { subject, description, contactName, contactPhone, creatorType } = req.body;

    if (!subject || !description || !contactName || !contactPhone || !creatorType) {
      throw new ApiError(400, 'All fields are required');
    }

    const ticket = await SupportTicket.create({
      creatorType,
      subject,
      description,
      contactName,
      contactPhone,
    });

    emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
      type: 'support_ticket',
      message: `New Public Help Desk Ticket from ${contactName}`,
      ticketId: ticket._id,
    });
    emitNotification({ admin: true }, {
      title: 'New Public Ticket',
      body: `Help Desk ticket from ${contactName}`,
      severity: 'warning',
      data: {
        url: '/admin/help-desk'
      }
    });

    res.status(201).json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
};

export const getAdminSupportTickets = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find()
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, tickets });
  } catch (err) {
    next(err);
  }
};

export const resolveSupportTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await SupportTicket.findByIdAndUpdate(
      id,
      { status: 'resolved', resolvedAt: new Date() },
      { new: true }
    )
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .lean();

    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
};

export const replySupportTicketAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, status } = req.body;

    if (!message || !message.trim()) {
      throw new ApiError(400, 'Reply message is required');
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    const senderId = req.staff?._id || req.user?._id;
    const senderName = req.staff?.name || req.user?.name || 'Support Admin';

    ticket.replies.push({
      senderType: 'admin',
      senderId,
      senderName,
      message: message.trim(),
      createdAt: new Date(),
    });

    if (status && ['open', 'resolved'].includes(status)) {
      ticket.status = status;
      if (status === 'resolved') {
        ticket.resolvedAt = new Date();
      }
    }

    await ticket.save();

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .lean();

    // Send real-time notification to the ticket creator
    if (ticket.userId) {
      await emitNotification(
        { userId: ticket.userId },
        {
          title: `Help Desk Reply (${ticket.ticketNumber})`,
          body: `${senderName}: ${message.trim()}`,
          severity: 'info',
          data: {
            ticketId: String(ticket._id),
            type: 'support_ticket_reply',
          },
        }
      );
    } else if (ticket.driverId) {
      await emitNotification(
        { driverId: ticket.driverId },
        {
          title: `Help Desk Reply (${ticket.ticketNumber})`,
          body: `${senderName}: ${message.trim()}`,
          severity: 'info',
          data: {
            ticketId: String(ticket._id),
            type: 'support_ticket_reply',
          },
        }
      );
    }

    emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
      type: 'support_ticket_reply',
      message: `Admin replied on Ticket ${ticket.ticketNumber}`,
      ticketId: ticket._id,
    });

    res.json({ success: true, ticket: populatedTicket });
  } catch (err) {
    next(err);
  }
};

export const replySupportTicketUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      throw new ApiError(400, 'Message is required');
    }

    const ticket = await SupportTicket.findOne({ _id: id, userId: req.user._id });
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    ticket.replies.push({
      senderType: 'user',
      senderId: req.user._id,
      senderName: req.user.name || 'User',
      message: message.trim(),
      createdAt: new Date(),
    });

    ticket.status = 'open';
    await ticket.save();

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .lean();

    emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
      type: 'support_ticket_reply',
      message: `Reply on ${ticket.ticketNumber} from ${req.user.name || 'User'}`,
      ticketId: ticket._id,
    });
    emitNotification(
      { admin: true },
      {
        title: `Reply on ${ticket.ticketNumber}`,
        body: `${req.user.name || 'User'}: ${message.trim()}`,
        severity: 'info',
        data: {
          url: '/admin/help-desk',
          ticketId: String(ticket._id),
        },
      }
    );

    res.json({ success: true, ticket: populatedTicket });
  } catch (err) {
    next(err);
  }
};

export const replySupportTicketDriver = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      throw new ApiError(400, 'Message is required');
    }

    const ticket = await SupportTicket.findOne({ _id: id, driverId: req.driver._id });
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    ticket.replies.push({
      senderType: 'driver',
      senderId: req.driver._id,
      senderName: req.driver.name || 'Driver',
      message: message.trim(),
      createdAt: new Date(),
    });

    ticket.status = 'open';
    await ticket.save();

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .lean();

    emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
      type: 'support_ticket_reply',
      message: `Reply on ${ticket.ticketNumber} from Driver ${req.driver.name || ''}`,
      ticketId: ticket._id,
    });
    emitNotification(
      { admin: true },
      {
        title: `Reply on ${ticket.ticketNumber}`,
        body: `Driver ${req.driver.name || ''}: ${message.trim()}`,
        severity: 'info',
        data: {
          url: '/admin/help-desk',
          ticketId: String(ticket._id),
        },
      }
    );

    res.json({ success: true, ticket: populatedTicket });
  } catch (err) {
    next(err);
  }
};

export const getMySupportTicketsUser = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, tickets });
  } catch (err) {
    next(err);
  }
};

export const getMySupportTicketsDriver = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find({ driverId: req.driver._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, tickets });
  } catch (err) {
    next(err);
  }
};

