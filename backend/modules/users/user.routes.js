import express from "express";
import { protect, authorize } from "../../shared/middleware/auth.js";
import {
  listUsers,
  createUser,
  updateUser,
  updateUserRole,
  deactivateUser,
  activateUser,
} from "./user.controller.js";

const router = express.Router();

router.use(protect);

router.get("/", listUsers); // scoped by the caller's role
router.post("/", authorize("admin"), createUser);
router.put("/:id", authorize("admin"), updateUser);
router.put("/:id/role", authorize("admin"), updateUserRole);
router.put("/:id/deactivate", authorize("admin"), deactivateUser);
router.put("/:id/activate", authorize("admin"), activateUser);

export default router;
