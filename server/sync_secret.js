import mongoose from "mongoose";
import crypto from "crypto";

const MONGO_URI = "mongodb+srv://ravaldhruv85_db_user:wpf78tWf38Hvog7s@cluster0.rae6dld.mongodb.net/gitakshmi-one?appName=Cluster0";
const SECRET = "gtone_hrms_1_sjxmNJR4KN6tvjFRZCm3BS59cyIMQ4MEuYkEhWGV0";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const apps = db.collection("applications");
    
    const hash = crypto.createHash("sha256").update(SECRET).digest("hex");
    
    const result = await apps.updateOne(
      { key: "hrms" },
      { $set: { clientSecretHash: hash } }
    );
    
    console.log("Application updated:", result.modifiedCount);
    console.log("New Hash:", hash);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
