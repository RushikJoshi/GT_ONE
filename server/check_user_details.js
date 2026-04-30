import mongoose from "mongoose";

const MONGO_URI = "mongodb+srv://ravaldhruv85_db_user:wpf78tWf38Hvog7s@cluster0.rae6dld.mongodb.net/gitakshmi-one?appName=Cluster0";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const users = db.collection("users");
    
    const user = await users.findOne({ email: "baldaniyanitesh2003@gmail.com" });
    console.log("User details:", JSON.stringify(user, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
