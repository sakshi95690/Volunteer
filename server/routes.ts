import express, { Request, Response } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db } from "./db.ts";
import {
  checkAdminPassword,
  signAdminToken,
  signHODToken,
  requireAdmin,
  requireHOD,
  optionalAuth,
  AuthenticatedRequest,
} from "./auth.ts";
import { uploadImage, saveBase64Image } from "./storage.ts";
import type { VolunteerStatus } from "./types.ts";

export const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Task 5.3: Rate Limiting
// 10 registrations per IP per 15 minutes
export const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many registrations submitted from this network. Please wait 15 minutes before submitting again.",
  },
});

// 20 image uploads per IP per 15 minutes
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many file uploads from this network. Please wait 15 minutes before uploading again.",
  },
});

// 5 lookup requests per IP per 15 minutes to prevent contact enumeration
export const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many lookup requests from this network. Please wait 15 minutes before searching again.",
  },
});

// Helper to format volunteer ID
function formatVolunteerId(festivalCode: string, num: number): string {
  return `${festivalCode || "VOL"}-${String(num).padStart(4, "0")}`;
}

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------

router.post("/auth/admin/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password is required" });
    }

    const verify = await checkAdminPassword(password, email);
    if (!verify.success) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    const token = signAdminToken(verify.user);
    return res.json({
      token,
      user: {
        id: verify.user?.id || "admin-default",
        role: "admin",
        name: verify.user?.name || "Festival Administrator",
        email: verify.user?.email || "admin@iskcon.org",
      },
    });
  } catch (err: any) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Authentication system error" });
  }
});

router.post("/auth/hod/login", async (req: Request, res: Response) => {
  try {
    const { accessCode } = req.body;
    if (!accessCode || typeof accessCode !== "string") {
      return res.status(400).json({ error: "Access code is required" });
    }

    const match = await db.getDepartmentByCode(accessCode);
    if (!match) {
      return res.status(401).json({
        error: "That access code does not match any active department. Check with your festival admin.",
      });
    }

    const token = signHODToken(match.department.id, match.festival.id, match.department.hodName);
    return res.json({
      token,
      session: {
        festival: match.festival,
        department: match.department,
      },
    });
  } catch (err: any) {
    console.error("HOD login error:", err);
    return res.status(500).json({ error: "Failed to authenticate HOD" });
  }
});

router.get("/auth/me", optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.json({ user: null });
  }

  if (req.user.role === "hod" && req.user.departmentId && req.user.festivalId) {
    const dept = await db.getDepartment(req.user.departmentId);
    const fest = await db.getFestival(req.user.festivalId);
    return res.json({
      user: req.user,
      session: dept && fest ? { department: dept, festival: fest } : null,
    });
  }

  return res.json({ user: req.user });
});

// -----------------------------------------------------------------------------
// ADMIN USERS (CRUD - Requirement 6)
// -----------------------------------------------------------------------------

router.get("/admin/users", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await db.getAdminUsers();
    return res.json(users);
  } catch (err: any) {
    console.error("Get admin users error:", err);
    return res.status(500).json({ error: "Failed to fetch admin users" });
  }
});

router.post("/admin/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
    if (!email || !email.trim()) return res.status(400).json({ error: "Email is required" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const passwordHash = await bcrypt.hash(password.trim(), 10);
    const user = await db.createAdminUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: role === "super_admin" ? "super_admin" : "admin",
    });

    return res.status(201).json(user);
  } catch (err: any) {
    console.error("Create admin user error:", err);
    if (err?.message?.includes("UNIQUE") || err?.code === "23505") {
      return res.status(409).json({ error: "An admin user with this email already exists" });
    }
    return res.status(500).json({ error: err.message || "Failed to create admin user" });
  }
});

router.put("/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, role, active, password } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (role !== undefined) updates.role = role === "super_admin" ? "super_admin" : "admin";
    if (active !== undefined) updates.active = Boolean(active);
    if (password && password.trim().length >= 6) {
      updates.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const updated = await db.updateAdminUser(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: "Admin user not found" });
    return res.json(updated);
  } catch (err: any) {
    console.error("Update admin user error:", err);
    return res.status(500).json({ error: err.message || "Failed to update admin user" });
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.id === req.params.id) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }
    const permanent = req.query.permanent === "true";
    const success = await db.deleteAdminUser(req.params.id, permanent);
    if (!success) return res.status(404).json({ error: "Admin user not found" });
    return res.json({ success: true, message: "Admin user deactivated" });
  } catch (err: any) {
    console.error("Delete admin user error:", err);
    return res.status(500).json({ error: "Failed to deactivate admin user" });
  }
});

