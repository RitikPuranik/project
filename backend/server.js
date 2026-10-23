import dotenv from "dotenv";
dotenv.config();

const { default: connectDB } = await import("./config/db.js");
const { createApp } = await import("./app.js");

connectDB();

const PORT = process.env.PORT || 5000;
createApp().listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
