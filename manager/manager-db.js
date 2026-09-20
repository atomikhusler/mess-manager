// manager/manager-db.js
import { supabase, handleDBError } from '../core/supabase-client.js';
import { OfflineEngine } from '../core/offline-engine.js';

/**
 * 🔒 ZERO-LATENCY HARDWARE LOCK
 * Fetches the Mess ID instantly from RAM. Throws fatal error if missing.
 */
function getMessId() {
    const messId = localStorage.getItem('mm_mess_id');
    if (!messId) throw new Error("CRITICAL: Hardware lock missing Mess ID.");
    return messId;
}

/**
 * 📅 STRICT POSTGRESQL DATE BOUNDARIES
 * Calculates exact YYYY-MM-01 to YYYY-MM-DD for accurate cloud queries.
 */
function getMonthBounds(monthPrefix) {
    const [year, month] = monthPrefix.split('-');
    const lastDay = new Date(year, month, 0).getDate();
    return {
        start: `${monthPrefix}-01`,
        end: `${monthPrefix}-${String(lastDay).padStart(2, '0')}`
    };
}

// ==========================================
// 1. DIRECTORY (People Hub)
// ==========================================
export async function fetchDirectory() {
    const key = `dir_${getMessId()}`;
    try {
        // Asynchronous cloud fetch to update cache silently
        const cloudPromise = supabase.from('profiles').select('*')
            .eq('mess_id', getMessId()).eq('role', 'STUDENT').order('name', { ascending: true })
            .then(res => { if (!res.error) OfflineEngine.setCache(key, res.data); return res; });

        // ⚡ Stale-While-Revalidate: Instant UI render from GodCache
        const cached = await OfflineEngine.getCache(key);
        if (cached) {
            cloudPromise.catch(() => {}); 
            return { success: true, students: cached };
        }

        const { data, error } = await cloudPromise;
        if (error) throw error;
        return { success: true, students: data || [] };
    } catch (err) { return handleDBError(err); }
}

export async function addStudent(name, phone, pin, room = '') {
    try {
        const id = crypto.randomUUID(); 
        const payload = { id, mess_id: getMessId(), role: 'STUDENT', name: name.trim(), phone: phone.trim(), room: room.trim(), pin_hash: pin.trim(), status: 'ACTIVE' };
        
        // Push to offline background queue
        await OfflineEngine.queueMutation('profiles', id, payload, 'UPSERT');

        // SSOT INJECTION: Optimistically update local UI cache instantly
        const key = `dir_${getMessId()}`;
        let cached = await OfflineEngine.getCache(key) || [];
        cached.unshift(payload);
        await OfflineEngine.setCache(key, cached);

        return { success: true, id };
    } catch (err) { return handleDBError(err); }
}

export async function deleteStudent(studentId) {
    try {
        // 🧠 UPGRADE: Route through the mutation queue with action 'DELETE'
        await OfflineEngine.queueMutation('profiles', studentId, { id: studentId }, 'DELETE');

        // SSOT PURGE: Instantly vaporize from local RAM
        const key = `dir_${getMessId()}`;
        let cached = await OfflineEngine.getCache(key) || [];
        cached = cached.filter(s => s.id !== studentId);
        await OfflineEngine.setCache(key, cached);

        return { success: true };
    } catch (err) { return handleDBError(err); }
}

// ==========================================
// 2. DAILY ROSTER & MEAL OPERATIONS
// ==========================================
export async function fetchDailyRoster(dateStr) {
    const rosterKey = `roster_${getMessId()}_${dateStr}`;
    try {
        const studentsRes = await fetchDirectory(); 
        
        const cloudMealsPromise = supabase.from('meal_logs').select('*')
            .eq('mess_id', getMessId()).eq('log_date', dateStr)
            .then(res => { if (!res.error) OfflineEngine.setCache(rosterKey, res.data); return res; });

        const cachedMeals = await OfflineEngine.getCache(rosterKey);
        let mealsData = cachedMeals;

        if (!cachedMeals) {
            const { data, error } = await cloudMealsPromise;
            if (error) throw error;
            mealsData = data;
        } else {
            cloudMealsPromise.catch(() => {});
        }

        const mealsMap = {};
        (mealsData || []).forEach(m => mealsMap[m.member_id] = m);

        // Matrix Generation: Merging Profiles with Meal States
        const roster = studentsRes.students.map(student => ({
            id: student.id, name: student.name, room: student.room, status: student.status,
            day_meal: mealsMap[student.id]?.day_meal || 'OFF',
            night_meal: mealsMap[student.id]?.night_meal || 'OFF'
        }));

        return { success: true, roster };
    } catch (err) { return handleDBError(err); }
}

