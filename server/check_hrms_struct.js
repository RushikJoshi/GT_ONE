import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://sso:sso123@sso.ixvhkmk.mongodb.net/hrms?retryWrites=true&w=majority&appName=SSO";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const companies = db.collection("companies");
    
    const company = await companies.findOne({});
    console.log("Full company document:", JSON.stringify(company, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
