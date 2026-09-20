// manager/ui-roster.js
import { fetchDailyRoster, overrideMeal, fetchDirectory, fetchMonthlyStats, fetchSettings, fetchTransactions } from './manager-db.js';
import { showToast, refreshIcons, showModal, triggerHaptic } from '../core/ui-core.js';

let currentDate = new Date().toLocaleDateString('en-CA'); 
let currentMonthStr = currentDate.substring(0, 7);

// Context Caches (Prevents redundant heavy fetching when switching days in the same month)
let activeRosterCache = [];
let directoryData = [];
let monthLogs = [];
let configCache = {};
let txnResCache = { success: false, transactions: [] };
let sortMode = 0; // 0 = A-Z, 1 = Room, 2 = Meal Type
let liveMealRate = 0;

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`;
}

function getInitials(name) {
    return name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// Generates the sleek Context Pill
function getRelativeDayPill() {
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(currentDate); target.setHours(0,0,0,0);
    const diff = Math.round((target - today) / 86400000);
    
    if (diff === 0) return `<span class="bg-telegram/20 text-telegram px-2 py-0.5 rounded uppercase text-[9px] font-black border border-telegram/20 tracking-widest shadow-sm">Today</span>`;
    if (diff === 1) return `<span class="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded uppercase text-[9px] font-black border border-emerald-500/20 tracking-widest shadow-sm">Tomorrow</span>`;
    if (diff === -1) return `<span class="bg-white/10 text-white/60 px-2 py-0.5 rounded uppercase text-[9px] font-black border border-white/10 tracking-widest shadow-sm">Yesterday</span>`;
    
    const dStr = target.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
    return `<span class="bg-white/5 text-white/40 px-2 py-0.5 rounded uppercase text-[9px] font-black border border-white/5 tracking-widest">${dStr}</span>`;
}

export async function initDailyView() {
    const container = document.getElementById('view-roster');
    if (!container) return;

    if (container.innerHTML === '') {
        container.innerHTML = `
            <!-- ERGONOMIC HORIZON CALENDAR & SORTING -->
            <div class="mb-4 px-2 pt-2 fade-in flex items-center gap-2">
                <div class="relative shrink-0">
                    <input type="date" id="roster-date-picker" class="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10" value="${currentDate}">
                    <button class="w-[48px] h-[48px] bg-telegram rounded-[14px] flex items-center justify-center text-white shadow-[0_0_15px_rgba(51,144,236,0.3)] active-scale relative z-0">
                        <i data-lucide="calendar-days" class="w-5 h-5"></i>
                    </button>
                </div>
                
                <div id="horizon-ribbon" class="flex-1 flex gap-1.5 overflow-x-auto disable-scrollbars scroll-smooth snap-x snap-mandatory">
                    <!-- Injected by renderHorizonRibbon() -->
                </div>

                <button id="btn-sort-roster" class="w-[48px] h-[48px] shrink-0 rounded-[14px] bg-[#111113] border border-white/[0.08] flex flex-col items-center justify-center active-scale transition-colors text-white relative shadow-sm">
                    <i data-lucide="arrow-up-down" class="w-3.5 h-3.5 mt-0.5"></i>
                    <span id="roster-sort-indicator" class="text-[7px] font-black uppercase tracking-widest text-telegram mt-0.5">A-Z</span>
                </button>
            </div>
            
            <div id="roster-kpis" class="grid grid-cols-2 gap-2.5 mb-4 px-2 fade-in"></div>
            
            <div class="flex justify-between items-center px-3 mb-2 h-6">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40" id="roster-list-header">Alphabetical View</div>
                <div id="roster-day-pill" class="transition-all duration-300"></div>
            </div>

            <!-- Wrapper retains height to prevent dancing -->
            <div class="px-2 pb-28 min-h-[50vh]">
                <div id="roster-feed" class="space-y-2 transition-opacity duration-300"></div>
            </div>
        `;

        document.getElementById('roster-date-picker').addEventListener('change', (e) => {
            triggerHaptic('light');
            handleDateChange(e.target.value);
        });

        document.getElementById('btn-sort-roster').addEventListener('click', () => {
            triggerHaptic('light');
            sortMode = (sortMode + 1) % 3;
            const indicator = document.getElementById('roster-sort-indicator');
            const header = document.getElementById('roster-list-header');
            
            if (sortMode === 0) {
                indicator.innerText = "A-Z";
                indicator.className = "text-[7px] font-black uppercase tracking-widest text-telegram mt-0.5";
                header.innerText = "Alphabetical View";
            } else if (sortMode === 1) {
                indicator.innerText = "ROOM";
                indicator.className = "text-[7px] font-black uppercase tracking-widest text-amber-500 mt-0.5";
                header.innerText = "Room Sector View";
            } else {
                indicator.innerText = "MEAL";
                indicator.className = "text-[7px] font-black uppercase tracking-widest text-emerald-400 mt-0.5";
                header.innerText = "Serving Mode";
            }
            renderRoster();
        });
    }

    renderHorizonRibbon();
    document.getElementById('roster-day-pill').innerHTML = getRelativeDayPill();
    
    // Initial Load - Full Fetch
    const feed = document.getElementById('roster-feed');
    if (activeRosterCache.length === 0) {
        feed.innerHTML = `<div class="text-center py-12 font-bold text-[12px] animate-pulse text-white/30 flex flex-col items-center gap-3"><i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Initializing Kitchen Engine...</div>`;
        refreshIcons();
    }
    
    await fetchMonthContext(currentMonthStr);
    await fetchDaySpecificRoster(currentDate);
}

// 🧠 Optimistic Date Transition Pipeline
async function handleDateChange(newDate) {
    if (currentDate === newDate) return;
    
    currentDate = newDate;
    document.getElementById('roster-day-pill').innerHTML = getRelativeDayPill();
    renderHorizonRibbon();

    const feed = document.getElementById('roster-feed');
    // Lock and Dim UI to prevent dancing
    feed.classList.add('opacity-40', 'pointer-events-none');
    
    const newMonthStr = currentDate.substring(0, 7);
    
    // Smart Caching: Only fetch heavy stats if we jump to a new month
    if (newMonthStr !== currentMonthStr) {
        currentMonthStr = newMonthStr;
        await fetchMonthContext(currentMonthStr);
    }

    await fetchDaySpecificRoster(currentDate);
    
    // Unlock UI
    feed.classList.remove('opacity-40', 'pointer-events-none');
}

async function fetchMonthContext(monthStr) {
    const [dirRes, statsRes, setRes, txns] = await Promise.all([
        fetchDirectory(),
        fetchMonthlyStats(monthStr),
        fetchSettings(),
        fetchTransactions(monthStr)
    ]);

    if (dirRes.success) directoryData = dirRes.students;
    if (statsRes.success) monthLogs = statsRes.logs;
    if (setRes.success) configCache = setRes.config;
    if (txns.success) txnResCache = txns;

    // Calculate Live Meal Rate for Anomaly Detection
    let globalMeals = 0, globalExpense = 0;
    monthLogs.forEach(l => {
        if (l.day_meal !== 'OFF') globalMeals++;
        if (l.night_meal !== 'OFF') globalMeals++;
    });
    
    if (txnResCache.success) {
        txnResCache.transactions.forEach(t => {
            if (t.txn_type === 'EXPENSE' && !t.description.startsWith('[ASSET]')) globalExpense += parseFloat(t.amount);
        });
    }
    liveMealRate = globalMeals > 0 ? (globalExpense / globalMeals) : 0;
}

async function fetchDaySpecificRoster(dateStr) {
    const rosRes = await fetchDailyRoster(dateStr);
    
    if (!rosRes.success) {
        document.getElementById('roster-feed').innerHTML = `<div class="text-center py-10 font-bold text-rose-500">Failed to load matrix.</div>`;
        return;
    }

    activeRosterCache = rosRes.roster.filter(s => {
        if (s.status === 'INACTIVE' && s.day_meal === 'OFF' && s.night_meal === 'OFF') return false;
        return true;
    });

    renderRoster();
}

function renderHorizonRibbon() {
    const ribbon = document.getElementById('horizon-ribbon');
    const targetDate = new Date(currentDate);
    
    let html = '';
    // Show -3 to +3 days for better context
    for (let i = -3; i <= 3; i++) {
        const d = new Date(targetDate);
        d.setDate(targetDate.getDate() + i);
        
        const isSelected = i === 0;
        const dateStr = d.toLocaleDateString('en-CA');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = d.getDate();
        
        html += `
            <button class="ribbon-btn shrink-0 snap-center w-[52px] h-[48px] rounded-[14px] flex flex-col items-center justify-center active-scale transition-colors border ${isSelected ? 'bg-white/10 border-white/20 text-white selected-day' : 'bg-[#111113] border-white/[0.04] text-white/40 hover:bg-white/[0.02]'}" data-date="${dateStr}">
                <div class="text-[9px] font-black uppercase tracking-widest leading-none mb-1">${dayName}</div>
                <div class="text-[15px] font-black leading-none">${dayNum}</div>
            </button>
        `;
    }
    
    ribbon.innerHTML = html;
    
    // Auto-Center Smooth Scrolling
    setTimeout(() => {
        const selectedBtn = ribbon.querySelector('.selected-day');
        if (selectedBtn) selectedBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 10);
    
    ribbon.querySelectorAll('.ribbon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            handleDateChange(e.currentTarget.getAttribute('data-date'));
        });
    });
}

function isMealLocked(cutoffTimeStr) {
    const now = new Date();
    const targetDate = new Date(currentDate);
    targetDate.setHours(0,0,0,0);
    
    const today = new Date();
    today.setHours(0,0,0,0);

    if (targetDate < today) return true; 
    if (targetDate > today) return false; 
    if (!cutoffTimeStr) return false;
    
    const [hours, minutes] = cutoffTimeStr.split(':').map(Number);
    const cutoffDate = new Date();
    cutoffDate.setHours(hours, minutes, 0, 0);
    
    return now > cutoffDate;
}

function updateRosterKPIs() {
    let dayRice = 0, dayNoRice = 0, nightRice = 0, nightNoRice = 0;
    
    activeRosterCache.forEach(s => {
        if (s.day_meal === 'RICE') dayRice++;
        if (s.day_meal === 'NORICE') dayNoRice++;
        if (s.night_meal === 'RICE') nightRice++;
        if (s.night_meal === 'NORICE') nightNoRice++;
    });

    const kpis = document.getElementById('roster-kpis');
    if (kpis) {
        kpis.innerHTML = `
            <div class="bg-[#09090b] border border-white/[0.08] rounded-[20px] p-3.5 relative overflow-hidden shadow-sm">
                <div class="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                    <i data-lucide="sun" class="w-10 h-10 text-amber-500"></i>
                </div>
                <div class="text-[9px] font-black uppercase tracking-widest mb-1.5 text-white/40">Lunch Production</div>
                <div class="flex justify-between items-end relative z-10">
                    <div><span class="text-[22px] font-black text-white leading-none">${dayRice}</span><span class="text-[9px] font-bold ml-1 text-white/40">Rice</span></div>
                    <div><span class="text-[15px] font-black text-white leading-none">${dayNoRice}</span><span class="text-[8px] font-bold ml-1 text-white/40">N-Rice</span></div>
                </div>
            </div>
            <div class="bg-[#09090b] border border-white/[0.08] rounded-[20px] p-3.5 relative overflow-hidden shadow-sm">
                <div class="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                    <i data-lucide="moon" class="w-10 h-10 text-telegram"></i>
                </div>
                <div class="text-[9px] font-black uppercase tracking-widest mb-1.5 text-white/40">Dinner Production</div>
                <div class="flex justify-between items-end relative z-10">
                    <div><span class="text-[22px] font-black text-white leading-none">${nightRice}</span><span class="text-[9px] font-bold ml-1 text-white/40">Rice</span></div>
                    <div><span class="text-[15px] font-black text-white leading-none">${nightNoRice}</span><span class="text-[8px] font-bold ml-1 text-white/40">N-Rice</span></div>
                </div>
            </div>
        `;
    }
}

function renderRoster() {
    const feed = document.getElementById('roster-feed');
    
    if (activeRosterCache.length === 0) {
        feed.innerHTML = `<div class="flex flex-col items-center justify-center py-16 opacity-30"><i data-lucide="utensils-crossed" class="w-10 h-10 mb-3"></i><div class="text-[12px] font-black tracking-tight">No active meals today</div></div>`;
        updateRosterKPIs();
        refreshIcons();
        return;
    }

    const lunchLocked = isMealLocked(configCache.day_cutoff);
    const dinnerLocked = isMealLocked(configCache.night_cutoff);

    // Deep merge intelligence
    const enrichedRoster = activeRosterCache.map(s => {
        const dirData = directoryData.find(d => d.id === s.id);
        
        let sMeals = 0, sAdv = 0;
        monthLogs.forEach(l => { if (l.member_id === s.id) { if (l.day_meal !== 'OFF') sMeals++; if (l.night_meal !== 'OFF') sMeals++; } });
        if (txnResCache.success) {
            txnResCache.transactions.forEach(t => { if (t.member_id === s.id && t.txn_type === 'ADVANCE') sAdv += parseFloat(t.amount); });
        }
        const remainingDues = (sMeals * liveMealRate) - sAdv;
        const isHighDebt = remainingDues > 3000; 

        // Phantom Protocol
        let consecutiveSkips = 0;
        let isPhantom = false;
        
        if (s.day_meal !== 'OFF' || s.night_meal !== 'OFF') {
            const pastLogs = monthLogs.filter(l => l.member_id === s.id && new Date(l.log_date) < new Date(currentDate)).sort((a,b) => new Date(b.log_date) - new Date(a.log_date));
            const recent = pastLogs.slice(0, 2); 
            if (recent.length === 2) {
                recent.forEach(l => {
                    if (l.day_meal === 'OFF') consecutiveSkips++;
                    if (l.night_meal === 'OFF') consecutiveSkips++;
                });
                if (consecutiveSkips === 4) isPhantom = true;
            }
        }

        return { ...s, room: dirData?.room || '-', name: dirData?.name || s.name, remainingDues, isHighDebt, isPhantom };
    });

    enrichedRoster.sort((a, b) => {
        if (sortMode === 1) return a.room.localeCompare(b.room, undefined, { numeric: true, sensitivity: 'base' });
        if (sortMode === 2) {
            const aActive = a.day_meal !== 'OFF' || a.night_meal !== 'OFF';
            const bActive = b.day_meal !== 'OFF' || b.night_meal !== 'OFF';
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name);
    });

    updateRosterKPIs();

    feed.innerHTML = enrichedRoster.map(s => {
        const initial = s.name.charAt(0).toUpperCase();
        const borderClass = s.isHighDebt ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]' : 'border-white/[0.06] shadow-sm';
        
        return `
            <!-- Slimmer Card Design (p-2.5 instead of p-3) -->
            <div class="bg-[#09090b] border ${borderClass} rounded-[16px] p-2.5 flex flex-col gap-2.5 relative overflow-hidden" data-id="${s.id}">
                ${s.isPhantom ? `<div class="bg-rose-500/10 border-b border-rose-500/20 -mx-2.5 -mt-2.5 mb-0.5 px-3 py-1.5 flex items-center gap-2"><i data-lucide="ghost" class="w-3.5 h-3.5 text-rose-400"></i><span class="text-[9px] font-black uppercase tracking-widest text-rose-400">Phantom Skips Detected</span></div>` : ''}
                
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-[10px] flex items-center justify-center text-white text-[11px] font-black shadow-inner shrink-0" style="background-color: ${getAvatarColor(s.name)};">
                        ${initial}
                    </div>
                    <div class="flex-1 min-w-0 pr-1 flex flex-row items-center justify-between">
                        <div class="font-black text-[14px] truncate flex items-center text-white">
                            ${s.name}
                            ${s.isHighDebt ? `<span class="bg-amber-500/10 text-amber-500 text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border border-amber-500/20 ml-2 shrink-0">Debt</span>` : ''}
                        </div>
                        <!-- Inline Room Number -->
                        <div class="text-[9px] font-bold uppercase tracking-widest text-white/40 shrink-0 bg-white/[0.04] border border-white/[0.05] px-2 py-0.5 rounded-md">Rm ${s.room}</div>
                    </div>
                </div>
                
                <div class="flex gap-1.5">
                    <div class="flex-1 bg-[#111113] border border-white/[0.04] rounded-[10px] p-1 flex gap-0.5 relative ${lunchLocked ? 'opacity-50' : ''}">
                        ${lunchLocked ? `<div class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#09090b] rounded-full border border-white/10 flex items-center justify-center shadow-lg z-10"><i data-lucide="lock" class="w-2.5 h-2.5 text-rose-400"></i></div>` : ''}
                        ${renderSegment(s.id, 'day', 'RICE', s.day_meal, 'R', lunchLocked)}
                        ${renderSegment(s.id, 'day', 'NORICE', s.day_meal, 'NR', lunchLocked)}
                        ${renderSegment(s.id, 'day', 'OFF', s.day_meal, 'Off', lunchLocked)}
                    </div>
                    <div class="flex-1 bg-[#111113] border border-white/[0.04] rounded-[10px] p-1 flex gap-0.5 relative ${dinnerLocked ? 'opacity-50' : ''}">
                        ${dinnerLocked ? `<div class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#09090b] rounded-full border border-white/10 flex items-center justify-center shadow-lg z-10"><i data-lucide="lock" class="w-2.5 h-2.5 text-rose-400"></i></div>` : ''}
                        ${renderSegment(s.id, 'night', 'RICE', s.night_meal, 'R', dinnerLocked)}
                        ${renderSegment(s.id, 'night', 'NORICE', s.night_meal, 'NR', dinnerLocked)}
                        ${renderSegment(s.id, 'night', 'OFF', s.night_meal, 'Off', dinnerLocked)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    refreshIcons();
    attachToggleListeners();
}

