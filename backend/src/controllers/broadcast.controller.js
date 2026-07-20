import { Broadcast } from '../models/broadcast.model.js';
import { Notification } from '../models/notification.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getFirebaseAdmin } from '../config/firebase.js';

export const sendBroadcast = asyncHandler(async (req, res) => {
  const { audience, recipientId, targetCity, targetZone, title, body, severity } = req.body;
  const adminId = req.staff._id;

  if (!audience || !title || !body) {
    return res.status(400).json(new ApiResponse(400, null, 'Audience, title, and body are required'));
  }

  let usersToNotify = [];
  let driversToNotify = [];

  // 1. Gather recipients based on audience
  if (audience === 'all_users' || audience === 'all') {
    usersToNotify = await User.find({ isDeleted: false, isActive: true })
      .select('_id fcmToken')
      .lean();
  }
  
  if (audience === 'all_drivers' || audience === 'all') {
    driversToNotify = await Driver.find({ isDeleted: false, approvalStatus: 'approved' })
      .select('_id fcmToken')
      .lean();
  }

  if (audience === 'specific_user') {
    if (!recipientId) return res.status(400).json(new ApiResponse(400, null, 'recipientId is required for specific_user'));
    const user = await User.findById(recipientId).select('_id fcmToken').lean();
    if (user) usersToNotify.push(user);
  }

  if (audience === 'specific_driver') {
    if (!recipientId) return res.status(400).json(new ApiResponse(400, null, 'recipientId is required for specific_driver'));
    const driver = await Driver.findById(recipientId).select('_id fcmToken').lean();
    if (driver) driversToNotify.push(driver);
  }

  if (audience === 'city_users') {
    if (!targetCity) return res.status(400).json(new ApiResponse(400, null, 'targetCity is required for city_users'));
    usersToNotify = await User.find({ isDeleted: false, isActive: true, city: { $regex: new RegExp(`^${targetCity}$`, 'i') } })
      .select('_id fcmToken')
      .lean();
  }

  if (audience === 'city_drivers') {
    if (!targetCity) return res.status(400).json(new ApiResponse(400, null, 'targetCity is required for city_drivers'));
    driversToNotify = await Driver.find({ isDeleted: false, approvalStatus: 'approved', city: { $regex: new RegExp(`^${targetCity}$`, 'i') } })
      .select('_id fcmToken')
      .lean();
  }

  if (audience === 'zone_drivers') {
    if (!targetZone) return res.status(400).json(new ApiResponse(400, null, 'targetZone is required for zone_drivers'));
    driversToNotify = await Driver.find({ isDeleted: false, approvalStatus: 'approved', preferredOutstationZones: targetZone })
      .select('_id fcmToken')
      .lean();
  }

  const totalRecipients = usersToNotify.length + driversToNotify.length;

  if (totalRecipients === 0) {
    return res.status(400).json(new ApiResponse(400, null, 'No recipients found for this audience'));
  }

  // 2. Create Broadcast Record
  const broadcast = await Broadcast.create({
    sentBy: adminId,
    audience,
    recipientId: (audience === 'specific_user' || audience === 'specific_driver') ? recipientId : null,
    recipientModel: audience === 'specific_user' ? 'User' : (audience === 'specific_driver' ? 'Driver' : null),
    targetCity: targetCity || null,
    targetZone: targetZone || null,
    title,
    body,
    severity: severity || 'info',
    sentCount: totalRecipients,
    status: 'sent',
  });

  // 3. Prepare Notifications for DB Bulk Insert
  const notifications = [];
  const fcmTokens = [];

  for (const user of usersToNotify) {
    notifications.push({
      recipientId: user._id,
      recipientModel: 'User',
      title,
      body,
      severity: severity || 'info',
      data: { broadcastId: String(broadcast._id) },
    });
    if (user.fcmToken) fcmTokens.push(user.fcmToken);
  }

  for (const driver of driversToNotify) {
    notifications.push({
      recipientId: driver._id,
      recipientModel: 'Driver',
      title,
      body,
      severity: severity || 'info',
      data: { broadcastId: String(broadcast._id) },
    });
    if (driver.fcmToken) fcmTokens.push(driver.fcmToken);
  }

  // Insert to DB in batches if needed, but mongoose insertMany handles large arrays reasonably well up to a few thousand
  await Notification.insertMany(notifications, { ordered: false }).catch((err) => {
    console.error('[Broadcast] Partial insertMany failure:', err);
  });

  // 4. Send Push Notifications via FCM Multicast
  if (fcmTokens.length > 0) {
    const admin = getFirebaseAdmin();
    if (admin) {
      // FCM allows max 500 tokens per sendMulticast call
      const chunkSize = 500;
      for (let i = 0; i < fcmTokens.length; i += chunkSize) {
        const chunk = fcmTokens.slice(i, i + chunkSize);
        admin.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          data: { broadcastId: String(broadcast._id) },
          webpush: {
            headers: { Urgency: 'high' },
            notification: { icon: '/logo.png', badge: '/logo.png' }
          }
        }).catch(err => console.error('[Broadcast] FCM chunk error:', err));
      }
    }
  }

  // Note: We skip emitNotification socket broadcasts for mass emails as they could overwhelm the Node process if there are 1000s of connected clients at once. FCM + DB covers it, and users will see it in their notification bell on next API load/refresh.
  // For specific targets, it would be nice, but we are optimizing for the mass-send case here.

  return res.status(201).json(new ApiResponse(201, broadcast, 'Broadcast sent successfully'));
});

export const getBroadcasts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const broadcasts = await Broadcast.find({})
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sentBy', 'name email profilePicture')
    .lean();

  const total = await Broadcast.countDocuments({});

  return res.status(200).json(
    new ApiResponse(200, {
      broadcasts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    }, 'Broadcasts retrieved')
  );
});

export const getBroadcastStats = asyncHandler(async (req, res) => {
  const totalSent = await Broadcast.countDocuments({});
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const last7DaysCount = await Broadcast.countDocuments({
    createdAt: { $gte: sevenDaysAgo }
  });

  return res.status(200).json(
    new ApiResponse(200, {
      totalSent,
      last7DaysCount
    }, 'Broadcast stats retrieved')
  );
});

export const searchUsers = asyncHandler(async (req, res) => {
  const query = req.query.q || '';
  if (!query || query.length < 2) {
    return res.status(200).json(new ApiResponse(200, [], 'Search query too short'));
  }

  const users = await User.find({
    isDeleted: false,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { phone_no: { $regex: query, $options: 'i' } },
    ]
  })
    .select('name phone_no email')
    .limit(10)
    .lean();

  return res.status(200).json(new ApiResponse(200, users, 'Users retrieved'));
});

export const searchDrivers = asyncHandler(async (req, res) => {
  const query = req.query.q || '';
  if (!query || query.length < 2) {
    return res.status(200).json(new ApiResponse(200, [], 'Search query too short'));
  }

  const drivers = await Driver.find({
    isDeleted: false,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { phone: { $regex: query, $options: 'i' } },
    ]
  })
    .select('name phone')
    .limit(10)
    .lean();

  // map to flat structure for frontend
  const mapped = drivers.map(d => ({
    _id: d._id,
    name: d.name,
    phone_no: d.phone,
  }));

  return res.status(200).json(new ApiResponse(200, mapped, 'Drivers retrieved'));
});
