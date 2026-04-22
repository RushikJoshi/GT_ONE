import Product from "../models/Product.js";
import { PRODUCTS } from "../constants/products.js";

export const listProducts = async (_req, res) => {
  try {
    let products = await Product.find({}).sort({ name: 1 });

    // Safety net for fresh/empty databases: ensure default product catalog exists.
    if (!products.length) {
      for (const productName of PRODUCTS) {
        await Product.findOneAndUpdate(
          { name: productName },
          { $setOnInsert: { name: productName } },
          { upsert: true, returnDocument: 'after' }
        );
      }
      products = await Product.find({}).sort({ name: 1 });
    }

    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
