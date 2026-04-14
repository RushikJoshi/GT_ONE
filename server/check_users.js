
import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({}).select('email role').limit(5).lean();
  console.log('Users in GT_ONE:', users);
  process.exit(0);
}
check();
