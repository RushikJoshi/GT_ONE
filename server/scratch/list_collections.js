import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const listCollections = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

listCollections();
