-- =============================================================================
-- ISKCON Volunteer Registration & Management System - Database Schema
-- Compatible with PostgreSQL 13+ and Supabase (with RLS Policies)
-- =============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. FESTIVALS TABLE
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
    time_slots JSONB DEFAULT '[]'::jsonb,
    form_config JSONB DEFAULT '{"email":{"enabled":true,"required":false},"age":{"enabled":true,"required":true},"gender":{"enabled":true,"required":true},"address":{"enabled":true,"required":true}}'::jsonb,
    custom_fields JSONB DEFAULT '[]'::jsonb,
    card_config JSONB DEFAULT '{"primaryColor":"#14415C","accentColor":"#C6961F","showDepartment":true,"showContact":true,"showHOD":true,"showTimeSlot":true}'::jsonb,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    festival_id TEXT NOT NULL REFERENCES festivals(id) ON DELETE RESTRICT,
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

-- 3. REGISTRATION COUNTERS TABLE (Safe concurrency numbering per festival)
CREATE TABLE IF NOT EXISTS registration_counters (
    festival_id TEXT PRIMARY KEY REFERENCES festivals(id) ON DELETE RESTRICT,
    last_number INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. VOLUNTEERS / REGISTRATIONS TABLE
CREATE TABLE IF NOT EXISTS volunteers (
    id TEXT PRIMARY KEY,
    festival_id TEXT NOT NULL REFERENCES festivals(id) ON DELETE RESTRICT,
    volunteer_number INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    contact VARCHAR(25) NOT NULL,
    email TEXT,
    time_slot TEXT NOT NULL,
    department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    age INTEGER,
    gender VARCHAR(20),
    address TEXT,
    photo_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending for Approval',
    custom_fields JSONB DEFAULT '{}'::jsonb,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial Unique Index to prevent duplicate active registrations for the same festival and contact
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_registration 
ON volunteers (festival_id, contact) 
WHERE status != 'Rejected' AND archived_at IS NULL;

-- Indexes for high-performance search, filtering, and foreign keys
CREATE INDEX IF NOT EXISTS idx_volunteers_festival ON volunteers(festival_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_dept ON volunteers(department_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_contact ON volunteers(contact);
CREATE INDEX IF NOT EXISTS idx_volunteers_status ON volunteers(status);
CREATE INDEX IF NOT EXISTS idx_volunteers_created ON volunteers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_volunteers_archived ON volunteers(archived_at);
CREATE INDEX IF NOT EXISTS idx_festivals_archived ON festivals(archived_at);
CREATE INDEX IF NOT EXISTS idx_departments_festival ON departments(festival_id);
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(access_code);
CREATE INDEX IF NOT EXISTS idx_departments_archived ON departments(archived_at);

-- 5. VOLUNTEER STATUS HISTORY TABLE
CREATE TABLE IF NOT EXISTS volunteer_status_history (
    id TEXT PRIMARY KEY,
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE RESTRICT,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_history_vol_id ON volunteer_status_history(volunteer_id);

-- 6. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    password_hash TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. HOD USERS TABLE
CREATE TABLE IF NOT EXISTS hod_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone VARCHAR(25) NOT NULL,
    email TEXT,
    department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function for atomic next volunteer number retrieval
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

-- Row Level Security (RLS) - Server-side / Service Role access is preferred.
-- Direct anon public queries are restricted to non-sensitive read-only data.
ALTER TABLE festivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hod_users ENABLE ROW LEVEL SECURITY;

-- Allow public read of active, non-archived festivals
CREATE POLICY "Public read active festivals" ON festivals
    FOR SELECT USING (active = true AND archived_at IS NULL);

-- Allow public read of active, non-archived departments
CREATE POLICY "Public read active departments" ON departments
    FOR SELECT USING (active = true AND archived_at IS NULL);

-- Note: Volunteers table is protected. Public volunteer queries and inserts are routed
-- securely through the server-side Node API endpoints, preventing direct PII scraping.
CREATE POLICY "Service role full access on volunteers" ON volunteers
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- SEED DATA (Default Festival and Departments)
-- =============================================================================

INSERT INTO festivals (id, name, code, date_label, start_date, end_date, start_time, end_time, emoji, active, description, time_slots)
VALUES (
    'fest-janmashtami-2026',
    'Śrī Krishna Janmashtami',
    'JN26',
    '2026',
    '2026-08-14',
    '2026-08-16',
    '05:00:00',
    '23:00:00',
    '🪈',
    true,
    '<p>Welcome to Śrī Krishna Janmashtami Seva Registration. Join hundreds of devotees in rendering loving devotional service to Sri Sri Radha Krishna!</p>',
    '["Early Morning Seva (5:00 AM – 9:00 AM)", "Morning Seva (9:00 AM – 1:00 PM)", "Afternoon Seva (1:00 PM – 5:00 PM)", "Evening Seva (5:00 PM – 9:00 PM)", "Night Seva (9:00 PM – 1:00 AM)"]'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, festival_id, name, emoji, active, hod_name, hod_phone, access_code, instructions)
VALUES
    ('dept-prasadam', 'fest-janmashtami-2026', 'Prasadam', '🍚', true, 'Radha Devi Dasi', '9811100011', 'PRAS26', '<p><strong>Reporting:</strong> Prasadam Hall counter 15 minutes before slot.</p><p>Dress code: Traditional Vaishnava attire with apron/gloves provided on site.</p>'),
    ('dept-parking', 'fest-janmashtami-2026', 'Parking', '🚗', true, 'Govind Das', '9811100022', 'PARK26', '<p><strong>Reporting:</strong> Main gate security desk.</p><p>Wear reflective jackets provided at the station.</p>'),
    ('dept-reception', 'fest-janmashtami-2026', 'Reception', '🙏', true, 'Gauranga Das', '9811100033', 'RECP26', '<p><strong>Reporting:</strong> Temple Entrance Welcome Desk.</p><p>Warm smiling greeting with Tilak and Chandan.</p>'),
    ('dept-entry', 'fest-janmashtami-2026', 'Entry', '🎫', true, 'Madhava Das', '9811100044', 'ENTR26', '<p><strong>Reporting:</strong> Queue management gate A & B.</p>'),
    ('dept-cleaning', 'fest-janmashtami-2026', 'Cleaning', '🧹', true, 'Krishna Priya Dasi', '9811100055', 'CLEA26', '<p><strong>Reporting:</strong> Seva center behind Temple hall.</p>'),
    ('dept-cultural', 'fest-janmashtami-2026', 'Cultural', '🎤', true, 'Damodar Das', '9811100066', 'CULT26', '<p><strong>Reporting:</strong> Auditorium Green Room.</p>')
ON CONFLICT (id) DO NOTHING;

INSERT INTO registration_counters (festival_id, last_number)
VALUES ('fest-janmashtami-2026', 0)
ON CONFLICT (festival_id) DO NOTHING;

-- Default admin user with pre-hashed password ($2a$10$9... bcrypt for 'Sevya1997')
INSERT INTO admin_users (id, name, email, role, password_hash, active)
VALUES ('admin-default', 'Festival Administrator', 'admin@iskcon.org', 'super_admin', '$2a$10$tZc4uIqIqO1iGcq2mXk2te6H6Z67Vj69E8xP1Z5d1E0bMh.j6xYfa', true)
ON CONFLICT (id) DO NOTHING;
