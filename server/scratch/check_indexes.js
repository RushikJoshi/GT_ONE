import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const checkIndexes = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const collections = ["companies", "users"];
    for (const collName of collections) {
      console.log(`\n--- Indexes for ${collName} ---`);
      const collection = mongoose.connection.collection(collName);
      const indexes = await collection.indexes();
      indexes.forEach(idx => {
        console.log({
          name: idx.name,
          key: idx.key,
          unique: idx.unique
        });
      });
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

checkIndexes();