export async function overrideMeal(dateStr, studentId, timeOfDay, value) {
    const recordId = `${dateStr}_${studentId}`;
    const payload = { id: recordId, mess_id: getMessId(), member_id: studentId, log_date: dateStr };
    
    if (timeOfDay === 'day') payload.day_meal = value;
    if (timeOfDay === 'night') payload.night_meal = value;

    // 1. Throttle Mutation via Queue
    await OfflineEngine.queueMutation('meal_logs', recordId, payload, 'UPSERT');

    // 2. SSOT INJECTION: Deep merge into Daily Roster Cache
    const rosterKey = `roster_${getMessId()}_${dateStr}`;
    let dailyCache = await OfflineEngine.getCache(rosterKey) || [];
    const dailyIdx = dailyCache.findIndex(m => m.member_id === studentId);
    
    if (dailyIdx > -1) {
        dailyCache[dailyIdx] = { ...dailyCache[dailyIdx], ...payload };
    } else {
        dailyCache.push({ day_meal: 'OFF', night_meal: 'OFF', ...payload });
    }
    await OfflineEngine.setCache(rosterKey, dailyCache);

    // 3. SSOT INJECTION: Deep merge into Monthly Stats Cache to prevent "Split-Brain" UI resets
    const monthPrefix = dateStr.substring(0, 7);
    const statsKey = `stats_${getMessId()}_${monthPrefix}`;
    let monthlyCache = await OfflineEngine.getCache(statsKey) || [];
    const monthlyIdx = monthlyCache.findIndex(m => m.member_id === studentId && m.log_date === dateStr);
    
    if (monthlyIdx > -1) {
        monthlyCache[monthlyIdx] = { ...monthlyCache[monthlyIdx], ...payload };
    } else {
        monthlyCache.push({ day_meal: 'OFF', night_meal: 'OFF', ...payload });
    }
    await OfflineEngine.setCache(statsKey, monthlyCache);

    return { success: true };
}

// ==========================================
// 3. ANALYTICS & STATS ENGINE
// ==========================================
export async function fetchMonthlyStats(monthPrefix) {
    const key = `stats_${getMessId()}_${monthPrefix}`;
    const bounds = getMonthBounds(monthPrefix);
    
    try {
        const cloudPromise = supabase.from('meal_logs').select('*')
            .eq('mess_id', getMessId())
            .gte('log_date', bounds.start)
            .lte('log_date', bounds.end)
            .then(res => { if (!res.error) OfflineEngine.setCache(key, res.data); return res; });

        const cached = await OfflineEngine.getCache(key);
        if (cached) {
            cloudPromise.catch(() => {}); 
            return { success: true, logs: cached };
        }

        const { data, error } = await cloudPromise;
        if (error) throw error;
        return { success: true, logs: data || [] };
    } catch (err) { return handleDBError(err); }
}

// ==========================================
// 4. FINANCIAL LEDGER & PRESERVATION PROTOCOL
// ==========================================
export async function fetchTransactions(monthPrefix) {
    const key = `txns_${getMessId()}_${monthPrefix}`;
    const bounds = getMonthBounds(monthPrefix); 
    
    try {
        const cloudPromise = supabase.from('transactions').select('*, profiles(name)')
            .eq('mess_id', getMessId())
            .gte('txn_date', bounds.start)
            .lte('txn_date', bounds.end)
            .order('txn_date', { ascending: false }).order('created_at', { ascending: false })
            .then(res => { if (!res.error) OfflineEngine.setCache(key, res.data); return res; });

        const cached = await OfflineEngine.getCache(key);
        if (cached) {
            cloudPromise.catch(() => {});
            return { success: true, transactions: cached };
        }

        const { data, error } = await cloudPromise;
        if (error) throw error;
        return { success: true, transactions: data || [] };
    } catch (err) { return handleDBError(err); }
}

export async function addTransaction(id, type, amount, dateStr, description = '', memberId = null) {
    const recordId = id || crypto.randomUUID();
    const payload = { id: recordId, mess_id: getMessId(), txn_type: type, amount: parseFloat(amount), txn_date: dateStr, description: description.trim() };
    
    // 🧠 LEDGER PRESERVATION: Capture name snapshot for permanent offline records
    if (memberId) {
        payload.member_id = memberId;
        const dir = await OfflineEngine.getCache(`dir_${getMessId()}`) || [];
        const student = dir.find(s => s.id === memberId);
        if (student) {
            payload.profiles = { name: student.name }; // UI Optimistic Rendering
            payload.member_name_snapshot = student.name; // Database Safety Net
        }
    }

    await OfflineEngine.queueMutation('transactions', recordId, payload, 'UPSERT');

    const monthPrefix = dateStr.substring(0, 7);
    const key = `txns_${getMessId()}_${monthPrefix}`;
    let cachedTxns = await OfflineEngine.getCache(key) || [];
    cachedTxns.unshift(payload);
    await OfflineEngine.setCache(key, cachedTxns);

    return { success: true, id: recordId };
}

