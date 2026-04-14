import Product from "../models/Product.js";

export const listProducts = async (_req, res) => {
  try {
    const products = await Product.find({}).sort({ name: 1 });
    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