function renderSegment(studentId, timeOfDay, value, currentValue, label, isLocked) {
    const isActive = value === currentValue;
    let classes = `segment-btn flex-1 py-1.5 rounded-[8px] text-[10px] font-black active-scale transition-all `;
    
    if (isActive) {
        if (value === 'RICE') classes += "bg-telegram text-white shadow-[0_0_10px_rgba(51,144,236,0.3)]";
        else if (value === 'NORICE') classes += "bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.3)]";
        else classes += "bg-white/15 text-white shadow-sm border border-white/5";
    } else {
        classes += "bg-transparent text-white/30 hover:bg-white/[0.04]";
    }

    return `<button class="${classes}" data-id="${studentId}" data-time="${timeOfDay}" data-val="${value}" data-locked="${isLocked}">${label}</button>`;
}

function attachToggleListeners() {
    const feed = document.getElementById('roster-feed');
    
    feed.querySelectorAll('.segment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const studentId = btn.getAttribute('data-id');
            const timeOfDay = btn.getAttribute('data-time');
            const value = btn.getAttribute('data-val');
            const isLocked = btn.getAttribute('data-locked') === 'true';

            const studentIndex = activeRosterCache.findIndex(s => s.id === studentId);
            if (studentIndex === -1) return;

            const prevValue = timeOfDay === 'day' ? activeRosterCache[studentIndex].day_meal : activeRosterCache[studentIndex].night_meal;
            if (prevValue === value) return;

            if (isLocked) {
                triggerHaptic('heavy');
                showModal({
                    title: "Override Time-Lock?",
                    message: "The kitchen cut-off time has already passed. Changing this may disrupt physical food inventory.",
                    type: "danger",
                    confirmText: "Force Override",
                    onConfirm: (closeModal) => {
                        executeOptimisticToggle(studentIndex, timeOfDay, value, prevValue, btn);
                        if(closeModal) closeModal();
                    }
                });
                return;
            }

            triggerHaptic('light'); 
            executeOptimisticToggle(studentIndex, timeOfDay, value, prevValue, btn);
        });
    });
}

