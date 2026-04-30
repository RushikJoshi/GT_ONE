import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://ravaldhruv85_db_user:wpf78tWf38Hvog7s@cluster0.rae6dld.mongodb.net/gitakshmi-one?appName=Cluster0";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const users = db.collection("users");
    
    const result = await users.updateOne(
      { email: "baldaniyanitesh2003@gmail.com" },
      { $set: { companyId: "69d616e60e92dab389a4863f" } }
    );
    console.log("User company updated:", result.modifiedCount);

    // Also update Nitesh's role to super_admin just to be safe during testing?
    // No, let's keep it company_admin to test the real flow.

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