// -----------------------------------------------------------------------------
// HOD USERS (CRUD - Requirement 8)
// -----------------------------------------------------------------------------

router.get("/admin/hod-users", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await db.getHodUsers();
    return res.json(users);
  } catch (err: any) {
    console.error("Get HOD users error:", err);
    return res.status(500).json({ error: "Failed to fetch HOD users" });
  }
});

router.post("/admin/hod-users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, phone, email, departmentId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
    if (!phone || !phone.trim()) return res.status(400).json({ error: "Phone number is required" });

    const user = await db.createHodUser({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim().toLowerCase() : "",
      departmentId: departmentId || undefined,
    });

    // Link HOD to department for accountability/audit if departmentId provided
    if (departmentId) {
      await db.updateDepartment(departmentId, {
        hodUserId: user.id,
        hodName: user.name,
        hodPhone: user.phone,
      });
    }

    return res.status(201).json(user);
  } catch (err: any) {
    console.error("Create HOD user error:", err);
    return res.status(500).json({ error: err.message || "Failed to create HOD user" });
  }
});

router.put("/admin/hod-users/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, phone, email, departmentId, active } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (departmentId !== undefined) updates.departmentId = departmentId || "";
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await db.updateHodUser(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: "HOD user not found" });

    // Sync to department if assigned
    if (updated.departmentId) {
      await db.updateDepartment(updated.departmentId, {
        hodUserId: updated.id,
        hodName: updated.name,
        hodPhone: updated.phone,
      });
    }

    return res.json(updated);
  } catch (err: any) {
    console.error("Update HOD user error:", err);
    return res.status(500).json({ error: err.message || "Failed to update HOD user" });
  }
});

router.delete("/admin/hod-users/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const success = await db.deleteHodUser(req.params.id);
    if (!success) return res.status(404).json({ error: "HOD user not found" });
    return res.json({ success: true, message: "HOD user deactivated" });
  } catch (err: any) {
    console.error("Delete HOD user error:", err);
    return res.status(500).json({ error: "Failed to deactivate HOD user" });
  }
});

// -----------------------------------------------------------------------------
// FESTIVALS
// -----------------------------------------------------------------------------

router.get("/festivals", async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const includeArchived = req.query.includeArchived === "true";
    const festivals = await db.getFestivals(activeOnly, includeArchived);
    return res.json(festivals);
  } catch (err: any) {
    console.error("Get festivals error:", err);
    return res.status(500).json({ error: "Failed to load festivals" });
  }
});

router.get("/festivals/:id", async (req: Request, res: Response) => {
  try {
    const festival = await db.getFestival(req.params.id);
    if (!festival) {
      return res.status(404).json({ error: "Festival not found" });
    }
    const departments = await db.getDepartments(festival.id);
    const counts = await db.getDepartmentCountsForFestival(festival.id);
    return res.json({
      ...festival,
      departments,
      departmentCounts: counts,
    });
  } catch (err: any) {
    console.error("Get festival error:", err);
    return res.status(500).json({ error: "Failed to load festival" });
  }
});

// Task 3: New festival created as draft (active: false by default)
router.post("/festivals", requireAdmin, async (req: Request, res: Response) => {
  try {
    const festival = await db.createFestival({
      ...req.body,
      active: false, // Enforce draft state on creation
    });
    return res.status(201).json(festival);
  } catch (err: any) {
    console.error("Create festival error:", err);
    return res.status(500).json({ error: "Failed to create festival" });
  }
});

// Task 3: Publish festival (activates festival immediately)
router.post("/festivals/:id/publish", requireAdmin, async (req: Request, res: Response) => {
  try {
    const fest = await db.getFestival(req.params.id);
    if (!fest) {
      return res.status(404).json({ error: "Festival not found" });
    }

    const updated = await db.updateFestival(fest.id, { active: true });
    return res.json({ success: true, festival: updated });
  } catch (err: any) {
    console.error("Publish festival error:", err);
    return res.status(500).json({ error: "Failed to publish festival" });
  }
});

router.put("/festivals/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const updated = await db.updateFestival(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Festival not found" });
    }
    return res.json(updated);
  } catch (err: any) {
    console.error("Update festival error:", err);
    return res.status(500).json({ error: "Failed to update festival" });
  }
});

// Task 4: Soft delete festival by default, permanent purge only if specified
router.delete("/festivals/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const permanent = req.query.permanent === "true";
    const success = await db.deleteFestival(req.params.id, permanent);
    if (!success) {
      return res.status(404).json({ error: "Festival not found" });
    }
    return res.json({
      success: true,
      message: permanent ? "Festival permanently purged" : "Festival moved to archive",
    });
  } catch (err: any) {
    console.error("Delete festival error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete festival" });
  }
});

