import pg from "pg";
import { newDb } from "pg-mem";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type {
  Festival,
  Department,
  Volunteer,
  VolunteerStatus,
  VolunteerStatusHistory,
  AdminUser,
  HODUser,
} from "./types.ts";


const { Pool } = pg;

let pool: pg.Pool;

export function getPool(): pg.Pool {
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    const isLocal =
      process.env.DATABASE_URL.includes("localhost") ||
      process.env.DATABASE_URL.includes("127.0.0.1");

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    console.log("[Database] Connected via PostgreSQL DATABASE_URL pool");
  } else {
    // Fallback in-memory PostgreSQL engine via pg-mem
    console.log(
      "[Database] Notice: DATABASE_URL not set. Initializing in-memory PostgreSQL engine (pg-mem)."
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
  
    const memDb = newDb();
    const memAdapter = memDb.adapters.createPg();
    pool = new memAdapter.Pool();
  }

  return pool;
}

// Helper: Generates unique 6-character department access code
function genAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export async function generateUniqueAccessCode(
  p: pg.Pool,
  excludeId?: string,
  maxTries = 5
): Promise<string> {
  for (let i = 0; i < maxTries; i++) {
    const code = genAccessCode().toUpperCase();
    let query = "SELECT id FROM departments WHERE UPPER(access_code) = $1";
    const params: any[] = [code];
    if (excludeId) {
      query += " AND id != $2";
      params.push(excludeId);
    }
    const check = await p.query(query, params);
    if (check.rows.length === 0) {
      return code;
    }
  }
  return (genAccessCode() + Math.random().toString(36).slice(2, 4)).slice(0, 10).toUpperCase();
}

