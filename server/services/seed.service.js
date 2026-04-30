import Product from "../models/Product.js";
import { PRODUCTS } from "../constants/products.js";
import { ensureDefaultSuperAdminCredentials } from "./auth.service.js";
import {
  seedApplicationRegistry,
  syncLegacyCompanyApplicationAssignments
} from "./applicationRegistry.service.js";

export const seedInitialData = async () => {
  for (const productName of PRODUCTS) {
    await Product.findOneAndUpdate(
      { name: productName },
      { $setOnInsert: { name: productName } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  await seedApplicationRegistry();
  await syncLegacyCompanyApplicationAssignments();

  await ensureDefaultSuperAdminCredentials();
};
