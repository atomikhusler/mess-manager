-- 1. CLEANUP OLD CONFLICTING TABLES
DROP TABLE IF EXISTS duty_logs CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS meal_logs CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS mess_config CASCADE;
DROP TABLE IF EXISTS messes CASCADE;
DROP TABLE IF EXISTS registration_requests CASCADE;
DROP TABLE IF EXISTS quarantine_list CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. THE SHADOW QUARANTINE (Imposter Blacklist)
CREATE TABLE quarantine_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hardware_sig TEXT,
    ip_address TEXT,
    banned_at TIMESTAMPTZ DEFAULT now()
);

-- 3. REGISTRATION REQUESTS (With Identity Tracking)
CREATE TABLE registration_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hostel_name TEXT NOT NULL,
    manager_name TEXT NOT NULL,
    manager_phone TEXT NOT NULL,
    hardware_sig TEXT NOT NULL,
    ip_address TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-Capture IP Address from Supabase Headers
CREATE OR REPLACE FUNCTION capture_client_ip()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_capture_ip
    BEFORE INSERT ON registration_requests
    FOR EACH ROW EXECUTE FUNCTION capture_client_ip();

-- 4. MESSES (Zero-Knowledge Architecture)
CREATE TABLE messes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    manager_name TEXT NOT NULL,
    manager_phone TEXT NOT NULL,
    manager_pin TEXT, 
    activation_token TEXT, 
    status TEXT DEFAULT 'ACTIVE',
    tier_level TEXT DEFAULT 'FREE', 
    max_devices INTEGER DEFAULT 1,
    license_token TEXT,
    recovery_key TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. MESS CONFIGURATION
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

CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mess_config_updated_at
    BEFORE UPDATE ON mess_config
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- 6. PROFILES & ANNOUNCEMENTS
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

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    display_frequency TEXT DEFAULT 'ONCE',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. PRESERVATION LEDGERS
CREATE TABLE meal_logs (
    id TEXT PRIMARY KEY,
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    member_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    member_name_snapshot TEXT,
    log_date DATE NOT NULL,
    day_meal TEXT DEFAULT 'OFF',
    night_meal TEXT DEFAULT 'OFF',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(mess_id, member_id, log_date)
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    member_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    member_name_snapshot TEXT,
    txn_type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    txn_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE duty_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    member_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    member_name_snapshot TEXT,
    duty_date DATE NOT NULL,
    task_name TEXT NOT NULL,
    karma_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. CHRONOS & REALTIME
CREATE OR REPLACE FUNCTION get_server_time() RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN now(); END; $$;

DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE messes, announcements;

-- 9. FRONTEND-TRUST SECURITY POLICIES (No Edge Functions Required)
ALTER TABLE quarantine_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE messes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_logs ENABLE ROW LEVEL SECURITY;

-- Superuser Admin Access (Dashboard)
CREATE POLICY "Admin Full Access" ON quarantine_list TO authenticated USING (true);
CREATE POLICY "Admin Full Access" ON registration_requests TO authenticated USING (true);
CREATE POLICY "Admin Full Access" ON messes TO authenticated USING (true);
CREATE POLICY "Admin Full Access" ON announcements TO authenticated USING (true);

-- Frontend Application Access (No JWT needed)
CREATE POLICY "Allow Frontend" ON registration_requests FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow Frontend" ON messes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow Frontend" ON mess_config FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow Frontend" ON profiles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow Frontend" ON announcements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow Frontend" ON meal_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow Frontend" ON transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow Frontend" ON duty_logs FOR ALL TO anon USING (true) WITH CHECK (true);
