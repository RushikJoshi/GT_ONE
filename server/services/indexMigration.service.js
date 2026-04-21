import mongoose from "mongoose";

const dropUniqueEmailIndexIfExists = async (collectionName) => {
  try {
    const collection = mongoose.connection.collection(collectionName);
    const indexes = await collection.indexes();
    const uniqueEmailIndexes = indexes.filter(
      (index) =>
        index &&
        index.unique === true &&
        index.key &&
        Object.prototype.hasOwnProperty.call(index.key, "email")
    );

    for (const index of uniqueEmailIndexes) {
      if (!index.name) continue;
      await collection.dropIndex(index.name);
      console.log(`[MIGRATION] Dropped unique email index ${collectionName}.${index.name}`);
    }
  } catch (error) {
    // NamespaceNotFound or missing collection should not block boot.
    if (error?.codeName === "NamespaceNotFound") return;
    console.warn(`[MIGRATION] Failed index check for ${collectionName}: ${error.message}`);
  }
};

export const dropLegacyUniqueEmailIndexes = async () => {
  await dropUniqueEmailIndexIfExists("companies");
  await dropUniqueEmailIndexIfExists("users");
};
