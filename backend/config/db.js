import mongoose from "mongoose";

const connectDB = async () => {
  try {
    console.log("MONGO_URI:", process.env.MONGO_URI);

    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected:", conn.connection.host);
  } catch (err) {
    console.error("========== FULL ERROR ==========");
    console.error(err);
    console.error("Name:", err.name);
    console.error("Code:", err.code);
    console.error("Cause:", err.cause);
    console.error("================================");
    process.exit(1);
  }
};

export default connectDB;