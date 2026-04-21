import mongoose from "mongoose";

<<<<<<< Updated upstream
const dropLegacyUniqueIndexesIfExists = async (collectionName, fieldNames = []) => {
=======
const dropLegacyIndexesIfExists = async (collectionName) => {
>>>>>>> Stashed changes
  try {
    console.log(`[MIGRATION] Database: ${mongoose.connection.name}`);
    const collection = mongoose.connection.collection(collectionName);
    const indexes = await collection.indexes();
<<<<<<< Updated upstream
    const uniqueLegacyIndexes = indexes.filter(
      (index) =>
        index &&
        index.unique === true &&
        index.key &&
        fieldNames.some((fieldName) => Object.prototype.hasOwnProperty.call(index.key, fieldName))
    );

    for (const index of uniqueLegacyIndexes) {
=======
    console.log(`[MIGRATION] Found ${indexes.length} indexes for ${collectionName}: ${indexes.map(i => i.name).join(", ")}`);
    
    // Find unique indexes on fields we want to make non-unique or are legacy.
    const legacyIndexes = indexes.filter(
      (index) => {
        const isLegacy = index &&
          index.key &&
          (Object.prototype.hasOwnProperty.call(index.key, "email") ||
           Object.prototype.hasOwnProperty.call(index.key, "companyEmail") ||
           Object.prototype.hasOwnProperty.call(index.key, "company_email"));
        
        console.log(`[MIGRATION] Checking index: ${index.name}, unique: ${!!index.unique}, keys: ${JSON.stringify(index.key)}, isLegacy: ${isLegacy}`);
        return isLegacy && index.unique;
      }
    );

    for (const index of legacyIndexes) {
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  await dropLegacyUniqueIndexesIfExists("companies", ["email", "companyEmail", "tenantId", "apiKey"]);
  await dropLegacyUniqueIndexesIfExists("users", ["email"]);
=======
  await dropLegacyIndexesIfExists("companies");
  await dropLegacyIndexesIfExists("users");
>>>>>>> Stashed changes
};