// Task 4: Restore archived festival
router.post("/festivals/:id/restore", requireAdmin, async (req: Request, res: Response) => {
  try {
    const success = await db.restoreFestival(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Festival not found" });
    }
    return res.json({ success: true, message: "Festival restored from archive" });
  } catch (err: any) {
    console.error("Restore festival error:", err);
    return res.status(500).json({ error: "Failed to restore festival" });
  }
});

router.post("/festivals/:id/duplicate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const copy = await db.duplicateFestival(req.params.id);
    if (!copy) {
      return res.status(404).json({ error: "Festival not found" });
    }
    return res.status(201).json(copy);
  } catch (err: any) {
    console.error("Duplicate festival error:", err);
    return res.status(500).json({ error: "Failed to duplicate festival" });
  }
});

// -----------------------------------------------------------------------------
// DEPARTMENTS
// -----------------------------------------------------------------------------

router.get("/festivals/:id/departments", async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const includeArchived = req.query.includeArchived === "true";
    const departments = await db.getDepartments(req.params.id, activeOnly, includeArchived);
    const counts = await db.getDepartmentCountsForFestival(req.params.id);
    const withCounts = departments.map((d) => ({
      ...d,
      currentCount: counts[d.id] || 0,
      isFull: d.capacity && d.capacity > 0 ? (counts[d.id] || 0) >= d.capacity : false,
    }));
    return res.json(withCounts);
  } catch (err: any) {
    console.error("Get departments error:", err);
    return res.status(500).json({ error: "Failed to load departments" });
  }
});

router.post("/festivals/:id/departments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const dept = await db.createDepartment(req.params.id, req.body);
    return res.status(201).json(dept);
  } catch (err: any) {
    console.error("Create department error:", err);
    return res.status(500).json({ error: "Failed to create department" });
  }
});

router.put("/departments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const updated = await db.updateDepartment(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Department not found" });
    }
    return res.json(updated);
  } catch (err: any) {
    console.error("Update department error:", err);
    return res.status(500).json({ error: "Failed to update department" });
  }
});

// Task 4: Soft delete department
router.delete("/departments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const permanent = req.query.permanent === "true";
    const success = await db.deleteDepartment(req.params.id, permanent);
    if (!success) {
      return res.status(404).json({ error: "Department not found" });
    }
    return res.json({
      success: true,
      message: permanent ? "Department permanently removed" : "Department moved to archive",
    });
  } catch (err: any) {
    console.error("Delete department error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete department" });
  }
});

router.post("/departments/bulk-delete", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { ids, permanent } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array" });
    }
    const count = await db.deleteDepartmentsBulk(ids, permanent === true);
    return res.json({
      success: true,
      deletedCount: count,
      message: permanent ? `Permanently deleted ${count} departments` : `Moved ${count} departments to archive`,
    });
  } catch (err: any) {
    console.error("Bulk delete departments error:", err);
    return res.status(500).json({ error: err.message || "Failed to bulk delete departments" });
  }
});

// Task 4: Restore department
router.post("/departments/:id/restore", requireAdmin, async (req: Request, res: Response) => {
  try {
    const success = await db.restoreDepartment(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Department not found" });
    }
    return res.json({ success: true, message: "Department restored from archive" });
  } catch (err: any) {
    console.error("Restore department error:", err);
    return res.status(500).json({ error: "Failed to restore department" });
  }
});

router.post("/departments/:id/new-code", requireAdmin, async (req: Request, res: Response) => {
  try {
    const newCode = await db.regenerateAccessCode(req.params.id);
    if (!newCode) {
      return res.status(404).json({ error: "Department not found" });
    }
    return res.json({ accessCode: newCode });
  } catch (err: any) {
    console.error("Regenerate code error:", err);
    return res.status(500).json({ error: "Failed to regenerate access code" });
  }
});

// -----------------------------------------------------------------------------
// VOLUNTEERS / REGISTRATIONS
// -----------------------------------------------------------------------------

