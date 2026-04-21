import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.useDb("test");
  const collection = db.collection("companies");
  try {
    const result = await collection.dropIndex("companyEmail_1");
    console.log("Successfully dropped index companyEmail_1:", result);
  } catch (error) {
    if (error.codeName === "IndexNotFound") {
       console.log("Index companyEmail_1 not found in test.companies");
    } else {
       console.error("Failed to drop index:", error.message);
    }
  }
  await mongoose.disconnect();
}

run().catch(console.error);
