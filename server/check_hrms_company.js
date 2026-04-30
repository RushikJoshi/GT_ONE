import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://sso:sso123@sso.ixvhkmk.mongodb.net/hrms?retryWrites=true&w=majority&appName=SSO";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const companies = db.collection("companies");
    
    const company = await companies.findOne({ _id: new mongoose.Types.ObjectId("69f0711b2276b41e573ebea4") });
    if (company) {
      console.log("Company found in HRMS:", company.companyName);
    } else {
      console.log("Company NOT found in HRMS database!");
      
      const allCompanies = await companies.find({}).limit(5).toArray();
      console.log("Available companies in HRMS:", allCompanies.map(c => `${c.companyName} (${c._id})`));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