export async function updateTransaction(id, type, amount, dateStr, description = '', memberId = null) {
    const payload = { id, mess_id: getMessId(), txn_type: type, amount: parseFloat(amount), txn_date: dateStr, description: description.trim() };
    
    if (memberId) {
        payload.member_id = memberId;
        const dir = await OfflineEngine.getCache(`dir_${getMessId()}`) || [];
        const student = dir.find(s => s.id === memberId);
        if (student) {
            payload.profiles = { name: student.name };
            payload.member_name_snapshot = student.name;
        }
    }

    await OfflineEngine.queueMutation('transactions', id, payload, 'UPSERT');

    const monthPrefix = dateStr.substring(0, 7);
    const key = `txns_${getMessId()}_${monthPrefix}`;
    let cachedTxns = await OfflineEngine.getCache(key) || [];
    const idx = cachedTxns.findIndex(t => t.id === id);
    
    if (idx > -1) {
        cachedTxns[idx] = { ...cachedTxns[idx], ...payload };
        await OfflineEngine.setCache(key, cachedTxns);
    }

    return { success: true };
}

export async function deleteTransaction(id) {
    try {
        // 🧠 UPGRADE: Route through the mutation queue with action 'DELETE'
        await OfflineEngine.queueMutation('transactions', id, { id }, 'DELETE');

        // 🧠 GHOST TRANSACTION SWEEPER: Dynamically finds and purges the key regardless of month
        const allKeys = await OfflineEngine.getAllCacheKeys();
        const txnKeys = allKeys.filter(k => k.startsWith(`txns_${getMessId()}`));
        
        for (let key of txnKeys) {
            let cached = await OfflineEngine.getCache(key);
            if (cached && cached.some(t => t.id === id)) {
                cached = cached.filter(t => t.id !== id);
                await OfflineEngine.setCache(key, cached);
                break; 
            }
        }

        return { success: true };
    } catch (err) { return handleDBError(err); }
}

// ==========================================
// 5. GLOBAL CONFIGURATION
// ==========================================
export async function fetchSettings() {
    const key = `config_${getMessId()}`;
    try {
        const cloudPromise = supabase.from('mess_config').select('*').eq('mess_id', getMessId()).maybeSingle()
            .then(res => { if (!res.error) OfflineEngine.setCache(key, res.data); return res; });

        const cached = await OfflineEngine.getCache(key);
        if (cached) return { success: true, config: cached };

        const { data, error } = await cloudPromise;
        if (error) throw error;
        return { success: true, config: data || {} };
    } catch (err) { return handleDBError(err); }
}

export async function updateSettings(updates) {
    try {
        const payload = { mess_id: getMessId(), ...updates };
        // Offline capability enabled for settings
        await OfflineEngine.queueMutation('mess_config', getMessId(), payload, 'UPSERT');
        
        // Clear local cache to force a fresh pull or merge on next read
        const key = `config_${getMessId()}`;
        let cached = await OfflineEngine.getCache(key) || {};
        cached = { ...cached, ...updates };
        await OfflineEngine.setCache(key, cached);
        
        return { success: true };
    } catch (err) { return handleDBError(err); }
}

// ==========================================
// 6. MESS IDENTITY PROFILE
// ==========================================
export async function updateMessProfile(updates) {
    try {
        // Requires immediate network to avoid auth token desyncs, kept as direct call
        const { error } = await supabase.from('messes').update(updates).eq('id', getMessId());
        if (error) throw error;
        return { success: true };
    } catch (err) { return handleDBError(err); }
}

// ==========================================
// 7. COMMUNICATIONS HUB (SSOT RESTORED)
// ==========================================
export async function fetchAllAnnouncements() {
    const key = `comms_${getMessId()}`;
    try {
        const cloudPromise = supabase.from('announcements').select('*')
            .eq('mess_id', getMessId())
            .gte('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .then(res => { if (!res.error) OfflineEngine.setCache(key, res.data); return res; });

        const cached = await OfflineEngine.getCache(key);
        if (cached) {
            cloudPromise.catch(() => {});
            return { success: true, announcements: cached };
        }

        const { data, error } = await cloudPromise;
        if (error) throw error;
        return { success: true, announcements: data || [] };
    } catch (err) { return handleDBError(err); }
}

export async function createAnnouncement(message, expiresAt) {
    try {
        const id = crypto.randomUUID();
        const payload = {
            id,
            mess_id: getMessId(),
            message: message.trim(),
            expires_at: expiresAt,
            display_frequency: 'DISMISSIBLE',
            created_at: new Date().toISOString()
        };

        // ⚡ Offline capability restored: Route through mutation queue
        await OfflineEngine.queueMutation('announcements', id, payload, 'UPSERT');

        const key = `comms_${getMessId()}`;
        let cached = await OfflineEngine.getCache(key) || [];
        cached.unshift(payload);
        await OfflineEngine.setCache(key, cached);

        return { success: true };
    } catch (err) { return handleDBError(err); }
}

export async function deleteAnnouncement(id) {
    try {
        // 🧠 UPGRADE: Route through the mutation queue with action 'DELETE'
        await OfflineEngine.queueMutation('announcements', id, { id }, 'DELETE');

        const key = `comms_${getMessId()}`;
        let cached = await OfflineEngine.getCache(key) || [];
        cached = cached.filter(a => a.id !== id);
        await OfflineEngine.setCache(key, cached);

        return { success: true };
    } catch (err) { return handleDBError(err); }
}
