import crypto from "crypto";
import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://ravaldhruv85_db_user:wpf78tWf38Hvog7s@cluster0.rae6dld.mongodb.net/gitakshmi-one?appName=Cluster0";

const hashClientSecret = (clientSecret) =>
  crypto.createHash("sha256").update(String(clientSecret || "")).digest("hex");

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const applications = db.collection("applications");
    
    const app = await applications.findOne({ key: "hrms" });
    if (!app) {
      console.log("HRMS app not found");
      return;
    }

    const secret = "gtone_hrms_1_sjxmNJR4KN6tvjFRZCm3BS59cyIMQ4MEuYkEhWGV0";
    const hash = hashClientSecret(secret);

    await applications.updateOne(
      { _id: app._id },
      { $set: { clientSecretHash: hash, clientAuthMethod: "client_secret_post" } }
    );

    console.log("Successfully updated HRMS application secret hash.");
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