function executeOptimisticToggle(studentIndex, timeOfDay, value, prevValue, btn) {
    const studentId = activeRosterCache[studentIndex].id;

    // 1. Instant Memory Update
    if (timeOfDay === 'day') activeRosterCache[studentIndex].day_meal = value;
    else activeRosterCache[studentIndex].night_meal = value;

    // 2. DOM Classes Update
    const container = btn.parentElement;
    container.querySelectorAll('.segment-btn').forEach(b => {
        b.className = `segment-btn flex-1 py-1.5 rounded-[8px] text-[10px] font-black active-scale transition-all bg-transparent text-white/30 hover:bg-white/[0.04]`;
    });
    
    if (value === 'RICE') btn.className = "segment-btn flex-1 py-1.5 rounded-[8px] text-[10px] font-black active-scale transition-all bg-telegram text-white shadow-[0_0_10px_rgba(51,144,236,0.3)]";
    else if (value === 'NORICE') btn.className = "segment-btn flex-1 py-1.5 rounded-[8px] text-[10px] font-black active-scale transition-all bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.3)]";
    else btn.className = "segment-btn flex-1 py-1.5 rounded-[8px] text-[10px] font-black active-scale transition-all bg-white/15 text-white shadow-sm border border-white/5";

    // 3. Instant KPI Recalculation
    updateRosterKPIs();

    // 4. Background Sync Payload
    overrideMeal(currentDate, studentId, timeOfDay, value).then(res => {
        if (!res.success) {
            triggerHaptic('heavy'); 
            if (timeOfDay === 'day') activeRosterCache[studentIndex].day_meal = prevValue;
            else activeRosterCache[studentIndex].night_meal = prevValue;
            showToast("Network failure. Reverting change.", "error");
            renderRoster(); // Fallback rebuild
        }
    });
}