// Task 5.3: Rate limited public registration
router.post("/registrations", registrationLimiter, async (req: Request, res: Response) => {
  try {
    const {
      festivalId,
      fullName,
      contact,
      email,
      timeSlot,
      departmentId,
      age,
      gender,
      address,
      photo,
      customFields,
    } = req.body;

    // Server-side validation
    if (!festivalId) return res.status(400).json({ error: "Festival is required" });
    if (!fullName || !fullName.trim())
      return res.status(400).json({ error: "Full Name is required" });

    const cleanContact = (contact || "").replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(cleanContact)) {
      return res
        .status(400)
        .json({ error: "Enter a valid 10-digit mobile number starting with 6-9" });
    }

    if (!timeSlot) return res.status(400).json({ error: "Time slot is required" });
    if (!departmentId) return res.status(400).json({ error: "Department is required" });
    if (!photo) return res.status(400).json({ error: "Volunteer photo is required" });

    // Handle photo storage (if Base64 data URL, upload via Cloudinary)
    let photoUrl = photo;
    if (photo.startsWith("data:")) {
      try {
        photoUrl = await saveBase64Image(photo, "volunteer-photo");
      } catch (uploadErr) {
        console.warn("Base64 photo upload warning, storing as data URI:", uploadErr);
      }
    }

    const result = await db.createRegistration({
      festivalId,
      fullName,
      contact: cleanContact,
      email,
      timeSlot,
      departmentId,
      age,
      gender,
      address,
      photoUrl,
      customFields,
    });

    const formattedId = formatVolunteerId(result.festival.code, result.volunteer.volunteerNumber);

    return res.status(201).json({
      volunteer: result.volunteer,
      festival: result.festival,
      department: result.department,
      formattedId,
    });
  } catch (err: any) {
    console.error("Create registration error:", err);
    return res.status(400).json({ error: err.message || "Failed to submit registration" });
  }
});

router.get("/registrations/find", lookupLimiter, async (req: Request, res: Response) => {
  try {
    const contact = (req.query.contact as string) || "";
    const clean = contact.replace(/\D/g, "");
    if (clean.length !== 10) {
      return res.status(400).json({ error: "Please enter a valid 10-digit mobile number" });
    }

    const matches = await db.getRegistrationsByContact(clean);
    return res.json(matches);
  } catch (err: any) {
    console.error("Find registrations error:", err);
    return res.status(500).json({ error: "Failed to search registrations" });
  }
});

router.get("/registrations", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { festivalId, departmentId, timeSlot, status, search, page, limit, includeArchived } =
      req.query;
    const result = await db.getRegistrations({
      festivalId: festivalId as string,
      departmentId: departmentId as string,
      timeSlot: timeSlot as string,
      status: status as string,
      search: search as string,
      includeArchived: includeArchived === "true",
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50,
    });
    return res.json(result);
  } catch (err: any) {
    console.error("Get registrations error:", err);
    return res.status(500).json({ error: "Failed to fetch registrations" });
  }
});

router.get("/registrations/:id", requireHOD, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const details = await db.getRegistrationById(req.params.id);
    if (!details) {
      return res.status(404).json({ error: "Volunteer not found" });
    }

    // If HOD, verify department match
    if (req.user?.role === "hod" && details.volunteer.departmentId !== req.user.departmentId) {
      return res
        .status(403)
        .json({ error: "Forbidden: You cannot access volunteers from other departments" });
    }

    return res.json(details);
  } catch (err: any) {
    console.error("Get registration detail error:", err);
    return res.status(500).json({ error: "Failed to load volunteer details" });
  }
});

router.patch("/registrations/:id/status", requireHOD, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, remarks } = req.body as { status: VolunteerStatus; remarks?: string };
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const reg = await db.getRegistrationById(req.params.id);
    if (!reg) {
      return res.status(404).json({ error: "Volunteer not found" });
    }

    // Role enforcement: HOD can ONLY approve/reject within their assigned department
    if (req.user?.role === "hod") {
      if (reg.volunteer.departmentId !== req.user.departmentId) {
        return res
          .status(403)
          .json({ error: "Forbidden: You cannot modify volunteers from another department" });
      }
      if (!["Approved", "Rejected"].includes(status)) {
        return res.status(403).json({ error: "HOD can only set status to Approved or Rejected" });
      }
    }

    const changedBy =
      req.user?.role === "admin"
        ? "Festival Administrator"
        : req.user?.name || "Department HOD";
    const updated = await db.updateRegistrationStatus(req.params.id, status, changedBy, remarks);
    return res.json(updated);
  } catch (err: any) {
    console.error("Update status error:", err);
    return res.status(500).json({ error: "Failed to update volunteer status" });
  }
});

