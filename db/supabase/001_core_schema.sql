-- Enable UUID extension for cryptographic IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. REGISTRATION REQUESTS (Admin CRM Leads)
CREATE TABLE registration_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hostel_name TEXT NOT NULL,
    manager_name TEXT NOT NULL,
    manager_phone TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. MESSES (The Master Hostel Table)
CREATE TABLE messes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    manager_name TEXT NOT NULL,
    manager_phone TEXT NOT NULL,
    manager_pin TEXT NOT NULL, -- Stored as a hashed string
    status TEXT DEFAULT 'ACTIVE', -- Used by WebSockets for instant kill-switches
    tier_level TEXT DEFAULT 'FREE', 
    max_devices INTEGER DEFAULT 1,
    license_token TEXT, -- Cryptographic HMAC signature for offline validation
    recovery_key TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. MESS CONFIG (Operational Rules)
CREATE TABLE mess_config (
    mess_id UUID PRIMARY KEY REFERENCES messes(id) ON DELETE CASCADE,
    meal_rate NUMERIC DEFAULT 50.00,
    day_cutoff TIME DEFAULT '10:00:00',
    night_cutoff TIME DEFAULT '17:00:00',
    is_holiday_freeze BOOLEAN DEFAULT false,
    freeze_start DATE,
    freeze_end DATE,
    freeze_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Automated Timestamp Trigger for Config Updates
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_mess_config_updated_at
    BEFORE UPDATE ON mess_config
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- 4. PROFILES (Students & Staff)
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'STUDENT',
    name TEXT NOT NULL,
    phone TEXT,
    room TEXT,
    pin_hash TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ANNOUNCEMENTS (Communications Engine)
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE, -- If NULL, it's a Global Admin Broadcast
    message TEXT NOT NULL,
    display_frequency TEXT DEFAULT 'ONCE',
    expires_at TIMESTAMPTZ NOT NULL, -- Strict UTC timestamp to prevent timezone drift
    created_at TIMESTAMPTZ DEFAULT now()
);
