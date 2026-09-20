-- 1. MEAL LOGS (Daily Toggles)
CREATE TABLE meal_logs (
    id TEXT PRIMARY KEY, -- Format: 'YYYY-MM-DD_UUID'
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    member_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Ledger Preservation
    member_name_snapshot TEXT, -- Immutable historical name
    log_date DATE NOT NULL,
    day_meal TEXT DEFAULT 'OFF',
    night_meal TEXT DEFAULT 'OFF',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(mess_id, member_id, log_date)
);

-- 2. TRANSACTIONS (Financial Vault)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    member_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Ledger Preservation
    member_name_snapshot TEXT, -- Immutable historical name
    txn_type TEXT NOT NULL, -- 'ADVANCE' or 'EXPENSE'
    amount NUMERIC NOT NULL,
    txn_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. DUTY LOGS (Gamified Tasks)
CREATE TABLE duty_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mess_id UUID REFERENCES messes(id) ON DELETE CASCADE,
    member_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Ledger Preservation
    member_name_snapshot TEXT, -- Immutable historical name
    duty_date DATE NOT NULL,
    task_name TEXT NOT NULL,
    karma_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
