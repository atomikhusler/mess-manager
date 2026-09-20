// user/user-db.js
import { supabase, handleDBError } from '../core/supabase-client.js';
import { OfflineEngine } from '../core/offline-engine.js'; // 🧠 Injected Dependency

export function getSession() {
    const sessionStr = localStorage.getItem('mm_user_session');
    if (!sessionStr) {
        window.location.replace('./index.html');
        throw new Error("No active session");
    }
    return JSON.parse(sessionStr);
}

export let timeOffsetMs = 0;

export async function syncServerTime() {
    try {
        const startFetch = Date.now();
        const { data, error } = await supabase.from('mess_config').select('created_at').limit(1);
        if (error) throw error;
        timeOffsetMs = 0; 
        return true;
    } catch (e) { return false; }
}

export function getTrueTime() {
    return new Date(Date.now() + timeOffsetMs);
}

// 🧠 UPGRADE: Implemented Stale-While-Revalidate
export async function fetchUserConfig() {
    const { messId } = getSession();
    const key = `user_config_${messId}`;
    try {
        const cloudPromise = supabase.from('mess_config').select('*').eq('mess_id', messId).maybeSingle()
            .then(res => { if (!res.error) OfflineEngine.setCache(key, res.data); return res; });

        const cached = await OfflineEngine.getCache(key);
        if (cached) {
            cloudPromise.catch(() => {});
            return { success: true, config: cached };
        }

        const { data, error } = await cloudPromise;
        if (error) throw error;
        return { success: true, config: data };
    } catch (err) { return handleDBError(err); }
}

export async function fetchTodayMeal(dateStr) {
    const { userId } = getSession();
    const recordId = `${dateStr}_${userId}`;
    const key = `user_meal_${recordId}`;
    
    try {
        const cloudPromise = supabase.from('meal_logs').select('*').eq('id', recordId).maybeSingle()
            .then(res => { if (!res.error && res.data) OfflineEngine.setCache(key, res.data); return res; });

        const cached = await OfflineEngine.getCache(key);
        if (cached) {
            cloudPromise.catch(() => {});
            return { success: true, meal: cached };
        }

        const { data, error } = await cloudPromise;
        if (error) throw error;
        
        const defaultMeal = data || { day_meal: 'OFF', night_meal: 'OFF' };
        await OfflineEngine.setCache(key, defaultMeal);
        return { success: true, meal: defaultMeal };
    } catch (err) { return handleDBError(err); }
}

// 🧠 UPGRADE: Offloaded to OfflineEngine Queue
export async function updateMealToggle(dateStr, timeOfDay, value) {
    try {
        const { userId, messId } = getSession();
        const recordId = `${dateStr}_${userId}`;
        
        const payload = { id: recordId, mess_id: messId, member_id: userId, log_date: dateStr };
        if (timeOfDay === 'day') payload.day_meal = value;
        if (timeOfDay === 'night') payload.night_meal = value;

        // Route through local queue instead of direct Supabase API
        await OfflineEngine.queueMutation('meal_logs', recordId, payload);

        // SSOT Injection: Update local cache instantly
        const key = `user_meal_${recordId}`;
        let cached = await OfflineEngine.getCache(key) || { day_meal: 'OFF', night_meal: 'OFF' };
        cached = { ...cached, ...payload };
        await OfflineEngine.setCache(key, cached);

        return { success: true };
    } catch (err) { return handleDBError(err); }
}

export async function fetchActiveAnnouncements() {
    const { messId } = getSession();
    const key = `user_comms_${messId}`;
    const trueNow = getTrueTime().toISOString();
    
    try {
        const cloudPromise = supabase.from('announcements').select('*')
            .eq('mess_id', messId).gt('expires_at', trueNow).order('created_at', { ascending: false })
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

export async function fetchLedgerSnapshot(monthPrefix) {
    const { userId, messId } = getSession();
    const key = `user_ledger_${monthPrefix}_${userId}`;
    
    const [year, month] = monthPrefix.split('-');
    const lastDay = new Date(year, month, 0).getDate();
    const startBound = `${monthPrefix}-01`;
    const endBound = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

    try {
        const cloudPromise = Promise.all([
            supabase.from('transactions').select('txn_type, amount').eq('mess_id', messId).eq('member_id', userId).gte('txn_date', startBound).lte('txn_date', endBound),
            supabase.from('meal_logs').select('day_meal, night_meal').eq('mess_id', messId).eq('member_id', userId).gte('log_date', startBound).lte('log_date', endBound),
            supabase.from('mess_config').select('meal_rate').eq('mess_id', messId).maybeSingle()
        ]).then(async ([txnRes, mealRes, confRes]) => {
            if (txnRes.error || mealRes.error) throw new Error("Fetch failed");
            
            let advances = 0, manualExpenses = 0, mealsConsumed = 0;
            (txnRes.data || []).forEach(txn => {
                if (txn.txn_type === 'ADVANCE') advances += txn.amount;
                if (txn.txn_type === 'EXPENSE') manualExpenses += txn.amount;
            });
            (mealRes.data || []).forEach(m => {
                if (m.day_meal && m.day_meal !== 'OFF') mealsConsumed++;
                if (m.night_meal && m.night_meal !== 'OFF') mealsConsumed++;
            });

            const mealRate = confRes.data?.meal_rate || 50; 
            const mealExpense = mealsConsumed * mealRate;
            const totalExpense = manualExpenses + mealExpense;
            const snapshot = { advances, manualExpenses, mealExpense, totalExpense, mealsConsumed, mealRate, balance: advances - totalExpense };
            
            await OfflineEngine.setCache(key, snapshot);
            return snapshot;
        });

        const cached = await OfflineEngine.getCache(key);
        if (cached) {
            cloudPromise.catch(() => {});
            return { success: true, snapshot: cached };
        }

        const snapshot = await cloudPromise;
        return { success: true, snapshot };
    } catch (err) { return handleDBError(err); }
}
