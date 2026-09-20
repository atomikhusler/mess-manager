// manager/ui-stats.js
import { fetchMonthlyStats, fetchDirectory, fetchTransactions } from './manager-db.js';
import { showToast, refreshIcons, triggerHaptic } from '../core/ui-core.js';

let hiddenCardsPrefs = JSON.parse(localStorage.getItem('mm_stats_prefs') || '{}');
let activeWeekIndex = 0; 

export async function initStatsView() {
    const container = document.getElementById('view-stats');
    if (!container) return;

    if (container.innerHTML === '') {
        container.innerHTML = `
            <div class="mb-5 mt-2 px-2 flex justify-between items-end fade-in">
                <div>
                    <h2 class="text-[24px] font-black tracking-tight text-white flex items-center gap-2">
                        AI Assistant <i data-lucide="sparkles" class="w-5 h-5 text-telegram"></i>
                    </h2>
                    <p class="text-[11px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Predictive Engine</p>
                </div>
                <div class="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-2.5 py-1.5 rounded-[8px] border border-emerald-400/20 flex items-center gap-1.5 shadow-[0_0_15px_rgba(52,211,153,0.1)]">
                    <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> Live
                </div>
            </div>

            <div id="ai-insights-container" class="px-1 space-y-4 pb-28">
                <div class="text-center py-16 font-bold text-[12px] animate-pulse text-white/40 flex flex-col items-center justify-center gap-3">
                    <i data-lucide="cpu" class="w-8 h-8 text-white/20"></i>
                    Crunching advanced metrics...
                </div>
            </div>
        `;
    }

    loadStatsData();
}

