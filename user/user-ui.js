// user/user-ui.js
import { fetchTodayMeal, updateMealToggle, getTrueTime, fetchLedgerSnapshot } from './user-db.js';
import { refreshIcons, showToast, triggerHaptic } from '../core/ui-core.js';

let countdownInterval = null;
let isNetworkLocked = false; 

function getLocalTodayString() {
    const trueNow = getTrueTime();
    const offset = trueNow.getTimezoneOffset() * 60000;
    return (new Date(trueNow - offset)).toISOString().split('T')[0];
}

export async function initStudentUI(config) {
    const mainContent = document.getElementById('main-content');
    
    const dayCutoff = config?.day_cutoff || "10:00:00";
    const nightCutoff = config?.night_cutoff || "17:00:00";
    const isFrozen = config?.is_holiday_freeze || false;

    const todayStr = getLocalTodayString();
    
    // Fetch Meal Status & Live Ledger simultaneously
    const [mealRes, ledgerRes] = await Promise.all([
        fetchTodayMeal(todayStr),
        fetchLedgerSnapshot(todayStr.substring(0,7))
    ]);
    
    if (!mealRes.success) {
        mainContent.innerHTML = `<div class="text-center py-10 font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-[24px]">Network Sync Failed. Reconnect to Matrix.</div>`;
        return;
    }

    renderMealCards(mainContent, mealRes.meal, dayCutoff, nightCutoff, isFrozen);
    
    if (ledgerRes.success) {
        renderLedgerSnapshot(mainContent, ledgerRes.snapshot);
    }

    startCountdownTimers(dayCutoff, nightCutoff);
    attachToggleListeners(todayStr, isFrozen);
}

function renderMealCards(container, meals, dayCutoff, nightCutoff, isFrozen) {
    const isDayLocked = isFrozen || hasCutoffPassed(dayCutoff);
    const isNightLocked = isFrozen || hasCutoffPassed(nightCutoff);

    container.innerHTML = `
        <div class="bg-[#09090b] border border-white/[0.08] rounded-[24px] p-5 shadow-sm mb-4 relative overflow-hidden">
            ${isDayLocked ? '<div class="absolute inset-0 bg-black/40 z-10 pointer-events-none"></div>' : ''}
            <div class="flex justify-between items-center mb-5 border-b border-white/[0.06] pb-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
                        <i data-lucide="sun" class="w-5 h-5 text-amber-500"></i>
                    </div>
                    <div>
                        <div class="text-[10px] font-black text-white/40 uppercase tracking-widest">Active Matrix</div>
                        <h2 class="font-black text-lg text-white leading-tight">Day Roster</h2>
                    </div>
                </div>
                <div class="text-right z-20">
                    <div id="timer-day" class="text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-lg ${isDayLocked ? 'bg-white/5 text-white/40' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">
                        ${isDayLocked ? 'LOCKED' : 'CALCULATING...'}
                    </div>
                </div>
            </div>
            <div class="flex gap-2 relative z-20" id="toggle-group-day">
                ${createToggleButton('day', 'OFF', meals.day_meal, isDayLocked)}
                ${createToggleButton('day', 'RICE', meals.day_meal, isDayLocked)}
                ${createToggleButton('day', 'NORICE', meals.day_meal, isDayLocked, 'NO RICE')}
            </div>
        </div>

        <div class="bg-[#09090b] border border-white/[0.08] rounded-[24px] p-5 shadow-sm relative overflow-hidden mb-6">
            ${isNightLocked ? '<div class="absolute inset-0 bg-black/40 z-10 pointer-events-none"></div>' : ''}
            <div class="flex justify-between items-center mb-5 border-b border-white/[0.06] pb-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20">
                        <i data-lucide="moon" class="w-5 h-5 text-indigo-400"></i>
                    </div>
                    <div>
                        <div class="text-[10px] font-black text-white/40 uppercase tracking-widest">Active Matrix</div>
                        <h2 class="font-black text-lg text-white leading-tight">Night Roster</h2>
                    </div>
                </div>
                <div class="text-right z-20">
                    <div id="timer-night" class="text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-lg ${isNightLocked ? 'bg-white/5 text-white/40' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}">
                        ${isNightLocked ? 'LOCKED' : 'CALCULATING...'}
                    </div>
                </div>
            </div>
            <div class="flex gap-2 relative z-20" id="toggle-group-night">
                ${createToggleButton('night', 'OFF', meals.night_meal, isNightLocked)}
                ${createToggleButton('night', 'RICE', meals.night_meal, isNightLocked)}
                ${createToggleButton('night', 'NORICE', meals.night_meal, isNightLocked, 'NO RICE')}
            </div>
        </div>
    `;
    refreshIcons();
}

