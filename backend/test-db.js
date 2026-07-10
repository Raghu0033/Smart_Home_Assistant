import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI).then(async () => {
  const devices = await mongoose.connection.collection('devices').find().toArray();
  console.log(JSON.stringify(devices, null, 2));
  process.exit(0);
});
