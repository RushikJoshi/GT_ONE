import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://sso:sso123@sso.ixvhkmk.mongodb.net/hrms?retryWrites=true&w=majority&appName=SSO";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const tenants = db.collection("tenants");
    
    const tenantList = await tenants.find({}).toArray();
    console.log("Tenants in HRMS:");
    tenantList.forEach(t => {
      console.log(`- ${t.companyName || t.name || t.code} (ID: ${t._id})`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
