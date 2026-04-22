import mongoose from "mongoose";

const dropLegacyUniqueIndexesIfExists = async (collectionName, fieldNames = []) => {
  try {
    console.log(`[MIGRATION] Database: ${mongoose.connection.name}`);
    const collection = mongoose.connection.collection(collectionName);
    const indexes = await collection.indexes();
    
    console.log(`[MIGRATION] Found ${indexes.length} indexes for ${collectionName}: ${indexes.map(i => i.name).join(", ")}`);

    const uniqueLegacyIndexes = indexes.filter(
      (index) =>
        index &&
        index.unique === true &&
        index.key &&
        fieldNames.some((fieldName) => Object.prototype.hasOwnProperty.call(index.key, fieldName))
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
  await dropLegacyUniqueIndexesIfExists("companies", ["email", "companyEmail", "company_email", "tenantId", "apiKey"]);
  await dropLegacyUniqueIndexesIfExists("users", ["email"]);
};