// 🧠 EXECUTIVE DASHBOARD: Live Ledger Snapshot
function renderLedgerSnapshot(container, snap) {
    const isNegative = snap.balance < 0;
    const balanceColor = isNegative ? 'text-rose-400' : 'text-emerald-400';
    
    container.innerHTML += `
        <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 px-1 mt-6">Financial Snapshot</div>
        
        <div class="bg-gradient-to-br from-[#111113] to-[#09090b] border border-white/[0.08] rounded-[24px] p-5 shadow-sm">
            
            <div class="flex justify-between items-center mb-6">
                <div>
                    <div class="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1 flex items-center gap-1.5"><i data-lucide="wallet" class="w-3 h-3"></i> Monthly Balance</div>
                    <div class="text-3xl font-black font-mono tracking-tighter ${balanceColor}">₹${Math.abs(snap.balance).toLocaleString('en-IN')}</div>
                    <div class="text-[10px] font-bold ${isNegative ? 'text-rose-500/70' : 'text-emerald-500/70'} mt-1 uppercase tracking-widest">${isNegative ? 'Total Amount Due' : 'Available Advance'}</div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1 text-right">Live Rate</div>
                    <div class="text-xl font-black text-white font-mono tracking-tight">₹${snap.mealRate}</div>
                    <div class="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">Per Meal</div>
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-5">
                <div>
                    <div class="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Advances</div>
                    <div class="text-[14px] font-black text-white font-mono">₹${snap.advances.toLocaleString('en-IN')}</div>
                </div>
                <div>
                    <div class="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Est. Bill</div>
                    <div class="text-[14px] font-black text-rose-400 font-mono">₹${snap.totalExpense.toLocaleString('en-IN')}</div>
                </div>
                <div>
                    <div class="text-[9px] font-black uppercase tracking-widest text-telegram/60 mb-1">Total Eaten</div>
                    <div class="text-[14px] font-black text-telegram font-mono">${snap.mealsConsumed} <span class="text-[10px]">Meals</span></div>
                </div>
            </div>

            ${snap.manualExpenses > 0 ? `
                <div class="mt-4 pt-4 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-bold text-white/40">
                    <span>Includes Misc. Deductions:</span>
                    <span class="font-mono font-black text-rose-400">₹${snap.manualExpenses.toLocaleString('en-IN')}</span>
                </div>
            ` : ''}
        </div>
    `;
    refreshIcons();
}

function createToggleButton(timeOfDay, targetValue, currentValue, isLocked, labelOverride = null) {
    const isActive = targetValue === currentValue;
    const label = labelOverride || targetValue;
    
    const activeThemes = {
        'OFF': 'bg-white/10 border border-white/20 text-white shadow-sm',
        'RICE': 'bg-telegram border border-transparent text-white shadow-[0_0_20px_rgba(51,144,236,0.2)]',
        'NORICE': 'bg-amber-500 border border-transparent text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]'
    };

    let baseClass = "flex-1 py-3.5 rounded-[14px] text-[11px] font-black tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 border ";
    
    if (isLocked) {
        baseClass += isActive ? `${activeThemes[targetValue]} opacity-100` : 'bg-transparent border-white/5 text-white/20 opacity-50';
    } else {
        baseClass += isActive ? activeThemes[targetValue] : 'bg-[#111113] border-white/10 text-white/50 hover:bg-white/5 active-scale cursor-pointer';
    }

    const checkIcon = isActive ? `<i data-lucide="check" class="w-3.5 h-3.5"></i>` : '';
    return `<div class="meal-btn ${baseClass} ${isLocked ? '' : 'interactive'}" data-time="${timeOfDay}" data-val="${targetValue}" data-original="${isActive}">${checkIcon} ${label}</div>`;
}