const handleUpdateRegistration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reg = await db.getRegistrationById(req.params.id);
    if (!reg) {
      return res.status(404).json({ error: "Volunteer not found" });
    }

    if (req.user?.role === "hod" && reg.volunteer.departmentId !== req.user.departmentId) {
      return res
        .status(403)
        .json({ error: "Forbidden: You cannot modify volunteers from another department" });
    }

    const updates = { ...req.body };
    const rawPhoto = updates.photo || updates.photoUrl;
    if (rawPhoto && typeof rawPhoto === "string" && rawPhoto.startsWith("data:")) {
      try {
        updates.photoUrl = await saveBase64Image(rawPhoto, "volunteer-photo");
        delete updates.photo;
      } catch (uploadErr) {
        console.warn("Base64 photo upload warning during volunteer edit:", uploadErr);
      }
    }

    const updated = await db.updateRegistration(req.params.id, updates);
    return res.json(updated);
  } catch (err: any) {
    console.error("Update volunteer error:", err);
    return res.status(500).json({ error: "Failed to update volunteer" });
  }
};

router.patch("/registrations/:id", requireHOD, handleUpdateRegistration);
router.put("/registrations/:id", requireHOD, handleUpdateRegistration);

// Task 4: Soft delete registration
router.delete("/registrations/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const permanent = req.query.permanent === "true";
    const success = await db.deleteRegistration(req.params.id, permanent);
    if (!success) {
      return res.status(404).json({ error: "Volunteer not found" });
    }
    return res.json({
      success: true,
      message: permanent ? "Volunteer permanently deleted" : "Volunteer moved to archive",
    });
  } catch (err: any) {
    console.error("Delete volunteer error:", err);
    return res.status(500).json({ error: "Failed to delete volunteer" });
  }
});

router.post("/registrations/bulk-delete", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { ids, permanent } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array" });
    }
    const count = await db.deleteRegistrationsBulk(ids, permanent === true);
    return res.json({
      success: true,
      deletedCount: count,
      message: permanent ? `Permanently deleted ${count} volunteers` : `Moved ${count} volunteers to archive`,
    });
  } catch (err: any) {
    console.error("Bulk delete registrations error:", err);
    return res.status(500).json({ error: err.message || "Failed to bulk delete volunteers" });
  }
});

// Task 4: Restore registration
router.post("/registrations/:id/restore", requireAdmin, async (req: Request, res: Response) => {
  try {
    const success = await db.restoreRegistration(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Volunteer not found" });
    }
    return res.json({ success: true, message: "Volunteer restored from archive" });
  } catch (err: any) {
    console.error("Restore volunteer error:", err);
    return res.status(500).json({ error: "Failed to restore volunteer" });
  }
});

// -----------------------------------------------------------------------------
// HOD PORTAL ROUTE (Strictly Scoped)
// -----------------------------------------------------------------------------

router.get("/hod/registrations", requireHOD, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const hod = req.user;
    if (!hod || !hod.departmentId || !hod.festivalId) {
      return res.status(401).json({ error: "Invalid HOD session" });
    }

        const { search, status } = req.query;
    const result = await db.getAllRegistrations({
      festivalId: hod.festivalId,
      departmentId: hod.departmentId,
      search: search as string,
      status: status as string,
    });

    const dept = await db.getDepartment(hod.departmentId);
    const fest = await db.getFestival(hod.festivalId);

    return res.json({
      volunteers: result.volunteers,
      total: result.total,
      truncated: result.truncated,
      department: dept,
      festival: fest,
    });
  } catch (err: any) {
    console.error("HOD registrations error:", err);
    return res.status(500).json({ error: "Failed to load department volunteers" });
  }
});

// -----------------------------------------------------------------------------
// FILE UPLOAD (Photo / Banner / Logo)
// -----------------------------------------------------------------------------

// Task 5.3: Rate limited file upload
router.post("/upload", uploadLimiter, upload.single("file") as any, async (req: Request, res: Response) => {
  try {
    if (req.file) {
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res
          .status(400)
          .json({ error: "Invalid file type. Only JPG, PNG, and WebP images are allowed." });
      }

      const bucket = (req.body.bucket as string) || "volunteer-photos";
      const url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype, bucket);
      return res.json({ url });
    }

    if (req.body.base64) {
      const bucket = (req.body.bucket as string) || "volunteer-photos";
      const prefix = (req.body.prefix as string) || "upload";
      const url = await saveBase64Image(req.body.base64, prefix, bucket);
      return res.json({ url });
    }

    return res.status(400).json({ error: "No file or base64 image provided" });
  } catch (err: any) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: err.message || "Failed to upload file" });
  }
});

// -----------------------------------------------------------------------------
// DASHBOARD STATS
// -----------------------------------------------------------------------------

router.get("/stats/dashboard", requireAdmin, async (req: Request, res: Response) => {
  try {
    const festivalId = req.query.festivalId as string;
    const stats = await db.getDashboardStats(festivalId);
    return res.json(stats);
  } catch (err: any) {
    console.error("Stats error:", err);
    return res.status(500).json({ error: "Failed to load dashboard statistics" });
  }
});
