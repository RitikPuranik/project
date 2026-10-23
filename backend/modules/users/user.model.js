import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: ["admin", "project_manager", "member", "viewer"],
      default: "viewer",
    },
    avatar: { type: String, default: "" },
    googleId: { type: String, unique: true, sparse: true }, // set once an account is linked to Google
    isActive: { type: Boolean, default: true }, // false = deactivated: cannot log in or use any token
    isVerified: { type: Boolean, default: true }, // simplified: no email verification flow wired up yet
    refreshToken: { type: String, default: null },
    // Pending one-time code (hashed) for password reset / email verification
    otp: {
      hash: String,
      purpose: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
      sentAt: Date,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
    isActive: this.isActive !== false,
  };
};

export default mongoose.model("User", userSchema);