function attachToggleListeners(todayStr, isFrozen) {
    if (isFrozen) return;

    document.querySelectorAll('.meal-btn.interactive').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isNetworkLocked) return; 
            isNetworkLocked = true;

            const clickedBtn = e.currentTarget;
            const timeOfDay = clickedBtn.getAttribute('data-time');
            const targetVal = clickedBtn.getAttribute('data-val');
            const wrapper = clickedBtn.parentElement;

            const oldActiveBtn = wrapper.querySelector('.meal-btn[data-original="true"]');
            const oldVal = oldActiveBtn ? oldActiveBtn.getAttribute('data-val') : 'OFF';

            if (oldVal === targetVal) {
                isNetworkLocked = false;
                return;
            }

            triggerHaptic('light');

            wrapper.querySelectorAll('.meal-btn').forEach(b => {
                b.className = `meal-btn interactive flex-1 py-3.5 rounded-[14px] text-[11px] font-black tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 bg-[#111113] border border-white/10 text-white/50 active-scale cursor-pointer`;
                const val = b.getAttribute('data-val');
                b.innerHTML = val === 'NORICE' ? 'NO RICE' : val;
                b.setAttribute('data-original', 'false');
            });

            const activeThemes = {
                'OFF': 'bg-white/10 border border-white/20 text-white shadow-sm',
                'RICE': 'bg-telegram border border-transparent text-white shadow-[0_0_20px_rgba(51,144,236,0.2)]',
                'NORICE': 'bg-amber-500 border border-transparent text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]'
            };

            clickedBtn.className = `meal-btn interactive flex-1 py-3.5 rounded-[14px] text-[11px] font-black tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 ${activeThemes[targetVal]} active-scale cursor-pointer`;
            clickedBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> ${targetVal === 'NORICE' ? 'NO RICE' : targetVal}`;
            clickedBtn.setAttribute('data-original', 'true');
            refreshIcons();

            const res = await updateMealToggle(todayStr, timeOfDay, targetVal);
            if (res.success) {
                triggerHaptic('medium');
            } else {
                triggerHaptic('heavy');
                showToast("Network Error. Rolling back matrix.", "error");
                
                clickedBtn.setAttribute('data-original', 'false');
                if (oldActiveBtn) {
                    oldActiveBtn.setAttribute('data-original', 'true');
                    oldActiveBtn.click(); 
                }
            }
            isNetworkLocked = false; 
        });
    });
}

function hasCutoffPassed(cutoffTimeStr) {
    const trueNow = getTrueTime(); 
    const [hours, minutes] = cutoffTimeStr.split(':').map(Number);
    const cutoff = new Date(trueNow.getTime());
    cutoff.setHours(hours, minutes, 0, 0);
    return trueNow >= cutoff;
}

function startCountdownTimers(dayCutoff, nightCutoff) {
    if (countdownInterval) clearInterval(countdownInterval);

    const updateTimers = () => {
        const trueNow = getTrueTime();

        const dayEl = document.getElementById('timer-day');
        if (dayEl && !dayEl.innerText.includes('LOCKED')) {
            const [dHours, dMins] = dayCutoff.split(':').map(Number);
            const dDate = new Date(trueNow.getTime());
            dDate.setHours(dHours, dMins, 0, 0);
            
            if (trueNow >= dDate) {
                dayEl.className = "text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-lg bg-white/5 text-white/40";
                dayEl.innerText = "LOCKED";
                lockUI('day');
            } else {
                dayEl.innerText = formatTimeDiff(trueNow, dDate);
            }
        }

        const nightEl = document.getElementById('timer-night');
        if (nightEl && !nightEl.innerText.includes('LOCKED')) {
            const [nHours, nMins] = nightCutoff.split(':').map(Number);
            const nDate = new Date(trueNow.getTime());
            nDate.setHours(nHours, nMins, 0, 0);
            
            if (trueNow >= nDate) {
                nightEl.className = "text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-lg bg-white/5 text-white/40";
                nightEl.innerText = "LOCKED";
                lockUI('night');
            } else {
                nightEl.innerText = formatTimeDiff(trueNow, nDate);
            }
        }
    };

    updateTimers();
    countdownInterval = setInterval(updateTimers, 60000); 
}

function formatTimeDiff(now, future) {
    const diffMs = future - now;
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    if (diffHrs > 0) return `CLOSES IN ${diffHrs}H ${diffMins}M`;
    return `CLOSES IN ${diffMins} MINS`;
}

function lockUI(timeOfDay) {
    const group = document.getElementById(`toggle-group-${timeOfDay}`);
    if (!group) return;
    
    group.parentElement.querySelector('.absolute')?.classList.remove('hidden'); 

    const btns = group.querySelectorAll('.meal-btn');
    btns.forEach(b => {
        b.classList.remove('interactive');
        const isActive = b.getAttribute('data-original') === 'true';
        
        if (isActive) {
            b.classList.add('opacity-100');
            b.classList.remove('active-scale', 'cursor-pointer');
        } else {
            b.className = "meal-btn flex-1 py-3.5 rounded-[14px] text-[11px] font-black tracking-widest flex items-center justify-center gap-1.5 bg-transparent border border-white/5 text-white/20 opacity-50 transition-all";
        }
    });
}
