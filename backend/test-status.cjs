const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Booking = require('./src/models/booking.model.js').default;
  const count = await Booking.countDocuments();
  console.log('Total bookings:', count);
  const byStatus = await Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log('By status:', byStatus);
  process.exit(0);
}).catch(console.error);
