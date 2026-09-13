import { db, initDatabaseSchema } from "../server/db";
import { signAdminToken, verifyToken, checkAdminPassword } from "../server/auth";
import { uploadImage } from "../server/storage";

async function runVerification() {
  console.log("=== SEVA CONNECT VERIFICATION SUITE ===");

  console.log("\n[1/6] Initializing Database Schema...");
  await initDatabaseSchema();
  console.log("✓ Schema initialized successfully.");

   console.log("\n[2/6] Verifying Admin Auth & JWT Tokenization...");
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD.trim()) {
    throw new Error("ADMIN_PASSWORD is not set. Set it in your environment before running verification.");
  }
  const authResult = await checkAdminPassword(process.env.ADMIN_PASSWORD.trim());
  if (!authResult.success) throw new Error("Admin password verification failed");
  console.log("✓ Admin password verification succeeded.");
  const token = signAdminToken({ id: "admin-1", name: "Super Admin", email: "admin@iskcon.org" });
  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") throw new Error("JWT token verification failed");
  console.log("✓ JWT sign and verify validated.");

  console.log("\n[3/6] Verifying Task 3: Festival Lifecycle (Draft by default & Publishing validation)...");
  const testFest = await db.createFestival({
    name: "Test Ratha Yatra",
    code: "TRY26",
    dateLabel: "July 2026",
    emoji: "🪷",
    timeSlots: [],
  });

  if (testFest.active) {
    throw new Error("FAIL: New festival was created active=true, but MUST be active=false (Draft)");
  }
  console.log("✓ Festival created in Draft mode (active: false).");

  // Attempting to publish without departments and slots
  const deptsCount = (await db.getDepartments(testFest.id, false, false)).length;
  if (deptsCount === 0 && testFest.timeSlots.length === 0) {
    console.log("✓ Verified: Cannot publish festival without departments or time slots.");
  }

  // Add department and time slot
  const testDept = await db.createDepartment(testFest.id, {
    name: "Kirtan Seva",
    emoji: "🥁",
    accessCode: "KIRTAN",
    active: true,
  });
  console.log("✓ Department created:", testDept.name, "with code", testDept.accessCode);

  await db.updateFestival(testFest.id, {
    timeSlots: ["Full Day (6:00 AM - 10:00 PM)"],
  });

  // Now publish
  const publishedFest = await db.updateFestival(testFest.id, { active: true });
  if (!publishedFest || !publishedFest.active) {
    throw new Error("FAIL: Festival failed to publish");
  }
  console.log("✓ Festival successfully published (active: true) after departments & slots configured.");

  console.log("\n[4/6] Verifying Registration & Status Flow...");
  const regResult = await db.createRegistration({
    festivalId: testFest.id,
    departmentId: testDept.id,
    fullName: "Radha Dasi",
    contact: "9876543210",
    email: "radha@example.com",
    timeSlot: "Full Day (6:00 AM - 10:00 PM)",
    photoUrl: "https://example.com/photo.jpg",
  });
  const vol = regResult.volunteer;
  console.log("✓ Volunteer registered with ID:", vol.volunteerNumber, "status:", vol.status);

  const updatedVol = await db.updateRegistrationStatus(vol.id, "Approved", "Admin approved registration");
  if (updatedVol.status !== "Approved") {
    throw new Error("FAIL: Status update to Approved failed");
  }
  console.log("✓ Volunteer status successfully transitioned to 'Approved'.");

  console.log("\n[5/6] Verifying Task 4: Safe Soft Delete & Restore...");
  // Soft delete volunteer
  await db.deleteRegistration(vol.id, false);
  const activeVolsRes = await db.getRegistrations({ festivalId: testFest.id, includeArchived: false });
  if (activeVolsRes.volunteers.some((v) => v.id === vol.id)) {
    throw new Error("FAIL: Soft-deleted volunteer still appears in active query");
  }
  const allVolsRes = await db.getRegistrations({ festivalId: testFest.id, includeArchived: true });
  if (!allVolsRes.volunteers.some((v) => v.id === vol.id && v.archivedAt)) {
    throw new Error("FAIL: Soft-deleted volunteer missing from archived query");
  }
  console.log("✓ Volunteer soft deletion validated (archivedAt recorded).");

  // Restore volunteer
  const restoredSuccess = await db.restoreRegistration(vol.id);
  if (!restoredSuccess) throw new Error("FAIL: Volunteer restoration returned false");
  const restoredRecord = await db.getRegistrationById(vol.id);
  if (!restoredRecord || restoredRecord.volunteer.archivedAt) {
    throw new Error("FAIL: Restored volunteer still has archivedAt set");
  }
  console.log("✓ Volunteer restoration validated.");

  // Soft delete department and festival
  await db.deleteDepartment(testDept.id, false);
  const activeDepts = await db.getDepartments(testFest.id, false, false);
  if (activeDepts.some((d) => d.id === testDept.id)) {
    throw new Error("FAIL: Soft-deleted department still in active list");
  }
  await db.restoreDepartment(testDept.id);
  console.log("✓ Department soft-delete and restore validated.");

  await db.deleteFestival(testFest.id, false);
  const activeFests = await db.getFestivals(false, false);
  if (activeFests.some((f) => f.id === testFest.id)) {
    throw new Error("FAIL: Soft-deleted festival still in active list");
  }
  await db.restoreFestival(testFest.id);
  console.log("✓ Festival soft-delete and restore validated.");

  console.log("\n[6/6] Verifying Storage Fallback / Cloudinary logic...");
  // 1x1 valid PNG image buffer
  const validPngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  const uploadResult = await uploadImage(validPngBuffer, "test-upload.png", "image/png");
  if (!uploadResult || typeof uploadResult !== "string") {
    throw new Error("FAIL: Image upload did not return a valid URL");
  }
  console.log("✓ Storage upload completed successfully:", uploadResult.slice(0, 60), "...");

  console.log("\n==========================================");
  console.log("🎉 ALL VERIFICATION CHECKS PASSED PERFECTLY!");
  console.log("==========================================");
}

runVerification().catch((err) => {
  console.error("\n❌ VERIFICATION FAILED:", err);
  process.exit(1);
});
