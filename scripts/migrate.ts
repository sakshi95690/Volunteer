import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getPool, initDatabaseSchema } from "../server/db.ts";

dotenv.config();

const DB_JSON_PATH = path.resolve(process.cwd(), "data", "db.json");

async function runMigration() {
  console.log("[Migration] Starting migration from data/db.json to PostgreSQL...");

  if (!fs.existsSync(DB_JSON_PATH)) {
    console.log("[Migration] No data/db.json found on disk. Initializing standard database schema...");
    await initDatabaseSchema();
    console.log("[Migration] Database initialized successfully.");
    return;
  }

  let jsonData: any;
  try {
    const raw = fs.readFileSync(DB_JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw);
  } catch (err: any) {
    console.error("[Migration] Failed to parse data/db.json:", err.message);
    return;
  }

  await initDatabaseSchema();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Migrate Festivals
    if (Array.isArray(jsonData.festivals)) {
      for (const f of jsonData.festivals) {
        await client.query(
          `INSERT INTO festivals (
            id, name, code, date_label, start_date, end_date, start_time, end_time,
            emoji, active, banner_image_url, logo_image_url, description,
            time_slots, form_config, custom_fields, card_config, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            date_label = EXCLUDED.date_label,
            time_slots = EXCLUDED.time_slots,
            form_config = EXCLUDED.form_config,
            card_config = EXCLUDED.card_config,
            updated_at = NOW()`,
          [
            f.id,
            f.name,
            f.code,
            f.dateLabel,
            f.startDate || null,
            f.endDate || null,
            f.startTime || null,
            f.endTime || null,
            f.emoji || "🙏",
            Boolean(f.active),
            f.bannerImageUrl || "",
            f.logoImageUrl || "",
            f.description || "",
            JSON.stringify(f.timeSlots || []),
            JSON.stringify(f.formConfig || {}),
            JSON.stringify(f.customFields || []),
            JSON.stringify(f.cardConfig || {}),
          ]
        );
        console.log(`[Migration] Migrated festival: ${f.name} (${f.id})`);
      }
    }

    // 2. Migrate Departments
    if (Array.isArray(jsonData.departments)) {
      for (const d of jsonData.departments) {
        await client.query(
          `INSERT INTO departments (
            id, festival_id, name, emoji, active, group_link, hod_name,
            hod_phone, hod_user_id, logo_url, access_code, capacity, instructions,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            emoji = EXCLUDED.emoji,
            access_code = EXCLUDED.access_code,
            capacity = EXCLUDED.capacity,
            instructions = EXCLUDED.instructions,
            updated_at = NOW()`,
          [
            d.id,
            d.festivalId,
            d.name,
            d.emoji || "🌼",
            Boolean(d.active),
            d.groupLink || "",
            d.hodName || "",
            d.hodPhone || "",
            d.hodUserId || "",
            d.logoUrl || "",
            d.accessCode,
            d.capacity || null,
            d.instructions || "",
          ]
        );
      }
      console.log(`[Migration] Migrated ${jsonData.departments.length} departments.`);
    }

    // 3. Migrate Volunteers
    if (Array.isArray(jsonData.volunteers)) {
      for (const v of jsonData.volunteers) {
        await client.query(
          `INSERT INTO volunteers (
            id, festival_id, volunteer_number, full_name, contact, email, time_slot,
            department_id, age, gender, address, photo_url, status, custom_fields,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            photo_url = EXCLUDED.photo_url,
            updated_at = NOW()`,
          [
            v.id,
            v.festivalId,
            v.volunteerNumber,
            v.fullName,
            v.contact,
            v.email || "",
            v.timeSlot,
            v.departmentId,
            v.age ? Number(v.age) || null : null,
            v.gender || null,
            v.address || "",
            v.photoUrl,
            v.status || "Pending for Approval",
            JSON.stringify(v.customFields || {}),
          ]
        );
      }
      console.log(`[Migration] Migrated ${jsonData.volunteers.length} volunteer records.`);
    }

    // 4. Migrate Status History
    if (Array.isArray(jsonData.volunteer_status_history)) {
      for (const h of jsonData.volunteer_status_history) {
        await client.query(
          `INSERT INTO volunteer_status_history (
            id, volunteer_id, old_status, new_status, changed_by, changed_at, remarks
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
          ON CONFLICT (id) DO NOTHING`,
          [h.id, h.volunteerId, h.oldStatus || null, h.newStatus, h.changedBy, h.remarks || ""]
        );
      }
      console.log(`[Migration] Migrated ${jsonData.volunteer_status_history.length} status history records.`);
    }

    // 5. Migrate Counters
    if (jsonData.registration_counters && typeof jsonData.registration_counters === "object") {
      for (const [festId, lastNum] of Object.entries(jsonData.registration_counters)) {
        await client.query(
          `INSERT INTO registration_counters (festival_id, last_number, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (festival_id) DO UPDATE SET last_number = GREATEST(registration_counters.last_number, EXCLUDED.last_number)`,
          [festId, Number(lastNum) || 0]
        );
      }
    }

    await client.query("COMMIT");
    console.log("[Migration] Database transaction committed successfully.");

    // Task 1 item 7: Delete data/db.json
    fs.unlinkSync(DB_JSON_PATH);
    console.log("[Migration] data/db.json permanently removed from disk.");
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[Migration] Migration failed, transaction rolled back:", err);
    throw err;
  } finally {
    client.release();
  }
}

runMigration()
  .then(() => {
    console.log("[Migration] Migration completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Migration] Fatal migration error:", err);
    process.exit(1);
  });
