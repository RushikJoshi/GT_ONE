import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await mongoose.connection.db.admin().listDatabases();
  console.log("Databases:", result.databases.map(db => db.name));
  await mongoose.disconnect();
}

run().catch(console.error);
