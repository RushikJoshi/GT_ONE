import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to:", mongoose.connection.name);
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const col of collections) {
    const indexes = await mongoose.connection.db.collection(col.name).indexes();
    console.log(`\nCollection: ${col.name}`);
    for (const idx of indexes) {
      console.log(`  - Index: ${idx.name}, Unique: ${!!idx.unique}, Keys: ${JSON.stringify(idx.key)}`);
    }
  }
  await mongoose.disconnect();
}

run().catch(console.error);