async function loadStatsData() {
    const container = document.getElementById('ai-insights-container');
    const currentMonth = new Date().toLocaleDateString('en-CA').substring(0, 7); 

    const [dirRes, statsRes, txnRes] = await Promise.all([
        fetchDirectory(),
        fetchMonthlyStats(currentMonth),
        fetchTransactions(currentMonth)
    ]);

    if (!dirRes.success || !statsRes.success || !txnRes.success) {
        container.innerHTML = `<div class="text-center py-6 font-bold text-[12px] text-rose-500 bg-rose-500/10 rounded-[16px] border border-rose-500/20">Data Sync Failed. Please retry.</div>`;
        return;
    }

    // =========================================================================
    // 🧠 THE CORE CALCULATION ENGINE
    // =========================================================================
    const directory = dirRes.students;
    const logs = statsRes.logs;
    const txns = txnRes.transactions;
    const activeStudents = directory.filter(s => s.status === 'ACTIVE');
    const activeCount = activeStudents.length || 1; 
    
    // Temporal Logic
    const todayObj = new Date();
    todayObj.setHours(0,0,0,0);
    const todayStr = todayObj.toLocaleDateString('en-CA');
    const currentDay = todayObj.getDate();
    
    const year = parseInt(currentMonth.split('-')[0]);
    const month = parseInt(currentMonth.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysLeftInMonth = Math.max(0, daysInMonth - currentDay);

    const sevenDaysAgo = new Date(todayObj); sevenDaysAgo.setDate(todayObj.getDate() - 7);
    const fourteenDaysAgo = new Date(todayObj); fourteenDaysAgo.setDate(todayObj.getDate() - 14);

    // Financial Metrics
    let totalAdvances = 0, totalConsumables = 0, totalAssets = 0;
    let last7DaysExpense = 0, previous7DaysExpense = 0;
    const dailyExpensesMap = {};
    const itemPricingHistory = {}; 
    let advanceDates = []; 

    txns.forEach(t => {
        const amt = parseFloat(t.amount);
        if (t.txn_type === 'ADVANCE') {
            totalAdvances += amt;
            advanceDates.push(parseInt(t.txn_date.split('-')[2]));
        } else if (t.txn_type === 'EXPENSE') {
            if (t.description.startsWith('[ASSET]')) {
                totalAssets += amt;
            } else {
                totalConsumables += amt;
                if (!dailyExpensesMap[t.txn_date]) dailyExpensesMap[t.txn_date] = 0;
                dailyExpensesMap[t.txn_date] += amt;

                // Built-in Unit Price Calculator: Regex parses "Potato (50) - Note" or "Rice (25kg)"
                const match = t.description.match(/^([^(]+?)(?:\s*\((\d+(?:\.\d+)?)[a-zA-Z]*\))?/);
                if (match && match[2]) {
                    const itemName = match[1].trim().toLowerCase().replace('[asset]', '').trim();
                    const qty = parseFloat(match[2]);
                    if (qty > 0) {
                        if (!itemPricingHistory[itemName]) itemPricingHistory[itemName] = [];
                        itemPricingHistory[itemName].push({ date: t.txn_date, unitPrice: amt / qty });
                    }
                }

                // 7-Day Velocity Tracking
                const tDate = new Date(t.txn_date);
                if (tDate > sevenDaysAgo && tDate <= todayObj) last7DaysExpense += amt;
                else if (tDate > fourteenDaysAgo && tDate <= sevenDaysAgo) previous7DaysExpense += amt;
            }
        }
    });

    // Meal Metrics
    let mealsEatenSoFar = 0, mealsMissedSoFar = 0, mealsMissedLast7 = 0;
    let targetDayMeals = 0, targetDaySkips = 0;
    const currentDayOfWeek = todayObj.getDay(); 
    
    logs.forEach(l => { 
        let isEatenDay = l.day_meal !== 'OFF';
        let isEatenNight = l.night_meal !== 'OFF';
        
        if(isEatenDay) mealsEatenSoFar++; else mealsMissedSoFar++;
        if(isEatenNight) mealsEatenSoFar++; else mealsMissedSoFar++;
        
        const lDate = new Date(l.log_date);
        if (lDate > sevenDaysAgo && lDate <= todayObj) {
            if (!isEatenDay) mealsMissedLast7++;
            if (!isEatenNight) mealsMissedLast7++;
        }

        // AI Chef: Target Specific Day of the Week
        if (lDate.getDay() === currentDayOfWeek && lDate < todayObj) {
            targetDayMeals += 2;
            if (!isEatenDay) targetDaySkips++;
            if (!isEatenNight) targetDaySkips++;
        }
    });

    // --- COMPLEX PREDICTIVE MATH ---
    const operatingCapital = totalAdvances - (totalConsumables + totalAssets);
    const liveMealRate = mealsEatenSoFar > 0 ? (totalConsumables / mealsEatenSoFar) : 0;
    
    // Instead of raw month average, we use 7-Day Velocity to predict the future (Much more accurate)
    const dailyBurn7d = last7DaysExpense / 7; 
    const projectedRemainingExpense = dailyBurn7d * daysLeftInMonth;
    const projectedFinalExpense = totalConsumables + projectedRemainingExpense;

    // Project remaining meals based on historical skip rate
    const totalPossibleMealsSoFar = activeCount * 2 * currentDay;
    const globalSkipRate = totalPossibleMealsSoFar > 0 ? (mealsMissedSoFar / totalPossibleMealsSoFar) : 0;
    const expectedFutureMeals = activeCount * 2 * daysLeftInMonth * (1 - globalSkipRate);
    
    const projectedTotalMeals = mealsEatenSoFar + expectedFutureMeals;
    const projectedMealRate = projectedTotalMeals > 0 ? (projectedFinalExpense / projectedTotalMeals) : 0;

    let htmlBlocks = [];

    // --- REUSABLE UI CARD GENERATOR ---
    const generateCard = (id, icon, iconColor, title, statusTxt, statusColor, contentHtml) => {
        const isHidden = hiddenCardsPrefs[id] === true;
        const eyeIcon = isHidden ? 'eye-off' : 'eye';
        const cardState = isHidden ? 'opacity-40 grayscale scale-[0.98]' : 'opacity-100 scale-100';

        return `
            <div class="insight-card bg-[#09090b] border border-white/[0.08] rounded-[24px] overflow-hidden shadow-lg transition-all duration-500 ease-out ${cardState}" id="card-${id}">
                <div class="px-4 py-3.5 flex justify-between items-center cursor-pointer hover:bg-white/[0.02]" id="toggle-${id}">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center ${iconColor} shadow-inner shrink-0 border border-white/5">
                            <i data-lucide="${icon}" class="w-4 h-4"></i>
                        </div>
                        <div>
                            <div class="text-[13px] font-black text-white tracking-tight leading-none">${title}</div>
                            <div class="text-[9px] font-black uppercase tracking-widest ${statusColor} mt-1">${statusTxt}</div>
                        </div>
                    </div>
                    <button class="btn-toggle-eye w-8 h-8 rounded-full bg-transparent flex items-center justify-center text-white/30 active-scale hover:bg-white/10 hover:text-white transition-colors" data-card-id="${id}">
                        <i data-lucide="${eyeIcon}" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                </div>
                <div class="p-4 bg-transparent border-t border-white/[0.02]">
                    ${contentHtml}
                </div>
            </div>
        `;
    };

    // =========================================================================
    // MODULE 1: BUDGET FORECAST (Donut Chart)
    // =========================================================================
    const safeBudget = totalAdvances > 0 ? totalAdvances : 1; 
    const burnPct = Math.min((totalConsumables / safeBudget) * 100, 100);
    const conicColor = burnPct > 95 ? '#f43f5e' : (burnPct > 80 ? '#f59e0b' : '#34d399');
    
    // Use 7-day velocity to calculate cash survival, NOT whole-month average.
    const daysOfCashLeft = dailyBurn7d > 0 ? Math.floor(operatingCapital / dailyBurn7d) : 99;
    const isDeficitRisk = daysOfCashLeft < daysLeftInMonth;
    const crossoverStatus = isDeficitRisk ? 'Running Out' : 'Safe';

    const mod1Html = `
        <div class="flex items-center gap-5 mb-2">
            <div class="relative w-20 h-20 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] shrink-0 transition-all duration-1000" 
                 style="background: conic-gradient(${conicColor} ${burnPct}%, rgba(255,255,255,0.05) 0);">
                <div class="w-[64px] h-[64px] bg-[#09090b] rounded-full flex flex-col items-center justify-center shadow-inner">
                    <div class="text-[14px] font-black text-white tracking-tighter leading-none">${Math.round(burnPct)}%</div>
                    <div class="text-[8px] font-black uppercase tracking-widest text-white/40 mt-1">Spent</div>
                </div>
            </div>
            <div class="flex-1">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Cash Survival</div>
                <div class="text-xl font-black font-mono tracking-tight ${isDeficitRisk ? 'text-rose-400' : 'text-emerald-400'}">${daysOfCashLeft} Days Left</div>
                <div class="text-[11px] font-medium text-white/70 leading-snug mt-2">
                    ${isDeficitRisk ? `You will run out of money before the month ends. Ask for dues or spend less.` : `You have enough cash to comfortably finish the month.`}
                </div>
            </div>
        </div>
    `;
    htmlBlocks.push(generateCard('m1', 'pie-chart', isDeficitRisk ? 'text-rose-400' : 'text-emerald-400', 'Budget Forecast', crossoverStatus, isDeficitRisk ? 'text-rose-400' : 'text-emerald-400', mod1Html));

    // =========================================================================
    // MODULE 2: MEAL RATE PREDICTION (Trajectory)
    // =========================================================================
    const isInflating = liveMealRate < projectedMealRate; 

    const mod2Html = `
        <div class="flex items-center justify-between mb-4">
            <div class="text-center flex-1">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-0.5">Current Rate</div>
                <div class="text-[20px] font-black font-mono text-white">₹${liveMealRate.toFixed(2)}</div>
            </div>
            <div class="w-8 flex justify-center">
                <i data-lucide="${isInflating ? 'move-right' : 'move-left'}" class="w-5 h-5 ${isInflating ? 'text-rose-400' : 'text-emerald-400'}"></i>
            </div>
            <div class="text-center flex-1">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-0.5">Month End Prediction</div>
                <div class="text-[20px] font-black font-mono text-white/60">₹${projectedMealRate.toFixed(2)}</div>
            </div>
        </div>
        <div class="text-[11px] font-medium text-white/70 text-center leading-relaxed border-t border-white/[0.04] pt-3">
            ${isInflating ? 'Based on recent spending, your student bill is going to be <b>higher</b> than usual by month-end.' : 'Great job! You are keeping the meal costs <b>lower</b> than the current average.'}
        </div>
    `;
    htmlBlocks.push(generateCard('m2', 'scale', isInflating ? 'text-rose-400' : 'text-emerald-400', 'Meal Rate Prediction', 'Cost Trend', 'text-white/40', mod2Html));

    // =========================================================================
    // MODULE 3: TODAY'S COOKING GUIDE (AI Chef)
    // =========================================================================
    const daysName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDayOfWeek];
    const targetSkipRate = targetDayMeals > 0 ? (targetDaySkips / targetDayMeals) : 0;
    const recommendedPlates = Math.round(activeCount * (1 - targetSkipRate));
    const foodSavedPct = Math.round(targetSkipRate * 100);

    const mod3Html = `
        <div class="flex justify-between items-center bg-[#111113]/50 border border-white/[0.04] p-4 rounded-[16px] mb-3">
            <div class="text-center flex-1 border-r border-white/[0.04]">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40">Total Students</div>
                <div class="text-2xl font-black mt-1 text-white">${activeCount}</div>
            </div>
            <div class="text-center flex-1">
                <div class="text-[10px] font-black uppercase tracking-widest text-amber-500">Cook For</div>
                <div class="text-2xl font-black mt-1 text-amber-500">${recommendedPlates}</div>
            </div>
        </div>
        <div class="text-[11px] font-medium text-white/70 leading-relaxed">
            Historically, <b>${foodSavedPct}%</b> of students skip their meals on <b>${daysName}s</b>. Cook for <b>${recommendedPlates} people</b> today to avoid wasting food.
        </div>
    `;
    htmlBlocks.push(generateCard('m3', 'chef-hat', 'text-amber-500', 'Today\'s Cooking Guide', `Suggestion`, 'text-amber-500', mod3Html));

    // =========================================================================
    // MODULE 4: VENDOR PRICE INDEX (Inbuilt Unit Calculator)
    // =========================================================================
    let anomalyHtml = `<div class="text-[12px] font-bold text-emerald-400 flex items-center gap-2 py-2"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Vendor prices look normal.</div>`;
    let anomaliesFound = 0;
    const vendorAnomalies = [];

    Object.keys(itemPricingHistory).forEach(item => {
        const prices = itemPricingHistory[item];
        if (prices.length > 2) {
            const recent = prices[prices.length - 1];
            // Calculate historical mean excluding the most recent purchase
            const priorPrices = prices.slice(0, prices.length - 1).map(p => p.unitPrice);
            const mean = priorPrices.reduce((a,b)=>a+b,0) / priorPrices.length;
            
            if (recent.unitPrice > mean * 1.2) { // 20% spike
                const spikePct = Math.round(((recent.unitPrice - mean) / mean) * 100);
                vendorAnomalies.push({ item, spikePct, recentPrice: recent.unitPrice, meanPrice: mean });
                anomaliesFound++;
            }
        }
    });

    if (anomaliesFound > 0) {
        anomalyHtml = `<div class="space-y-3">` + vendorAnomalies.map(a => `
            <div class="flex items-center justify-between border-l-2 border-rose-500 pl-3 py-1">
                <div>
                    <div class="text-[13px] font-black text-white capitalize">${a.item}</div>
                    <div class="text-[10px] font-bold text-rose-400 mt-0.5"><i data-lucide="alert-triangle" class="w-3 h-3 inline relative -top-[1px]"></i> Paid ${a.spikePct}% extra today</div>
                </div>
                <div class="text-right">
                    <div class="text-[13px] font-black font-mono text-white">₹${a.recentPrice.toFixed(1)}/unit</div>
                    <div class="text-[9px] font-black uppercase tracking-widest text-white/40 mt-1">Usually: ₹${a.meanPrice.toFixed(1)}</div>
                </div>
            </div>
        `).join('') + `</div>`;
    }

    htmlBlocks.push(generateCard('m4', 'shopping-cart', anomaliesFound ? 'text-rose-400' : 'text-emerald-400', 'Price Spike Alert', anomaliesFound ? `${anomaliesFound} Warnings` : 'All Good', anomaliesFound ? 'text-rose-400' : 'text-emerald-400', anomalyHtml));

    // =========================================================================
    // MODULE 5: WEEKLY SPENDING TRENDS (Pagination Graph)
    // =========================================================================
    const w1 = [1, 7], w2 = [8, 14], w3 = [15, 21], w4 = [22, daysInMonth];
    const weeks = [w1, w2, w3, w4];
    
    let currentWkIndex = weeks.findIndex(w => currentDay >= w[0] && currentDay <= w[1]);
    if (currentWkIndex === -1) currentWkIndex = 3;
    activeWeekIndex = currentWkIndex;

    const buildVelocityHTML = () => {
        const bounds = weeks[activeWeekIndex];
        const isFutureWeek = bounds[0] > currentDay;
        
        let wExp = 0, prevWExp = 0;
        Object.keys(dailyExpensesMap).forEach(d => {
            const dayNum = parseInt(d.split('-')[2]);
            if (dayNum >= bounds[0] && dayNum <= bounds[1]) wExp += dailyExpensesMap[d];
            if (activeWeekIndex > 0) {
                const prevBounds = weeks[activeWeekIndex - 1];
                if (dayNum >= prevBounds[0] && dayNum <= prevBounds[1]) prevWExp += dailyExpensesMap[d];
            }
        });

        let accelHtml = `<span class="text-white/40">Normal</span>`;
        if (activeWeekIndex > 0 && prevWExp > 0 && !isFutureWeek) {
            const shift = ((wExp - prevWExp) / prevWExp) * 100;
            if (shift > 5) accelHtml = `<span class="text-rose-400"><i data-lucide="trending-up" class="w-3 h-3 inline"></i> Spent ${Math.round(shift)}% More</span>`;
            else if (shift < -5) accelHtml = `<span class="text-emerald-400"><i data-lucide="trending-down" class="w-3 h-3 inline"></i> Saved ${Math.round(Math.abs(shift))}%</span>`;
        }

        let barsHtml = '';
        for (let i = bounds[0]; i <= bounds[1]; i++) {
            const dStr = `${currentMonth}-${String(i).padStart(2, '0')}`;
            const eVal = dailyExpensesMap[dStr] || 0;
            const hPct = isFutureWeek ? 0 : Math.min((eVal / (dailyBurn7d * 2 || 1)) * 100, 100);
            
            barsHtml += `
                <div class="flex flex-col items-center flex-1 h-full justify-end gap-1 group relative">
                    <div class="absolute -top-5 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-black text-[9px] font-black px-1.5 py-0.5 rounded-[4px] z-10 pointer-events-none shadow-lg">₹${eVal}</div>
                    <div class="w-full max-w-[12px] bg-white/5 rounded-t-sm relative flex items-end justify-center hover:bg-white/10" style="height: 100%;">
                        <div class="w-full ${isFutureWeek ? 'bg-transparent border border-dashed border-white/20' : 'bg-telegram shadow-[0_0_10px_rgba(51,144,236,0.3)]'} rounded-t-sm transition-all duration-300" style="height: ${hPct}%;"></div>
                    </div>
                    <div class="text-[8px] font-black text-white/30 tracking-wider">${i}</div>
                </div>
            `;
        }

        return `
            <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-2 bg-white/[0.04] rounded-[10px] p-1 border border-white/[0.05]">
                    <button class="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white active-scale rounded-md hover:bg-white/10" onclick="window.__chkWk(-1)"><i data-lucide="chevron-left" class="w-4 h-4 pointer-events-none"></i></button>
                    <div class="text-[11px] font-black font-mono tracking-widest text-white">WK ${activeWeekIndex + 1}</div>
                    <button class="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white active-scale rounded-md hover:bg-white/10" onclick="window.__chkWk(1)"><i data-lucide="chevron-right" class="w-4 h-4 pointer-events-none"></i></button>
                </div>
                <div class="text-[10px] font-black uppercase tracking-widest">${accelHtml}</div>
            </div>
            <div class="h-24 flex items-end justify-between gap-1">${barsHtml}</div>
        `;
    };
    
    window.__chkWk = (dir) => {
        triggerHaptic('light');
        let newIdx = activeWeekIndex + dir;
        if (newIdx >= 0 && newIdx <= 3) {
            activeWeekIndex = newIdx;
            document.getElementById('dyn-vel-chart').innerHTML = buildVelocityHTML();
            refreshIcons();
        }
    };

    htmlBlocks.push(generateCard('m5', 'bar-chart-2', 'text-telegram', 'Weekly Spending Trends', 'Compare Weeks', 'text-telegram', `<div id="dyn-vel-chart">${buildVelocityHTML()}</div>`));

    // =========================================================================
    // MODULE 6: SMART DEBT COLLECTION (Who to ask for money)
    // =========================================================================
    let totalDebt = 0;
    const defaulters = [];

    directory.forEach(s => {
        let sMeals = 0, sAdv = 0;
        logs.forEach(l => { if (l.member_id === s.id) { if (l.day_meal !== 'OFF') sMeals++; if (l.night_meal !== 'OFF') sMeals++; } });
        txns.forEach(t => { if (t.member_id === s.id && t.txn_type === 'ADVANCE') sAdv += parseFloat(t.amount); });
        
        const balance = (sMeals * liveMealRate) - sAdv;
        if (balance > 0) {
            totalDebt += balance;
            defaulters.push({ name: s.name.split(' ')[0], debt: balance });
        }
    });

    defaulters.sort((a,b) => b.debt - a.debt); 
    const top3 = defaulters.slice(0, 3);
    
    let debtHtml = `<div class="text-[12px] font-bold text-emerald-400 text-center py-2 flex items-center justify-center gap-2"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Everyone has paid!</div>`;
    
    if (totalDebt > 0) {
        const top3Sum = top3.reduce((a,b) => a + b.debt, 0);
        const top3Pct = Math.round((top3Sum / totalDebt) * 100);
        const names = top3.map(d => `<b>${d.name}</b>`).join(', ');
        
        debtHtml = `
            <div class="text-[11px] font-medium text-white/70 leading-relaxed mb-4 mt-1 border-b border-white/[0.04] pb-4">
                Just asking ${names} to pay will recover <b>₹${Math.round(top3Sum).toLocaleString('en-IN')} (${top3Pct}%)</b> of the missing cash.
            </div>
            <div class="space-y-3">
                ${top3.map((d, i) => `
                    <div>
                        <div class="flex justify-between items-center mb-1.5">
                            <span class="text-[12px] font-black text-white tracking-tight">${i + 1}.${d.name}</span>
                            <span class="text-[13px] font-black font-mono text-rose-400">₹${Math.round(d.debt).toLocaleString('en-IN')}</span>
                        </div>
                        <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div class="h-full bg-rose-500/80 rounded-full" style="width: ${(d.debt / totalDebt) * 100}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    htmlBlocks.push(generateCard('m6', 'target', 'text-rose-400', 'Who To Ask For Money', totalDebt > 0 ? 'Pending Dues' : 'Cleared', 'text-rose-400', debtHtml));

    // =========================================================================
    // MODULE 7: FIXED COSTS VS FOOD (Headroom)
    // =========================================================================
    const floorFee = activeCount > 0 ? (totalAssets / activeCount) : 0;
    const foodRatio = totalAdvances > 0 ? (totalConsumables / totalAdvances) * 100 : 0;
    const assetRatio = totalAdvances > 0 ? (totalAssets / totalAdvances) * 100 : 0;

    const mod7Html = `
        <div class="h-3 w-full bg-white/5 rounded-full overflow-hidden flex mb-4 relative">
            <div class="h-full bg-telegram transition-all" style="width: ${foodRatio}%"></div>
            <div class="h-full bg-purple-500 transition-all" style="width: ${assetRatio}%"></div>
        </div>
        <div class="flex justify-between items-end mb-3">
            <div>
                <div class="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1 flex items-center gap-1.5"><div class="w-2 h-2 bg-purple-500 rounded-sm"></div> Assets Paid</div>
                <div class="text-lg font-black font-mono text-white tracking-tight">₹${totalAssets.toLocaleString('en-IN')}</div>
            </div>
            <div class="text-right">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Fixed Cost Per Person</div>
                <div class="text-sm font-black font-mono text-white/60">₹${Math.round(floorFee).toLocaleString('en-IN')}</div>
            </div>
        </div>
        <div class="text-[11px] font-medium text-white/70 leading-relaxed border-t border-white/[0.04] pt-3">
            Assets (like gas or repairs) take up <b>₹${Math.round(floorFee)}</b> of every student's bill. This doesn't change even if they skip meals.
        </div>
    `;
    htmlBlocks.push(generateCard('m7', 'layers', 'text-purple-400', 'Fixed vs Food Costs', 'Overhead Info', 'text-purple-400', mod7Html));

    // =========================================================================
    // MODULE 8: CASH IN DRAWER (Liquidity)
    // =========================================================================
    const isLiquidityCrisis = operatingCapital < (dailyBurn7d * 3); 
    
    const mod8Html = `
        <div class="flex justify-between items-end mb-3">
            <div>
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Physical Cash Remaining</div>
                <div class="text-3xl font-black font-mono tracking-tighter ${isLiquidityCrisis ? 'text-rose-500 animate-pulse' : 'text-white'}">₹${operatingCapital.toLocaleString('en-IN')}</div>
            </div>
        </div>
        <div class="text-[11px] font-medium text-white/70 leading-relaxed border-t border-white/[0.04] pt-3">
            ${isLiquidityCrisis ? `<b class="text-rose-500">Low Cash:</b> You do not have enough physical cash to buy groceries for the next 3 days based on current burn.` : `You have enough physical cash in hand to pay vendors immediately.`}
        </div>
    `;
    htmlBlocks.push(generateCard('m8', 'wallet', isLiquidityCrisis ? 'text-rose-500' : 'text-emerald-400', 'Cash In Drawer', isLiquidityCrisis ? 'Critical' : 'Stable', isLiquidityCrisis ? 'text-rose-500' : 'text-emerald-400', mod8Html));

    // =========================================================================
    // MODULE 9: DEFICIT WARNING (Surcharge Predictor)
    // =========================================================================
    let surchargeHtml = `<div class="text-[12px] font-bold text-emerald-400 text-center py-2 flex items-center justify-center gap-2"><i data-lucide="check-circle-2" class="w-4 h-4"></i> No extra collection needed right now.</div>`;
    const projectedShortfall = projectedFinalExpense - totalAdvances;
    
    if (projectedShortfall > 0 && currentDay > 10) {
        const surchargePerHead = projectedShortfall / activeCount;
        surchargeHtml = `
            <div class="bg-rose-500/10 border border-rose-500/20 p-4 rounded-[16px] shadow-sm mb-3">
                <div class="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-1">Expected Month-End Shortfall</div>
                <div class="text-2xl font-black font-mono tracking-tight text-rose-500">₹${Math.round(projectedShortfall).toLocaleString('en-IN')}</div>
            </div>
            <div class="text-[11px] font-bold text-white/80 leading-relaxed border-t border-rose-500/20 pt-3">
                Collect an extra <b>₹${Math.ceil(surchargePerHead).toLocaleString('en-IN')} from each student</b> today to make sure you don't run out of money by the end of the month.
            </div>
        `;
    }
    htmlBlocks.push(generateCard('m9', 'alert-octagon', projectedShortfall > 0 ? 'text-rose-500' : 'text-emerald-400', 'Deficit Warning', projectedShortfall > 0 ? 'Action Needed' : 'Safe', projectedShortfall > 0 ? 'text-rose-500' : 'text-emerald-400', surchargeHtml));

    // =========================================================================
    // MODULE 10: MESS HEALTH SCORE & GHOST FINDER
    // =========================================================================
    let ghostCount = 0;
    activeStudents.forEach(student => {
        let sMealsLast7Days = 0;
        logs.forEach(log => {
            if (log.member_id === student.id && new Date(log.log_date) > sevenDaysAgo) {
                if (log.day_meal !== 'OFF') sMealsLast7Days++;
                if (log.night_meal !== 'OFF') sMealsLast7Days++;
            }
        });
        if (sMealsLast7Days === 0) ghostCount++;
    });

    let healthScore = 100 - ((ghostCount / activeCount) * 100); 
    const scoreColor = healthScore > 80 ? 'text-emerald-400' : (healthScore > 50 ? 'text-amber-500' : 'text-rose-500');

    const mod10Html = `
        <div class="flex items-center justify-between mb-4">
            <div>
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-0.5">Overall Status</div>
                <div class="text-3xl font-black font-mono tracking-tighter ${scoreColor}">${Math.round(healthScore)}/100</div>
            </div>
            <div class="text-right">
                <div class="text-[12px] font-black text-white">${activeCount} <span class="text-white/40 text-[10px] uppercase">Eating</span></div>
                <div class="text-[12px] font-black text-white/40">${ghostCount} <span class="text-white/20 text-[10px] uppercase">Absent</span></div>
            </div>
        </div>
        ${ghostCount > 0 ? `
            <div class="bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 rounded-[12px] flex gap-2 shadow-sm mt-3">
                <i data-lucide="ghost" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5"></i>
                <div class="text-[11px] font-bold text-amber-500/90 leading-tight"><b>${ghostCount} active students</b> haven't eaten in a week. Suspend them so they don't mess up your math.</div>
            </div>
        ` : `
            <div class="text-[11px] font-bold text-emerald-400/80 bg-emerald-500/5 px-3 py-2.5 rounded-[12px] border border-emerald-500/10 mt-3 flex gap-2 items-center"><i data-lucide="check-circle-2" class="w-4 h-4 shrink-0"></i> Everyone is active. Your mess is running smoothly!</div>
        `}
    `;
    htmlBlocks.push(generateCard('m10', 'activity', scoreColor, 'Mess Health Score', 'Student Activity', scoreColor, mod10Html));

    // --- RENDER & ATTACH LISTENERS ---
    container.innerHTML = htmlBlocks.join('');
    refreshIcons();
    attachEyeToggleListeners();
}

function attachEyeToggleListeners() {
    const container = document.getElementById('ai-insights-container');
    
    container.querySelectorAll('.btn-toggle-eye').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerHaptic('light');
            
            const cardId = btn.getAttribute('data-card-id');
            const card = document.getElementById(`card-${cardId}`);
            const isCurrentlyHidden = hiddenCardsPrefs[cardId] === true;
            
            if (isCurrentlyHidden) {
                hiddenCardsPrefs[cardId] = false;
                card.classList.remove('opacity-50', 'grayscale', 'scale-[0.98]');
                card.classList.add('opacity-100', 'scale-100');
                btn.innerHTML = `<i data-lucide="eye" class="w-4 h-4 pointer-events-none"></i>`;
            } else {
                hiddenCardsPrefs[cardId] = true;
                card.classList.add('opacity-50', 'grayscale', 'scale-[0.98]');
                card.classList.remove('opacity-100', 'scale-100');
                btn.innerHTML = `<i data-lucide="eye-off" class="w-4 h-4 pointer-events-none"></i>`;
            }
            
            localStorage.setItem('mm_stats_prefs', JSON.stringify(hiddenCardsPrefs));
            refreshIcons();
        });
    });
}
