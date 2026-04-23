import mongoose from "mongoose";

const dropLegacyUniqueIndexesIfExists = async (collectionName, fieldNames = []) => {
  try {
    console.log(`[MIGRATION] Database: ${mongoose.connection.name}`);
    const collection = mongoose.connection.collection(collectionName);
    const indexes = await collection.indexes();
    
    console.log(`[MIGRATION] Found ${indexes.length} indexes for ${collectionName}: ${indexes.map(i => i.name).join(", ")}`);

    const uniqueLegacyIndexes = indexes.filter(
      (index) => {
        const isLegacy = index &&
          index.unique === true &&
          index.key &&
          fieldNames.some((fieldName) => Object.prototype.hasOwnProperty.call(index.key, fieldName));
        
        if (isLegacy) {
          console.log(`[MIGRATION] Checking index: ${index.name}, unique: ${!!index.unique}, keys: ${JSON.stringify(index.key)}, isLegacy: ${isLegacy}`);
        }
        return isLegacy;
      }
    );

    for (const index of uniqueLegacyIndexes) {
      if (!index.name) continue;
      await collection.dropIndex(index.name);
      console.log(`[MIGRATION] Dropped legacy unique index ${collectionName}.${index.name}`);
    }
  } catch (error) {
    if (error?.codeName === "NamespaceNotFound") return;
    console.warn(`[MIGRATION] Failed index check for ${collectionName}: ${error.message}`);
  }
};

export const dropLegacyUniqueEmailIndexes = async () => {
  const collections = ["companies", "users"];
  for (const collName of collections) {
    try {
      const collection = mongoose.connection.collection(collName);
      const indexes = await collection.indexes();
      for (const index of indexes) {
        if (index.unique && index.name !== "_id_") {
          console.log(`[MIGRATION] FORCE dropping unique index ${collName}.${index.name}`);
          await collection.dropIndex(index.name);
        }
      }
    } catch (err) {
      console.warn(`[MIGRATION] Failed to drop indexes for ${collName}: ${err.message}`);
    }
  }
};