function uid(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Row mappers from Postgres snake_case to TypeScript camelCase interfaces
export function mapFestivalRow(row: any): Festival {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    dateLabel: row.date_label,
    startDate: row.start_date
      ? typeof row.start_date === "object"
        ? row.start_date.toISOString().slice(0, 10)
        : String(row.start_date)
      : "",
    endDate: row.end_date
      ? typeof row.end_date === "object"
        ? row.end_date.toISOString().slice(0, 10)
        : String(row.end_date)
      : "",
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : "",
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : "",
    emoji: row.emoji || "🙏",
    active: Boolean(row.active),
    bannerImageUrl: row.banner_image_url || "",
    logoImageUrl: row.logo_image_url || "",
    description: row.description || "",
    timeSlots:
      typeof row.time_slots === "string"
        ? JSON.parse(row.time_slots)
        : row.time_slots || [],
    formConfig:
      typeof row.form_config === "string"
        ? JSON.parse(row.form_config)
        : row.form_config || {
            email: { enabled: false, required: false },
            age: { enabled: true, required: true },
            gender: { enabled: true, required: true },
            address: { enabled: true, required: true },
          },
    customFields:
      typeof row.custom_fields === "string"
        ? JSON.parse(row.custom_fields)
        : row.custom_fields || [],
    cardConfig:
      typeof row.card_config === "string"
        ? JSON.parse(row.card_config)
        : row.card_config || {
            primaryColor: "#14415C",
            accentColor: "#C6961F",
            showDepartment: true,
            showContact: true,
            showHOD: true,
            showTimeSlot: true,
          },
    archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

export function mapDepartmentRow(row: any): Department {
  return {
    id: row.id,
    festivalId: row.festival_id,
    name: row.name,
    emoji: row.emoji || "🌼",
    active: Boolean(row.active),
    groupLink: row.group_link || "",
    hodName: row.hod_name || "",
    hodPhone: row.hod_phone || "",
    hodUserId: row.hod_user_id || "",
    logoUrl: row.logo_url || "",
    accessCode: row.access_code,
    capacity: row.capacity !== null && row.capacity !== undefined ? Number(row.capacity) : null,
    instructions: row.instructions || "",
    archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

export function mapVolunteerRow(row: any): Volunteer {
  return {
    id: row.id,
    festivalId: row.festival_id,
    volunteerNumber: Number(row.volunteer_number),
    fullName: row.full_name,
    contact: row.contact,
    email: row.email || "",
    timeSlot: row.time_slot,
    departmentId: row.department_id,
    age: row.age,
    gender: row.gender,
    address: row.address || "",
    photoUrl: row.photo_url,
    status: row.status as VolunteerStatus,
    customFields:
      typeof row.custom_fields === "string"
        ? JSON.parse(row.custom_fields)
        : row.custom_fields || {},
    archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

export function mapHistoryRow(row: any): VolunteerStatusHistory {
  return {
    id: row.id,
    volunteerId: row.volunteer_id,
    oldStatus: row.old_status || undefined,
    newStatus: row.new_status,
    changedBy: row.changed_by,
    changedAt: row.changed_at ? new Date(row.changed_at).getTime() : Date.now(),
    remarks: row.remarks || "",
  };
}

export function mapAdminUserRow(row: any): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || "admin",
    active: Boolean(row.active),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

export function mapHodUserRow(row: any): HODUser {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    departmentId: row.department_id || "",
    active: Boolean(row.active),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

// Database schema initialization & bootstrap
let schemaInitialized = false;
let schemaPromise: Promise<void> | null = null;

export async function initDatabaseSchema(): Promise<void> {
  if (schemaInitialized) return;
  if (!schemaPromise) {
    schemaPromise = doInitDatabaseSchema();
  }
  return schemaPromise;
}

async function doInitDatabaseSchema(): Promise<void> {
  const p = getPool();
  const isPostgresUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

  try {
    if (!isPostgresUrl) {
      // In-memory pg-mem DDL without AST constraints that trigger planner warnings
      await p.query(`
        CREATE TABLE IF NOT EXISTS festivals (
          id TEXT PRIMARY KEY,
          name TEXT,
          code TEXT,
          date_label TEXT,
          start_date DATE,
          end_date DATE,
          start_time TIME,
          end_time TIME,
          emoji TEXT,
          active BOOLEAN,
          banner_image_url TEXT,
          logo_image_url TEXT,
          description TEXT,
          time_slots JSONB,
          form_config JSONB,
          custom_fields JSONB,
          card_config JSONB,
          archived_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ
        );
      `);

      await p.query(`
        CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY,
          festival_id TEXT,
          name TEXT,
          emoji TEXT,
          active BOOLEAN,
          group_link TEXT,
          hod_name TEXT,
          hod_phone TEXT,
          hod_user_id TEXT,
          logo_url TEXT,
          access_code TEXT UNIQUE,
          capacity INTEGER,
          instructions TEXT,
          archived_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ
        );
      `);

      await p.query(`
        CREATE TABLE IF NOT EXISTS registration_counters (
          festival_id TEXT PRIMARY KEY,
          last_number INTEGER,
          updated_at TIMESTAMPTZ
        );
      `);

      await p.query(`
        CREATE TABLE IF NOT EXISTS volunteers (
          id TEXT PRIMARY KEY,
          festival_id TEXT,
          volunteer_number INTEGER,
          full_name TEXT,
          contact TEXT,
          email TEXT,
          time_slot TEXT,
          department_id TEXT,
          age INTEGER,
          gender TEXT,
          address TEXT,
          photo_url TEXT,
          status TEXT,
          custom_fields JSONB,
          archived_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ
        );
      `);

      await p.query(`
        CREATE TABLE IF NOT EXISTS volunteer_status_history (
          id TEXT PRIMARY KEY,
          volunteer_id TEXT,
          old_status TEXT,
          new_status TEXT,
          changed_by TEXT,
          changed_at TIMESTAMPTZ,
          remarks TEXT
        );
      `);

      await p.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id TEXT PRIMARY KEY,
          name TEXT,
          email TEXT,
          role TEXT,
          password_hash TEXT,
          active BOOLEAN,
          created_at TIMESTAMPTZ
        );
      `);

      await p.query(`
        CREATE TABLE IF NOT EXISTS hod_users (
          id TEXT PRIMARY KEY,
          name TEXT,
          phone TEXT,
          email TEXT,
          department_id TEXT,
          active BOOLEAN,
          created_at TIMESTAMPTZ
        );
      `);
    } else {
      // Production PostgreSQL DDL with full relational integrity and defaults
      await p.query(`
        CREATE TABLE IF NOT EXISTS festivals (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          code VARCHAR(10) NOT NULL,
          date_label TEXT NOT NULL,
          start_date DATE,
          end_date DATE,
          start_time TIME,
          end_time TIME,
          emoji VARCHAR(20) DEFAULT '🙏',
          active BOOLEAN DEFAULT FALSE,
          banner_image_url TEXT,
          logo_image_url TEXT,
          description TEXT,
          time_slots JSONB,
          form_config JSONB,
          custom_fields JSONB,
          card_config JSONB,
          archived_at TIMESTAMPTZ DEFAULT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY,
          festival_id TEXT NOT NULL REFERENCES festivals(id),
          name TEXT NOT NULL,
          emoji VARCHAR(20) DEFAULT '🌼',
          active BOOLEAN DEFAULT TRUE,
          group_link TEXT,
          hod_name TEXT,
          hod_phone VARCHAR(25),
          hod_user_id TEXT,
          logo_url TEXT,
          access_code VARCHAR(30) NOT NULL UNIQUE,
          capacity INTEGER DEFAULT NULL,
          instructions TEXT,
          archived_at TIMESTAMPTZ DEFAULT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS registration_counters (
          festival_id TEXT PRIMARY KEY REFERENCES festivals(id),
          last_number INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS volunteers (
          id TEXT PRIMARY KEY,
          festival_id TEXT NOT NULL REFERENCES festivals(id),
          volunteer_number INTEGER NOT NULL,
          full_name TEXT NOT NULL,
          contact VARCHAR(25) NOT NULL,
          email TEXT,
          time_slot TEXT NOT NULL,
          department_id TEXT NOT NULL REFERENCES departments(id),
          age INTEGER,
          gender VARCHAR(20),
          address TEXT,
          photo_url TEXT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'Pending for Approval',
          custom_fields JSONB,
          archived_at TIMESTAMPTZ DEFAULT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS volunteer_status_history (
          id TEXT PRIMARY KEY,
          volunteer_id TEXT NOT NULL REFERENCES volunteers(id),
          old_status VARCHAR(50),
          new_status VARCHAR(50) NOT NULL,
          changed_by TEXT NOT NULL,
          changed_at TIMESTAMPTZ DEFAULT NOW(),
          remarks TEXT
        );

        CREATE TABLE IF NOT EXISTS admin_users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'admin',
          password_hash TEXT NOT NULL,
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS hod_users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone VARCHAR(25) NOT NULL,
          email TEXT,
          department_id TEXT REFERENCES departments(id),
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    }

    // Partial unique index for duplicate registration prevention (only active non-archived)
    try {
      await p.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_registration 
        ON volunteers (festival_id, contact) 
        WHERE status != 'Rejected' AND archived_at IS NULL;
      `);
    } catch {
      // Ignored if unsupported in in-memory driver
    }

    // Ensure get_next_volunteer_number function is registered
    try {
      await p.query(`
        CREATE OR REPLACE FUNCTION get_next_volunteer_number(p_festival_id TEXT)
        RETURNS INTEGER AS $$
        DECLARE
            v_next_val INTEGER;
        BEGIN
            INSERT INTO registration_counters (festival_id, last_number, updated_at)
            VALUES (p_festival_id, 1, NOW())
            ON CONFLICT (festival_id)
            DO UPDATE SET 
                last_number = registration_counters.last_number + 1,
                updated_at = NOW()
            RETURNING last_number INTO v_next_val;
            
            RETURN v_next_val;
        END;
        $$ LANGUAGE plpgsql;
      `);
    } catch {
      // Stored proc syntax in PostgreSQL
    }

    // Seed default admin user — ONLY if ADMIN_PASSWORD is explicitly set.
const adminCountRes = await p.query("SELECT COUNT(*) FROM admin_users");
if (Number(adminCountRes.rows[0].count) === 0) {
  const envPassword = process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim();
  if (!envPassword) {
    console.error(
      "[Auth] SECURITY WARNING: ADMIN_PASSWORD environment variable is not set. " +
      "Skipping default admin creation — no admin account exists yet. " +
      "Set ADMIN_PASSWORD and restart the server to create the first admin login."
    );
  } else {
    const hash = await bcrypt.hash(envPassword, 10);
    await p.query(
      `INSERT INTO admin_users (id, name, email, role, password_hash, active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (id) DO NOTHING`,
      ["admin-default", "Festival Administrator", "admin@iskcon.org", "super_admin", hash]
    );
    console.log("[Auth] Default admin account created using ADMIN_PASSWORD from environment.");
  }
}

    // Seed default festival and departments if table is empty
    const festCountRes = await p.query("SELECT COUNT(*) FROM festivals");
    if (Number(festCountRes.rows[0].count) === 0) {
      const festId = "fest-janmashtami-2026";
      const defaultTimeSlots = [
        "Early Morning Seva (5:00 AM – 9:00 AM)",
        "Morning Seva (9:00 AM – 1:00 PM)",
        "Afternoon Seva (1:00 PM – 5:00 PM)",
        "Evening Seva (5:00 PM – 9:00 PM)",
        "Night Seva (9:00 PM – 1:00 AM)",
      ];

      await p.query(
        `INSERT INTO festivals (
          id, name, code, date_label, start_date, end_date, start_time, end_time,
          emoji, active, description, time_slots
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)
        ON CONFLICT (id) DO NOTHING`,
        [
          festId,
          "Śrī Krishna Janmashtami",
          "JN26",
          "2026",
          "2026-08-14",
          "2026-08-16",
          "05:00",
          "23:00",
          "🪈",
          "<p>Welcome to Śrī Krishna Janmashtami Seva Registration. Join hundreds of devotees in rendering loving devotional service to Sri Sri Radha Krishna!</p>",
          JSON.stringify(defaultTimeSlots),
        ]
      );

      await p.query(
        `INSERT INTO registration_counters (festival_id, last_number)
         VALUES ($1, 0)
         ON CONFLICT (festival_id) DO NOTHING`,
        [festId]
      );

      const defaultDepts = [
        {
          id: "dept-prasadam",
          name: "Prasadam",
          emoji: "🍚",
          code: "PRAS26",
          hod: "Radha Devi Dasi",
          phone: "9811100011",
          inst: "<p><strong>Reporting:</strong> Prasadam Hall counter 15 minutes before slot.</p><p>Dress code: Traditional Vaishnava attire with apron/gloves provided on site.</p>",
        },
        {
          id: "dept-parking",
          name: "Parking",
          emoji: "🚗",
          code: "PARK26",
          hod: "Govind Das",
          phone: "9811100022",
          inst: "<p><strong>Reporting:</strong> Main gate security desk.</p><p>Wear reflective jackets provided at the station.</p>",
        },
        {
          id: "dept-reception",
          name: "Reception",
          emoji: "🙏",
          code: "RECP26",
          hod: "Gauranga Das",
          phone: "9811100033",
          inst: "<p><strong>Reporting:</strong> Temple Entrance Welcome Desk.</p><p>Warm smiling greeting with Tilak and Chandan.</p>",
        },
        {
          id: "dept-entry",
          name: "Entry",
          emoji: "🎫",
          code: "ENTR26",
          hod: "Madhava Das",
          phone: "9811100044",
          inst: "<p><strong>Reporting:</strong> Queue management gate A & B.</p>",
        },
        {
          id: "dept-cleaning",
          name: "Cleaning",
          emoji: "🧹",
          code: "CLEA26",
          hod: "Krishna Priya Dasi",
          phone: "9811100055",
          inst: "<p><strong>Reporting:</strong> Seva center behind Temple hall.</p>",
        },
        {
          id: "dept-cultural",
          name: "Cultural",
          emoji: "🎤",
          code: "CULT26",
          hod: "Damodar Das",
          phone: "9811100066",
          inst: "<p><strong>Reporting:</strong> Auditorium Green Room.</p>",
        },
      ];

      for (const d of defaultDepts) {
        await p.query(
          `INSERT INTO departments (
            id, festival_id, name, emoji, active, hod_name, hod_phone, access_code, instructions
          ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING`,
          [d.id, festId, d.name, d.emoji, d.hod, d.phone, d.code, d.inst]
        );
      }
    }

    schemaInitialized = true;
    console.log("[Database] Schema verified successfully (no dummy data)");
  } catch (err) {
    console.error("[Database] Schema initialization error:", err);
  }
}

// Automatically initiate schema check
initDatabaseSchema().catch(console.error);

export const db = {
  // ATOMIC NUMBERING VIA STORED FUNCTION / COUNTER UPSERT
  async getNextVolunteerNumber(festivalId: string, client?: pg.PoolClient): Promise<number> {
    const runner = client || getPool();

    // Try Postgres stored function first
    try {
      const res = await runner.query("SELECT get_next_volunteer_number($1) AS num", [festivalId]);
      if (res.rows[0]?.num !== undefined && res.rows[0]?.num !== null) {
        return Number(res.rows[0].num);
      }
    } catch {
      // Fallback to atomic SQL upsert
    }

    const res = await runner.query(
      `INSERT INTO registration_counters (festival_id, last_number, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (festival_id)
       DO UPDATE SET last_number = registration_counters.last_number + 1, updated_at = NOW()
       RETURNING last_number`,
      [festivalId]
    );

    return Number(res.rows[0].last_number);
  },

  // FESTIVALS
  async getFestivals(activeOnly = false, includeArchived = false): Promise<Festival[]> {
    await initDatabaseSchema();
    const p = getPool();

    let query = "SELECT * FROM festivals WHERE 1=1";
    const params: any[] = [];

    if (!includeArchived) {
      query += " AND archived_at IS NULL";
    }

    if (activeOnly) {
      query += " AND active = true";
    }

    query += " ORDER BY created_at DESC";

    const res = await p.query(query, params);
    return res.rows.map(mapFestivalRow);
  },

  async getFestival(id: string): Promise<Festival | null> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query("SELECT * FROM festivals WHERE id = $1 LIMIT 1", [id]);
    if (res.rows.length === 0) return null;
    return mapFestivalRow(res.rows[0]);
  },

  async createFestival(input: Partial<Festival>): Promise<Festival> {
    await initDatabaseSchema();
    const p = getPool();

    const id = input.id || uid("fest-");
    const name = input.name || "Untitled Festival";
    const code = (input.code || "VOL").toUpperCase().slice(0, 6);
    const dateLabel = input.dateLabel || new Date().getFullYear().toString();
    const startDate = input.startDate || null;
    const endDate = input.endDate || null;
    const startTime = input.startTime || null;
    const endTime = input.endTime || null;
    const emoji = input.emoji || "🙏";
    // Task 3: Default active: false (Draft state) when creating new festival
    const active = input.active === true ? true : false;
    const bannerImageUrl = input.bannerImageUrl || "";
    const logoImageUrl = input.logoImageUrl || "";
    const description = input.description || "";
    const timeSlots = JSON.stringify(
      input.timeSlots && input.timeSlots.length > 0
        ? input.timeSlots
        : [
            "Full Day (6:00 AM – 10:00 PM)",
            "Morning (6:00 AM – 2:00 PM)",
            "Evening (2:00 PM – 10:00 PM)",
          ]
    );
    const formConfig = JSON.stringify(
      input.formConfig || {
        email: { enabled: true, required: false },
        age: { enabled: true, required: true },
        gender: { enabled: true, required: true },
        address: { enabled: true, required: true },
      }
    );
    const customFields = JSON.stringify(input.customFields || []);
    const cardConfig = JSON.stringify(
      input.cardConfig || {
        primaryColor: "#14415C",
        accentColor: "#C6961F",
        showDepartment: true,
        showContact: true,
        showHOD: true,
        showTimeSlot: true,
      }
    );

    const res = await p.query(
      `INSERT INTO festivals (
        id, name, code, date_label, start_date, end_date, start_time, end_time,
        emoji, active, banner_image_url, logo_image_url, description,
        time_slots, form_config, custom_fields, card_config, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      RETURNING *`,
      [
        id,
        name,
        code,
        dateLabel,
        startDate,
        endDate,
        startTime,
        endTime,
        emoji,
        active,
        bannerImageUrl,
        logoImageUrl,
        description,
        timeSlots,
        formConfig,
        customFields,
        cardConfig,
      ]
    );

    // Initialize registration counter
    await p.query(
      `INSERT INTO registration_counters (festival_id, last_number, updated_at)
       VALUES ($1, 0, NOW())
       ON CONFLICT (festival_id) DO NOTHING`,
      [id]
    );

    return mapFestivalRow(res.rows[0]);
  },

  async updateFestival(id: string, updates: Partial<Festival>): Promise<Festival | null> {
    await initDatabaseSchema();
    const p = getPool();

    const existing = await this.getFestival(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };

    const res = await p.query(
      `UPDATE festivals SET
        name = $1,
        code = $2,
        date_label = $3,
        start_date = $4,
        end_date = $5,
        start_time = $6,
        end_time = $7,
        emoji = $8,
        active = $9,
        banner_image_url = $10,
        logo_image_url = $11,
        description = $12,
        time_slots = $13,
        form_config = $14,
        custom_fields = $15,
        card_config = $16,
        updated_at = NOW()
      WHERE id = $17
      RETURNING *`,
      [
        merged.name,
        (merged.code || "VOL").toUpperCase().slice(0, 6),
        merged.dateLabel,
        merged.startDate || null,
        merged.endDate || null,
        merged.startTime || null,
        merged.endTime || null,
        merged.emoji,
        merged.active,
        merged.bannerImageUrl || "",
        merged.logoImageUrl || "",
        merged.description || "",
        JSON.stringify(merged.timeSlots),
        JSON.stringify(merged.formConfig),
        JSON.stringify(merged.customFields || []),
        JSON.stringify(merged.cardConfig),
        id,
      ]
    );

    if (res.rows.length === 0) return null;
    return mapFestivalRow(res.rows[0]);
  },

  // Task 4: Soft-delete pattern with archived_at instead of hard delete
  async deleteFestival(id: string, permanent = false): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();

    if (permanent) {
      // Permanent purge
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM volunteer_status_history WHERE volunteer_id IN (SELECT id FROM volunteers WHERE festival_id = $1)",
          [id]
        );
        await client.query("DELETE FROM volunteers WHERE festival_id = $1", [id]);
        await client.query(
          "UPDATE hod_users SET department_id = NULL WHERE department_id IN (SELECT id FROM departments WHERE festival_id = $1)",
          [id]
        );
        await client.query("DELETE FROM departments WHERE festival_id = $1", [id]);
        await client.query("DELETE FROM registration_counters WHERE festival_id = $1", [id]);
        const delRes = await client.query("DELETE FROM festivals WHERE id = $1", [id]);
        await client.query("COMMIT");
        return (delRes.rowCount ?? 0) > 0;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    // Soft delete: Mark archived_at and active = false
    const res = await p.query(
      `UPDATE festivals
       SET archived_at = NOW(), active = false, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Also soft-archive departments
    await p.query(
      `UPDATE departments
       SET archived_at = NOW(), active = false, updated_at = NOW()
       WHERE festival_id = $1 AND archived_at IS NULL`,
      [id]
    );

    return (res.rowCount ?? 0) > 0;
  },

  async restoreFestival(id: string): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query(
      `UPDATE festivals SET archived_at = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await p.query(
      `UPDATE departments SET archived_at = NULL, updated_at = NOW() WHERE festival_id = $1`,
      [id]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async duplicateFestival(id: string): Promise<Festival | null> {
    const orig = await this.getFestival(id);
    if (!orig) return null;

    const newId = uid("fest-");
    const copy = await this.createFestival({
      ...orig,
      id: newId,
      name: `${orig.name} (Copy)`,
      active: false,
    });

    // Duplicate departments
    const depts = await this.getDepartments(id, false, false);
    for (const d of depts) {
      await this.createDepartment(newId, {
        name: d.name,
        emoji: d.emoji,
        active: d.active,
        groupLink: d.groupLink,
        hodName: d.hodName,
        hodPhone: d.hodPhone,
        logoUrl: d.logoUrl,
        accessCode: genAccessCode(),
        capacity: d.capacity,
        instructions: d.instructions,
      });
    }

    return copy;
  },

  // DEPARTMENTS
  async getDepartments(
    festivalId: string,
    activeOnly = false,
    includeArchived = false
  ): Promise<Department[]> {
    await initDatabaseSchema();
    const p = getPool();

    let query = "SELECT * FROM departments WHERE festival_id = $1";
    const params: any[] = [festivalId];

    if (!includeArchived) {
      query += " AND archived_at IS NULL";
    }
    if (activeOnly) {
      query += " AND active = true";
    }

    query += " ORDER BY created_at ASC";

    const res = await p.query(query, params);
    return res.rows.map(mapDepartmentRow);
  },

  async getDepartment(id: string): Promise<Department | null> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query("SELECT * FROM departments WHERE id = $1 LIMIT 1", [id]);
    if (res.rows.length === 0) return null;
    return mapDepartmentRow(res.rows[0]);
  },

  async getDepartmentByCode(
    code: string
  ): Promise<{ department: Department; festival: Festival } | null> {
    await initDatabaseSchema();
    const p = getPool();
    const clean = code.trim().toUpperCase();

    const deptRes = await p.query(
      "SELECT * FROM departments WHERE UPPER(access_code) = $1 AND archived_at IS NULL LIMIT 1",
      [clean]
    );
    if (deptRes.rows.length === 0) return null;

    const dept = mapDepartmentRow(deptRes.rows[0]);
    const fest = await this.getFestival(dept.festivalId);
    if (!fest) return null;

    return { department: dept, festival: fest };
  },

  async createDepartment(festivalId: string, input: Partial<Department>): Promise<Department> {
    await initDatabaseSchema();
    const p = getPool();

    const id = input.id || uid("dept-");
    const name = input.name || "Untitled Department";
    const emoji = input.emoji || "🌼";
    const active = input.active !== undefined ? Boolean(input.active) : true;
    const groupLink = input.groupLink || "";
    const hodName = input.hodName || "";
    const hodPhone = input.hodPhone || "";
    const hodUserId = input.hodUserId || "";
    const logoUrl = input.logoUrl || "";
    let accessCode = (input.accessCode || "").trim().toUpperCase();
    if (!accessCode) {
      accessCode = await generateUniqueAccessCode(p);
    }
    const capacity =
      input.capacity !== null && input.capacity !== undefined && Number(input.capacity) > 0
        ? Number(input.capacity)
        : null;
    const instructions = input.instructions || "";

    let lastError: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await p.query(
          `INSERT INTO departments (
            id, festival_id, name, emoji, active, group_link, hod_name,
            hod_phone, hod_user_id, logo_url, access_code, capacity, instructions,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
          RETURNING *`,
          [
            id,
            festivalId,
            name,
            emoji,
            active,
            groupLink,
            hodName,
            hodPhone,
            hodUserId,
            logoUrl,
            accessCode,
            capacity,
            instructions,
          ]
        );

        return mapDepartmentRow(res.rows[0]);
      } catch (err: any) {
        lastError = err;
        if (
          err?.message?.includes("UNIQUE") ||
          err?.code === "23505" ||
          err?.message?.includes("access_code")
        ) {
          accessCode = await generateUniqueAccessCode(p);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error("Failed to create department with unique access code after 5 attempts");
  },

  async updateDepartment(id: string, updates: Partial<Department>): Promise<Department | null> {
    await initDatabaseSchema();
    const p = getPool();

    const existing = await this.getDepartment(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };
    const capacity =
      merged.capacity !== null && merged.capacity !== undefined && Number(merged.capacity) > 0
        ? Number(merged.capacity)
        : null;

    const res = await p.query(
      `UPDATE departments SET
        name = $1,
        emoji = $2,
        active = $3,
        group_link = $4,
        hod_name = $5,
        hod_phone = $6,
        hod_user_id = $7,
        logo_url = $8,
        access_code = $9,
        capacity = $10,
        instructions = $11,
        updated_at = NOW()
      WHERE id = $12
      RETURNING *`,
      [
        merged.name,
        merged.emoji,
        merged.active,
        merged.groupLink || "",
        merged.hodName || "",
        merged.hodPhone || "",
        merged.hodUserId || "",
        merged.logoUrl || "",
        (merged.accessCode || "").toUpperCase(),
        capacity,
        merged.instructions || "",
        id,
      ]
    );

    if (res.rows.length === 0) return null;
    return mapDepartmentRow(res.rows[0]);
  },

  // Task 4: Delete department (soft or permanent cascade)
  async deleteDepartment(id: string, permanent = false): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();

    if (permanent) {
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM volunteer_status_history WHERE volunteer_id IN (SELECT id FROM volunteers WHERE department_id = $1)",
          [id]
        );
        await client.query("DELETE FROM volunteers WHERE department_id = $1", [id]);
        await client.query("UPDATE hod_users SET department_id = NULL WHERE department_id = $1", [id]);
        const res = await client.query("DELETE FROM departments WHERE id = $1", [id]);
        await client.query("COMMIT");
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const res = await p.query(
      `UPDATE departments SET archived_at = NOW(), active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async deleteDepartmentsBulk(ids: string[], permanent = false): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    await initDatabaseSchema();
    const p = getPool();

    if (permanent) {
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM volunteer_status_history WHERE volunteer_id IN (SELECT id FROM volunteers WHERE department_id = ANY($1::text[]))",
          [ids]
        );
        await client.query("DELETE FROM volunteers WHERE department_id = ANY($1::text[])", [ids]);
        await client.query("UPDATE hod_users SET department_id = NULL WHERE department_id = ANY($1::text[])", [ids]);
        const res = await client.query("DELETE FROM departments WHERE id = ANY($1::text[])", [ids]);
        await client.query("COMMIT");
        return res.rowCount ?? 0;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const res = await p.query(
      `UPDATE departments SET archived_at = NOW(), active = false, updated_at = NOW() WHERE id = ANY($1::text[])`,
      [ids]
    );
    return res.rowCount ?? 0;
  },

  async restoreDepartment(id: string): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query(
      `UPDATE departments SET archived_at = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async regenerateAccessCode(id: string): Promise<string | null> {
    await initDatabaseSchema();
    const p = getPool();
    for (let attempt = 0; attempt < 5; attempt++) {
      const newCode = await generateUniqueAccessCode(p, id);
      try {
        const dept = await this.updateDepartment(id, { accessCode: newCode });
        return dept ? newCode : null;
      } catch (err: any) {
        if (
          err?.message?.includes("UNIQUE") ||
          err?.code === "23505" ||
          err?.message?.includes("access_code")
        ) {
          continue;
        }
        throw err;
      }
    }
    return null;
  },

  async getDepartmentVolunteerCount(departmentId: string): Promise<number> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query(
      `SELECT COUNT(*) FROM volunteers
       WHERE department_id = $1 AND status != 'Rejected' AND archived_at IS NULL`,
      [departmentId]
    );
    return Number(res.rows[0].count);
  },

  async getDepartmentCountsForFestival(festivalId: string): Promise<Record<string, number>> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query(
      `SELECT department_id, COUNT(*) as count
       FROM volunteers
       WHERE festival_id = $1 AND status != 'Rejected' AND archived_at IS NULL
       GROUP BY department_id`,
      [festivalId]
    );

    const counts: Record<string, number> = {};
    for (const row of res.rows) {
      counts[row.department_id] = Number(row.count);
    }
    return counts;
  },

  // VOLUNTEER REGISTRATIONS (Wrapped in Postgres transaction)
  async createRegistration(input: {
    festivalId: string;
    fullName: string;
    contact: string;
    email?: string;
    timeSlot: string;
    departmentId: string;
    age?: string | number;
    gender?: string;
    address?: string;
    photoUrl: string;
    customFields?: Record<string, string>;
  }): Promise<{ volunteer: Volunteer; festival: Festival; department: Department }> {
    await initDatabaseSchema();
    const p = getPool();
    const client = await p.connect();

    try {
      await client.query("BEGIN");

      // 1. Validate Festival
      const festRes = await client.query(
        "SELECT * FROM festivals WHERE id = $1 AND archived_at IS NULL LIMIT 1",
        [input.festivalId]
      );
      if (festRes.rows.length === 0) {
        throw new Error("Invalid festival selected");
      }
      const festival = mapFestivalRow(festRes.rows[0]);
      if (!festival.active) {
        throw new Error("This festival is currently closed for volunteer registration");
      }

      // 2. Validate Department
      const deptRes = await client.query(
        "SELECT * FROM departments WHERE id = $1 AND festival_id = $2 AND archived_at IS NULL LIMIT 1 FOR UPDATE",
        [input.departmentId, input.festivalId]
      );
      if (deptRes.rows.length === 0) {
        throw new Error("Invalid department selected");
      }
      const dept = mapDepartmentRow(deptRes.rows[0]);
      if (!dept.active) {
        throw new Error("This department is currently inactive");
      }

      // 3. Duplicate Registration Check
      const cleanPhone = input.contact.trim().replace(/\D/g, "");
      const dupRes = await client.query(
        `SELECT id FROM volunteers 
         WHERE festival_id = $1 AND contact = $2 AND status != 'Rejected' AND archived_at IS NULL
         LIMIT 1`,
        [input.festivalId, cleanPhone]
      );
      if (dupRes.rows.length > 0) {
        throw new Error("This contact number is already registered for this festival.");
      }

      // 4. Department Capacity Check
      if (dept.capacity && dept.capacity > 0) {
        const countRes = await client.query(
          `SELECT COUNT(*) FROM volunteers 
           WHERE department_id = $1 AND status != 'Rejected' AND archived_at IS NULL`,
          [dept.id]
        );
        const currentCount = Number(countRes.rows[0].count);
        if (currentCount >= dept.capacity) {
          throw new Error(
            `Department '${dept.name}' has reached its maximum volunteer capacity (${dept.capacity}). Please choose another department.`
          );
        }
      }

      // 5. Atomic Volunteer Number increment (using get_next_volunteer_number)
      const volunteerNumber = await this.getNextVolunteerNumber(festival.id, client);
      const id = uid("vol-");

      // 6. Insert Volunteer record
      const insertRes = await client.query(
        `INSERT INTO volunteers (
          id, festival_id, volunteer_number, full_name, contact, email, time_slot,
          department_id, age, gender, address, photo_url, status, custom_fields,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        RETURNING *`,
        [
          id,
          festival.id,
          volunteerNumber,
          input.fullName.trim(),
          cleanPhone,
          input.email ? input.email.trim() : "",
          input.timeSlot,
          dept.id,
          input.age ? Number(input.age) || null : null,
          input.gender || null,
          input.address ? input.address.trim() : "",
          input.photoUrl,
          "Pending for Approval",
          JSON.stringify(input.customFields || {}),
        ]
      );

      const newVolunteer = mapVolunteerRow(insertRes.rows[0]);

      // 7. Insert Audit Trail Status History
      await client.query(
        `INSERT INTO volunteer_status_history (
          id, volunteer_id, old_status, new_status, changed_by, changed_at, remarks
        ) VALUES ($1, $2, NULL, $3, $4, NOW(), $5)`,
        [
          uid("hist-"),
          newVolunteer.id,
          "Pending for Approval",
          "Public Registration",
          "Volunteer submitted online registration form",
        ]
      );

      await client.query("COMMIT");
      return { volunteer: newVolunteer, festival, department: dept };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async getRegistrations(params: {
    festivalId?: string;
    departmentId?: string;
    timeSlot?: string;
    status?: string;
    search?: string;
    includeArchived?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    volunteers: Volunteer[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await initDatabaseSchema();
    const p = getPool();

    let whereClause = "WHERE 1=1";
    const queryParams: any[] = [];
    let pIdx = 1;

    if (!params.includeArchived) {
      whereClause += " AND archived_at IS NULL";
    }

    if (params.festivalId) {
      whereClause += ` AND festival_id = $${pIdx++}`;
      queryParams.push(params.festivalId);
    }
    if (params.departmentId) {
      whereClause += ` AND department_id = $${pIdx++}`;
      queryParams.push(params.departmentId);
    }
    if (params.timeSlot) {
      whereClause += ` AND time_slot = $${pIdx++}`;
      queryParams.push(params.timeSlot);
    }
    if (params.status) {
      whereClause += ` AND status = $${pIdx++}`;
      queryParams.push(params.status);
    }
    if (params.search) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereClause += ` AND (LOWER(full_name) LIKE $${pIdx} OR contact LIKE $${pIdx} OR LOWER(email) LIKE $${pIdx})`;
      queryParams.push(q);
      pIdx++;
    }

    // Count query
    const countRes = await p.query(`SELECT COUNT(*) FROM volunteers ${whereClause}`, queryParams);
    const total = Number(countRes.rows[0].count);

    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(params.limit || 50, 500));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;

    const selectQuery = `
      SELECT * FROM volunteers 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    queryParams.push(limit, offset);

    const res = await p.query(selectQuery, queryParams);
    return {
      volunteers: res.rows.map(mapVolunteerRow),
      total,
      page,
      limit,
      totalPages,
    };
  },
  // Fetches every matching volunteer across all pages — use for admin/HOD
  // full-list views, CSV export, and bulk card export, since getRegistrations()
  // caps at 500 rows per call.
  async getAllRegistrations(params: {
    festivalId?: string;
    departmentId?: string;
    timeSlot?: string;
    status?: string;
    search?: string;
    includeArchived?: boolean;
  }): Promise<{ volunteers: Volunteer[]; total: number; truncated: boolean }> {
    const MAX_PAGES = 100; // 100 * 500 = 50,000 records ceiling
    let page = 1;
    let all: Volunteer[] = [];
    let total = 0;
    let truncated = false;

    while (page <= MAX_PAGES) {
      const res = await this.getRegistrations({ ...params, page, limit: 500 });
      total = res.total;
      all = all.concat(res.volunteers);
      if (page >= res.totalPages) break;
      page += 1;
    }

    if (all.length < total) {
      truncated = true;
      console.error(
        `[getAllRegistrations] Safety cap hit — fetched ${all.length} of ${total} records.`
      );
    }

    return { volunteers: all, total, truncated };
  },

  async getRegistrationById(id: string): Promise<{
    volunteer: Volunteer;
    festival: Festival | null;
    department: Department | null;
    history: VolunteerStatusHistory[];
  } | null> {
    await initDatabaseSchema();
    const p = getPool();

    const volRes = await p.query("SELECT * FROM volunteers WHERE id = $1 LIMIT 1", [id]);
    if (volRes.rows.length === 0) return null;

    const volunteer = mapVolunteerRow(volRes.rows[0]);
    const festival = await this.getFestival(volunteer.festivalId);
    const department = await this.getDepartment(volunteer.departmentId);
    const history = await this.getStatusHistory(volunteer.id);

    return { volunteer, festival, department, history };
  },

  async getRegistrationsByContact(contact: string): Promise<
    Array<{
      volunteer: Volunteer;
      festival: Festival | null;
      department: Department | null;
    }>
  > {
    await initDatabaseSchema();
    const p = getPool();

    const clean = contact.replace(/\D/g, "");
    if (clean.length < 10) return [];

    const res = await p.query(
      `SELECT * FROM volunteers
       WHERE contact = $1 AND archived_at IS NULL
       ORDER BY created_at DESC`,
      [clean]
    );

    const list: Array<{
      volunteer: Volunteer;
      festival: Festival | null;
      department: Department | null;
    }> = [];

    for (const row of res.rows) {
      const vol = mapVolunteerRow(row);
      const festival = await this.getFestival(vol.festivalId);
      const department = await this.getDepartment(vol.departmentId);
      list.push({ volunteer: vol, festival, department });
    }

    return list;
  },

  async updateRegistrationStatus(
    volunteerId: string,
    newStatus: VolunteerStatus,
    changedBy: string,
    remarks?: string
  ): Promise<Volunteer | null> {
    await initDatabaseSchema();
    const p = getPool();
    const client = await p.connect();

    try {
      await client.query("BEGIN");

      const prevRes = await client.query("SELECT * FROM volunteers WHERE id = $1 LIMIT 1", [
        volunteerId,
      ]);
      if (prevRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const prevVolunteer = mapVolunteerRow(prevRes.rows[0]);
      const oldStatus = prevVolunteer.status;

      const updateRes = await client.query(
        `UPDATE volunteers
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [newStatus, volunteerId]
      );

      // Add to status history audit trail
      await client.query(
        `INSERT INTO volunteer_status_history (
          id, volunteer_id, old_status, new_status, changed_by, changed_at, remarks
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [uid("hist-"), volunteerId, oldStatus, newStatus, changedBy, remarks || ""]
      );

      await client.query("COMMIT");
      return mapVolunteerRow(updateRes.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async updateRegistration(
    volunteerId: string,
    updates: Partial<Volunteer>
  ): Promise<Volunteer | null> {
    await initDatabaseSchema();
    const p = getPool();

    const existing = await this.getRegistrationById(volunteerId);
    if (!existing) return null;

    const merged = { ...existing.volunteer, ...updates };

    const res = await p.query(
      `UPDATE volunteers SET
        full_name = $1,
        contact = $2,
        email = $3,
        time_slot = $4,
        department_id = $5,
        age = $6,
        gender = $7,
        address = $8,
        photo_url = $9,
        status = $10,
        custom_fields = $11,
        updated_at = NOW()
      WHERE id = $12
      RETURNING *`,
      [
        merged.fullName,
        merged.contact.replace(/\D/g, ""),
        merged.email || "",
        merged.timeSlot,
        merged.departmentId,
        merged.age ? Number(merged.age) || null : null,
        merged.gender || null,
        merged.address || "",
        merged.photoUrl,
        merged.status,
        JSON.stringify(merged.customFields || {}),
        volunteerId,
      ]
    );

    if (res.rows.length === 0) return null;
    return mapVolunteerRow(res.rows[0]);
  },

  // Task 4: Soft delete volunteer registration, preserving audit history
  async deleteRegistration(volunteerId: string, permanent = false): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();

    if (permanent) {
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM volunteer_status_history WHERE volunteer_id = $1", [
          volunteerId,
        ]);
        const res = await client.query("DELETE FROM volunteers WHERE id = $1", [volunteerId]);
        await client.query("COMMIT");
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    // Soft delete: Set archived_at = NOW(), keep volunteer_status_history intact
    const res = await p.query(
      `UPDATE volunteers SET archived_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [volunteerId]
    );

    // Record audit event
    await p.query(
      `INSERT INTO volunteer_status_history (
        id, volunteer_id, old_status, new_status, changed_by, changed_at, remarks
      ) VALUES ($1, $2, 'Active', 'Archived', 'Admin', NOW(), 'Record moved to archive')`,
      [uid("hist-"), volunteerId]
    );

    return (res.rowCount ?? 0) > 0;
  },

  async deleteRegistrationsBulk(volunteerIds: string[], permanent = false): Promise<number> {
    if (!volunteerIds || volunteerIds.length === 0) return 0;
    await initDatabaseSchema();
    const p = getPool();

    if (permanent) {
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM volunteer_status_history WHERE volunteer_id = ANY($1::text[])",
          [volunteerIds]
        );
        const res = await client.query("DELETE FROM volunteers WHERE id = ANY($1::text[])", [volunteerIds]);
        await client.query("COMMIT");
        return res.rowCount ?? 0;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const res = await p.query(
      `UPDATE volunteers SET archived_at = NOW(), updated_at = NOW() WHERE id = ANY($1::text[])`,
      [volunteerIds]
    );
    return res.rowCount ?? 0;
  },

  async restoreRegistration(volunteerId: string): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query(
      `UPDATE volunteers SET archived_at = NULL, updated_at = NOW() WHERE id = $1`,
      [volunteerId]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async getStatusHistory(volunteerId: string): Promise<VolunteerStatusHistory[]> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query(
      `SELECT * FROM volunteer_status_history
       WHERE volunteer_id = $1
       ORDER BY changed_at DESC`,
      [volunteerId]
    );
    return res.rows.map(mapHistoryRow);
  },

  // DASHBOARD STATS
  async getDashboardStats(festivalId?: string) {
    await initDatabaseSchema();
    const p = getPool();

    let where = "WHERE archived_at IS NULL";
    const params: any[] = [];
    if (festivalId) {
      where += " AND festival_id = $1";
      params.push(festivalId);
    }

    const res = await p.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'Pending for Approval' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'Pending for Printing' THEN 1 END) as printing,
        COUNT(CASE WHEN status = 'Printed' THEN 1 END) as printed,
        COUNT(CASE WHEN status = 'Rejected' THEN 1 END) as rejected
       FROM volunteers
       ${where}`,
      params
    );

    const row = res.rows[0] || {};
    return {
      total: Number(row.total || 0),
      pending: Number(row.pending || 0),
      approved: Number(row.approved || 0),
      printing: Number(row.printing || 0),
      printed: Number(row.printed || 0),
      rejected: Number(row.rejected || 0),
    };
  },

  // Task 5: Admin authentication against admin_users table with bcrypt
  async verifyAdminCredentials(
    password: string,
    email?: string
  ): Promise<{ success: boolean; user?: AdminUser }> {
    await initDatabaseSchema();
    const p = getPool();

    let query: string;
    let params: any[];

    if (email && email.trim()) {
      query = "SELECT * FROM admin_users WHERE LOWER(email) = LOWER($1) AND active = true";
      params = [email.trim()];
    } else {
      query = "SELECT * FROM admin_users WHERE active = true ORDER BY created_at ASC";
      params = [];
    }

    const res = await p.query(query, params);

    for (const row of res.rows) {
      if (row.password_hash) {
        const isMatch = await bcrypt.compare(password.trim(), row.password_hash);
        if (isMatch) {
          return { success: true, user: mapAdminUserRow(row) };
        }
      }
    }

    // Bootstrap check if matches ADMIN_PASSWORD environment variable
    if (process.env.ADMIN_PASSWORD && password.trim() === process.env.ADMIN_PASSWORD.trim()) {
      if (res.rows.length > 0) {
        // Update hash in table
        const newHash = await bcrypt.hash(password.trim(), 10);
        await p.query("UPDATE admin_users SET password_hash = $1 WHERE id = $2", [
          newHash,
          res.rows[0].id,
        ]);
        return { success: true, user: mapAdminUserRow(res.rows[0]) };
      } else {
        const hash = await bcrypt.hash(password.trim(), 10);
        const ins = await p.query(
          `INSERT INTO admin_users (id, name, email, role, password_hash, active)
           VALUES ($1, $2, $3, $4, $5, true)
           RETURNING *`,
          ["admin-default", "Festival Administrator", "admin@iskcon.org", "super_admin", hash]
        );
        return { success: true, user: mapAdminUserRow(ins.rows[0]) };
      }
    }

    return { success: false };
  },

  async getAdminUsers(): Promise<AdminUser[]> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query("SELECT * FROM admin_users ORDER BY created_at ASC");
    return res.rows.map(mapAdminUserRow);
  },

  async createAdminUser(data: {
    name: string;
    email: string;
    passwordHash: string;
    role?: string;
  }): Promise<AdminUser> {
    await initDatabaseSchema();
    const p = getPool();
    const id = uid("adm-");
    const res = await p.query(
      `INSERT INTO admin_users (id, name, email, role, password_hash, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [id, data.name, data.email.toLowerCase(), data.role || "admin", data.passwordHash]
    );
    return mapAdminUserRow(res.rows[0]);
  },

  async updateAdminUser(
    id: string,
    updates: {
      name?: string;
      email?: string;
      role?: string;
      active?: boolean;
      passwordHash?: string;
    }
  ): Promise<AdminUser | null> {
    await initDatabaseSchema();
    const p = getPool();

    const existingRes = await p.query("SELECT * FROM admin_users WHERE id = $1 LIMIT 1", [id]);
    if (existingRes.rows.length === 0) return null;
    const existing = existingRes.rows[0];

    const name = updates.name !== undefined ? updates.name : existing.name;
    const email = updates.email !== undefined ? updates.email.toLowerCase() : existing.email;
    const role = updates.role !== undefined ? updates.role : existing.role;
    const active = updates.active !== undefined ? Boolean(updates.active) : Boolean(existing.active);
    const passwordHash = updates.passwordHash || existing.password_hash;

    const res = await p.query(
      `UPDATE admin_users SET
        name = $1, email = $2, role = $3, active = $4, password_hash = $5
       WHERE id = $6
       RETURNING *`,
      [name, email, role, active, passwordHash, id]
    );

    if (res.rows.length === 0) return null;
    return mapAdminUserRow(res.rows[0]);
  },

  async deleteAdminUser(id: string, permanent = false): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();
    if (permanent) {
      const res = await p.query("DELETE FROM admin_users WHERE id = $1", [id]);
      return (res.rowCount ?? 0) > 0;
    }
    const res = await p.query("UPDATE admin_users SET active = false WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // HOD USER METHODS (Requirement 8)
  async getHodUsers(): Promise<HODUser[]> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query("SELECT * FROM hod_users ORDER BY created_at ASC");
    return res.rows.map(mapHodUserRow);
  },

  async getHodUser(id: string): Promise<HODUser | null> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query("SELECT * FROM hod_users WHERE id = $1 LIMIT 1", [id]);
    if (res.rows.length === 0) return null;
    return mapHodUserRow(res.rows[0]);
  },

  async createHodUser(data: {
    name: string;
    phone: string;
    email?: string;
    departmentId?: string;
    active?: boolean;
  }): Promise<HODUser> {
    await initDatabaseSchema();
    const p = getPool();
    const id = uid("hod-");
    const active = data.active !== undefined ? Boolean(data.active) : true;
    const res = await p.query(
      `INSERT INTO hod_users (id, name, phone, email, department_id, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [id, data.name, data.phone.trim(), data.email || "", data.departmentId || null, active]
    );
    return mapHodUserRow(res.rows[0]);
  },

  async updateHodUser(id: string, updates: Partial<HODUser>): Promise<HODUser | null> {
    await initDatabaseSchema();
    const p = getPool();
    const existing = await this.getHodUser(id);
    if (!existing) return null;

    const merged = { ...existing, ...updates };
    const res = await p.query(
      `UPDATE hod_users SET
        name = $1, phone = $2, email = $3, department_id = $4, active = $5
       WHERE id = $6
       RETURNING *`,
      [
        merged.name,
        merged.phone,
        merged.email || "",
        merged.departmentId || null,
        Boolean(merged.active),
        id,
      ]
    );
    if (res.rows.length === 0) return null;
    return mapHodUserRow(res.rows[0]);
  },

  async deleteHodUser(id: string): Promise<boolean> {
    await initDatabaseSchema();
    const p = getPool();
    const res = await p.query("UPDATE hod_users SET active = false WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  },
};
