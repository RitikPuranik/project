// One-time codes stored (hashed) on the user document. One live code per user at a time;
// requesting a new one replaces the old. Codes are short-lived, single-use and lock after
// too many wrong guesses.
import crypto from "crypto";

export const OTP_TTL_MINUTES = 10;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

const hash = (otp) => crypto.createHmac("sha256", process.env.JWT_SECRET || "dev").update(String(otp)).digest("hex");

export const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/** True while the previous code was sent too recently to send another. */
export const onCooldown = (user) =>
  !!user.otp?.sentAt && Date.now() - new Date(user.otp.sentAt).getTime() < OTP_RESEND_SECONDS * 1000;

/** Creates a code for `purpose`, stores its hash on the user and returns the plain code. */
export const issueOtp = async (user, purpose) => {
  const otp = generateOtp();
  user.otp = {
    hash: hash(otp),
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    attempts: 0,
    sentAt: new Date(),
  };
  await user.save();
  return otp;
};

/** Checks a submitted code. On success the code is consumed (caller saves the user). */
export const checkOtp = (user, purpose, submitted) => {
  const o = user.otp;
  if (!o?.hash || o.purpose !== purpose) return "invalid";
  if (!o.expiresAt || new Date(o.expiresAt).getTime() < Date.now()) return "expired";
  if ((o.attempts ?? 0) >= OTP_MAX_ATTEMPTS) return "locked";
  const a = Buffer.from(hash(String(submitted ?? "").trim()), "hex");
  const b = Buffer.from(o.hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    user.otp.attempts = (o.attempts ?? 0) + 1;
    return "invalid";
  }
  user.otp = undefined;
  return "ok";
};
