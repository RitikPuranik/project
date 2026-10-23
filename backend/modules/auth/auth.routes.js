import express from "express";
import { register, login, googleStart, googleCallback, refresh, logout, getMe, forgotPassword, verifyResetOtp, resetPassword, sendVerification, verifyEmail } from "./auth.controller.js";
import { protect } from "../../shared/middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/google", googleStart);
router.get("/google/callback", googleCallback);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);
router.post("/send-verification", protect, sendVerification);
router.post("/verify-email", protect, verifyEmail);
router.get("/me", protect, getMe);

export default router;
