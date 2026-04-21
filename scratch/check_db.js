import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../server/.env") });

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const User = mongoose.connection.db.collection("users");
    const users = await User.find({}).toArray();
    console.log("Users found:", users.length);
    users.forEach(u => {
      console.log(`- ${u.email} (${u.role})`);
    });

    const Company = mongoose.connection.db.collection("companies");
    const companies = await Company.find({}).toArray();
    console.log("Companies found:", companies.length);
    companies.forEach(c => {
      console.log(`- ${c.name} (Code: ${c.code}, TenantId: ${c.hrmsTenantId})`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

checkUsers();
