import mongoose from "mongoose";
import { PRODUCTS } from "../constants/products.js";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: PRODUCTS
    }
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
