import Product from "../models/Product.js";
import { PRODUCTS } from "../constants/products.js";
import { ensureDefaultSuperAdminCredentials } from "./auth.service.js";

export const seedInitialData = async () => {
  for (const productName of PRODUCTS) {
    await Product.findOneAndUpdate(
      { name: productName },
      { $setOnInsert: { name: productName } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  await ensureDefaultSuperAdminCredentials();
};
