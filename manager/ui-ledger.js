// manager/ui-ledger.js
import { fetchTransactions, addTransaction, updateTransaction, deleteTransaction, fetchMonthlyStats, fetchDirectory } from './manager-db.js';
import { showToast, showModal, refreshIcons, triggerHaptic } from '../core/ui-core.js';

let currentMonth = new Date().toLocaleDateString('en-CA').substring(0, 7); 
let activeTab = 'EXPENSE'; 
let expenseCategory = 'CONSUMABLE'; 
let historyFilter = 'ALL'; 
let directoryCache = [];
let allTxnsCache = [];
let currentMealsCount = 0; 

// Smart Engine Variables
let dynamicThreshold = 1500; 
let averageSpend = 0;
let editingTxnId = null;
let selectedDate = new Date().toLocaleDateString('en-CA');
let predictiveChips = [];

export async function initLedgerView() {
    const container = document.getElementById('view-ledger');
    if (!container) return;

    if (container.innerHTML === '') {
        container.innerHTML = `
            <div class="mb-5 flex justify-between items-center px-2">
                <input type="month" id="ledger-month" class="bg-transparent text-[22px] font-black tracking-tight outline-none text-white" value="${currentMonth}">
            </div>
            
            <div id="ledger-kpis" class="grid grid-cols-2 gap-3 mb-6 px-1 fade-in"></div>

            <div class="flex bg-white/[0.04] border border-white/[0.08] rounded-full p-1 mx-1 mb-5 relative hardware-accelerated shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div id="tab-highlighter" class="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-white rounded-full transition-transform duration-300 ease-out shadow-sm pointer-events-none"></div>
                <button id="tab-expense" class="relative z-10 flex-1 py-2.5 rounded-full text-[12px] font-black transition-colors text-black">Log Expense</button>
                <button id="tab-advance" class="relative z-10 flex-1 py-2.5 rounded-full text-[12px] font-black transition-colors text-white/50">Log Advance</button>
            </div>

            <div id="ledger-form" class="bg-[#09090b] border border-white/[0.08] rounded-[24px] p-5 mb-6 mx-1 shadow-sm fade-in relative overflow-hidden"></div>

            <div class="flex items-center justify-between px-2 mb-4 mt-6">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40">Ledger History</div>
                <div class="flex gap-1.5 bg-white/[0.03] p-1 rounded-lg border border-white/[0.05]">
                    <button class="filter-btn active-scale text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors bg-white/20 text-white shadow-sm" data-filter="ALL">All</button>
                    <button class="filter-btn active-scale text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors bg-transparent text-white/40" data-filter="EXPENSE">Exp</button>
                    <button class="filter-btn active-scale text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors bg-transparent text-white/40" data-filter="ADVANCE">Adv</button>
                </div>
            </div>

            <div id="ledger-history" class="px-1 pb-4 flex flex-col gap-2"></div>
        `;

        const dirRes = await fetchDirectory();
        if (dirRes.success) directoryCache = dirRes.students;

        document.getElementById('ledger-month').addEventListener('change', (e) => {
            currentMonth = e.target.value;
            loadLedgerData();
        });

        document.getElementById('tab-expense').addEventListener('click', () => switchTab('EXPENSE'));
        document.getElementById('tab-advance').addEventListener('click', () => switchTab('ADVANCE'));
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                triggerHaptic('light');
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-white/20', 'text-white', 'shadow-sm');
                    b.classList.add('bg-transparent', 'text-white/40');
                });
                const activeBtn = e.currentTarget;
                activeBtn.classList.remove('bg-transparent', 'text-white/40');
                activeBtn.classList.add('bg-white/20', 'text-white', 'shadow-sm');
                
                historyFilter = activeBtn.getAttribute('data-filter');
                renderHistory();
            });
        });

        attachHistoryDelegation();
        renderInputForm();
    }
    
    loadLedgerData();
}

function extractPredictiveChips() {
    const counts = {};
    allTxnsCache.forEach(t => {
        if(t.txn_type === 'EXPENSE' && !t.description.startsWith('[ASSET]')) {
            const rawDesc = t.description.split('|::|')[0].trim();
            let name = rawDesc.split(' - ')[0].replace(/\(.*\)/g, '').trim();
            if(name.length > 2) counts[name] = (counts[name] || 0) + 1;
        }
    });
    predictiveChips = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
}

function switchTab(tabName) {
    if (activeTab === tabName && !editingTxnId) return;
    triggerHaptic('light');
    
    activeTab = tabName;
    const btnExp = document.getElementById('tab-expense');
    const btnAdv = document.getElementById('tab-advance');
    const highlighter = document.getElementById('tab-highlighter');

    if (tabName === 'EXPENSE') {
        highlighter.style.transform = 'translateX(0)';
        btnExp.classList.replace('text-white/50', 'text-black');
        btnAdv.classList.replace('text-black', 'text-white/50');
    } else {
        highlighter.style.transform = 'translateX(100%)';
        btnAdv.classList.replace('text-white/50', 'text-black');
        btnExp.classList.replace('text-black', 'text-white/50');
    }
    renderInputForm();
}

function renderInputForm() {
    const form = document.getElementById('ledger-form');
    const isExpense = activeTab === 'EXPENSE';
    
    const btnText = editingTxnId ? 'Update Record' : (isExpense ? 'Deduct Funds' : 'Add Advance');
    const btnColor = editingTxnId ? 'bg-telegram text-white' : 'bg-white text-black shadow-white/20';
    const iconStr = editingTxnId ? 'check' : (isExpense ? 'arrow-up-right' : 'arrow-down-left');
    
    let cancelEditBtn = editingTxnId ? `<button id="btn-cancel-edit" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center active-scale border border-rose-500/20 shadow-lg z-20"><i data-lucide="x" class="w-4 h-4 pointer-events-none"></i></button>` : '';

    let chipsHtml = '';
    if (isExpense && !editingTxnId && predictiveChips.length > 0) {
        chipsHtml = `<div class="flex gap-2 mb-5 overflow-x-auto disable-scrollbars pb-1">` + 
            predictiveChips.map(c => `<button class="chip-btn shrink-0 px-3 py-1.5 rounded-[8px] bg-white/[0.03] border border-white/10 text-[10px] font-bold text-white/70 active-scale hover:text-white hover:bg-white/10 transition-colors shadow-sm"><span>+</span> ${c}</button>`).join('') + 
            `</div>`;
    }

    if (isExpense) {
        form.innerHTML = `
            ${cancelEditBtn}
            ${chipsHtml}
            <div class="flex gap-2 mb-5 ${editingTxnId ? 'pr-10' : ''}">
                <button id="cat-consumable" class="flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest transition-all bg-white/10 text-white border border-white/10">Consumables</button>
                <button id="cat-asset" class="flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest transition-all bg-transparent text-white/30 border border-transparent">Fixed Asset</button>
            </div>
            
            <div class="grid grid-cols-[1fr_90px] gap-3 mb-4">
                <input type="text" id="txn-item" autocomplete="off" placeholder="Item Name (e.g. Rice)" class="w-full bg-transparent text-[15px] font-bold outline-none border-b border-white/10 py-2 text-white placeholder-white/30 focus:border-telegram/50 transition-colors">
                
                <div class="flex bg-transparent border-b border-white/10 focus-within:border-telegram/50 transition-colors">
                    <input type="text" inputmode="decimal" id="txn-qty" autocomplete="off" placeholder="Qty" class="w-full bg-transparent text-[15px] font-bold outline-none py-2 text-center text-white placeholder-white/30">
                    <select id="txn-unit" class="bg-transparent text-[11px] font-bold text-white/50 outline-none pr-1 cursor-pointer appearance-none text-center">
                        <option value="kg" class="bg-[#111] text-white">kg</option>
                        <option value="g" class="bg-[#111] text-white">g</option>
                        <option value="L" class="bg-[#111] text-white">L</option>
                        <option value="ml" class="bg-[#111] text-white">ml</option>
                        <option value="pc" class="bg-[#111] text-white">pc</option>
                        <option value="pkt" class="bg-[#111] text-white">pkt</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-5">
                <div class="flex items-center border-b border-white/10 py-1 focus-within:border-telegram/50 transition-colors">
                    <span class="text-xl font-black mr-1 text-white/30">₹</span>
                    <input type="text" inputmode="decimal" pattern="[0-9]*" id="txn-amount" placeholder="0.00" class="w-full bg-transparent text-2xl font-black outline-none text-white placeholder-white/20 font-mono">
                </div>
                <div class="flex flex-col justify-end">
                    <input type="date" id="txn-date" class="w-full bg-transparent text-[12px] font-bold outline-none border-b border-white/10 py-2 text-telegram focus:border-telegram/50 transition-colors" value="${selectedDate}">
                </div>
            </div>

            <input type="text" id="txn-note" autocomplete="off" placeholder="Optional Note" class="w-full bg-transparent text-[13px] font-semibold outline-none border-b border-white/10 py-2.5 mb-6 text-white placeholder-white/30 focus:border-telegram/50 transition-colors">
            
            <button id="btn-save-txn" class="ripple-btn w-full py-4 rounded-[16px] font-black text-[14px] active-scale shadow-lg flex items-center justify-center gap-2 transition-transform ${btnColor}">
                <i data-lucide="${iconStr}" class="w-4 h-4 pointer-events-none"></i> ${btnText}
            </button>
        `;

        const catCon = document.getElementById('cat-consumable');
        const catAst = document.getElementById('cat-asset');
        const updateCatUI = (cat) => {
            expenseCategory = cat;
            if (cat === 'CONSUMABLE') {
                catCon.className = "flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest transition-all bg-white/10 text-white border border-white/10";
                catAst.className = "flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest transition-all bg-transparent text-white/30 border border-transparent";
            } else {
                catAst.className = "flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest transition-all bg-telegram/10 text-telegram border border-telegram/20";
                catCon.className = "flex-1 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest transition-all bg-transparent text-white/30 border border-transparent";
            }
        };

        updateCatUI(expenseCategory);
        catCon.addEventListener('click', () => { triggerHaptic('light'); updateCatUI('CONSUMABLE'); });
        catAst.addEventListener('click', () => { triggerHaptic('light'); updateCatUI('ASSET'); });

        document.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                triggerHaptic('light');
                document.getElementById('txn-item').value = e.currentTarget.innerText.replace('+ ', '');
                document.getElementById('txn-amount').focus();
            });
        });

        // Smart Integrity: Strip decimals if pc or pkt is selected
        const enforceQtyRules = () => {
            const qtyInput = document.getElementById('txn-qty');
            const unit = document.getElementById('txn-unit').value;
            let val = qtyInput.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
            
            if (['pc', 'pkt'].includes(unit) && val.includes('.')) {
                val = val.split('.')[0]; 
            }
            qtyInput.value = val;
        };

        document.getElementById('txn-qty').addEventListener('input', enforceQtyRules);
        document.getElementById('txn-unit').addEventListener('change', enforceQtyRules);

    } else {
        const options = directoryCache.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        form.innerHTML = `
            ${cancelEditBtn}
            <select id="txn-student" class="w-full bg-transparent text-[15px] font-bold outline-none border-b border-white/10 py-3 mb-5 text-white focus:border-telegram/50 transition-colors appearance-none ${editingTxnId ? 'pr-10' : ''}">
                <option value="" disabled selected class="bg-black text-white/50">Select Student...</option>
                ${options.replace(/<option/g, '<option class="bg-[#111] text-white"')}
            </select>
            
            <div class="grid grid-cols-2 gap-4 mb-5">
                <div class="flex items-center border-b border-white/10 py-1 focus-within:border-telegram/50 transition-colors">
                    <span class="text-xl font-black mr-1 text-white/30">₹</span>
                    <input type="text" inputmode="decimal" pattern="[0-9]*" id="txn-amount" placeholder="0.00" class="w-full bg-transparent text-2xl font-black outline-none text-emerald-400 placeholder-white/20 font-mono">
                </div>
                <div class="flex flex-col justify-end">
                    <input type="date" id="txn-date" class="w-full bg-transparent text-[12px] font-bold outline-none border-b border-white/10 py-2 text-telegram focus:border-telegram/50 transition-colors" value="${selectedDate}">
                </div>
            </div>

            <input type="text" id="txn-note" autocomplete="off" placeholder="Note (e.g. PhonePe)" class="w-full bg-transparent text-[13px] font-semibold outline-none border-b border-white/10 py-2.5 mb-6 text-white placeholder-white/30 focus:border-telegram/50 transition-colors">
            
            <button id="btn-save-txn" class="ripple-btn w-full py-4 rounded-[16px] font-black text-[14px] active-scale shadow-lg flex items-center justify-center gap-2 transition-transform ${btnColor}">
                <i data-lucide="${iconStr}" class="w-4 h-4 pointer-events-none"></i> ${btnText}
            </button>
        `;
    }
    refreshIcons();

    if (document.getElementById('btn-cancel-edit')) {
        document.getElementById('btn-cancel-edit').addEventListener('click', () => {
            triggerHaptic('light');
            editingTxnId = null;
            expenseCategory = 'CONSUMABLE';
            selectedDate = new Date().toLocaleDateString('en-CA');
            renderInputForm();
        });
    }

    document.getElementById('txn-amount').addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    });

    document.getElementById('btn-save-txn').addEventListener('click', handlePreSaveChecks);
}

// --- INTELLIGENT ANOMALY DETECTION ---
function handlePreSaveChecks() {
    const amountRaw = document.getElementById('txn-amount').value;
    const amountVal = parseFloat(amountRaw);
    
    if (!amountRaw || amountVal <= 0) return showToast("Enter a valid amount.", "error");

    if (!editingTxnId && activeTab === 'EXPENSE' && expenseCategory === 'CONSUMABLE') {
        if (amountVal > 500 && amountVal > dynamicThreshold) {
            triggerHaptic('heavy');
            showModal({
                title: "Just Checking!",
                message: `Whoa, <b>₹${amountVal.toLocaleString('en-IN')}</b> for daily consumables?<br><br>You usually spend around <b>₹${Math.round(averageSpend).toLocaleString('en-IN')}</b>. Is this a typo, or did you mean to log a Fixed Asset?`,
                type: "danger",
                confirmText: "Yes, Log It",
                onConfirm: (closeModal) => {
                    executeOptimisticSave();
                    if(closeModal) closeModal();
                }
            });
            return;
        }
    }
    executeOptimisticSave();
}

// --- DETERMINISTIC OPTIMISTIC UI ENGINE ---
async function executeOptimisticSave() {
    const isExpense = activeTab === 'EXPENSE';
    const amountVal = parseFloat(document.getElementById('txn-amount').value);
    const txnDate = document.getElementById('txn-date').value;
    const studentId = isExpense ? null : document.getElementById('txn-student')?.value;
    
    if (!isExpense && !studentId) return showToast("Select a student.", "error");

    let cleanDesc = '';
    if (isExpense) {
        const item = document.getElementById('txn-item').value.replace(/\|::\|/g, '').trim();
        const qty = document.getElementById('txn-qty').value.replace(/\|::\|/g, '').trim();
        const unit = document.getElementById('txn-unit').value;
        const note = document.getElementById('txn-note').value.replace(/\|::\|/g, '').trim();
        
        if (!item) return showToast("Enter Item Name.", "error");
        
        cleanDesc = `${item} ${qty ? '('+qty+unit+')' : ''}`.trim();
        if (note) cleanDesc += ` - ${note}`;
        if (expenseCategory === 'ASSET') cleanDesc = `[ASSET] ${cleanDesc}`;
    } else {
        const note = document.getElementById('txn-note').value.replace(/\|::\|/g, '').trim();
        cleanDesc = note || 'Advance Payment';
    }

    let finalDesc = cleanDesc;

    if (editingTxnId) {
        const oldRec = allTxnsCache.find(t => t.id === editingTxnId);
        if (oldRec) {
            const oldAmt = parseFloat(oldRec.amount);
            if (oldAmt !== amountVal || oldRec.txn_date !== txnDate) {
                let historyArr = [];
                const parts = oldRec.description.split('|::|');
                if (parts.length > 1) {
                    try { historyArr = JSON.parse(parts[1]).edits || []; } catch(e){}
                }
                historyArr.push({
                    t: new Date().toISOString(), 
                    oldAmt: oldAmt, 
                    oldDate: oldRec.txn_date 
                });
                finalDesc = `${cleanDesc} |::| ${JSON.stringify({edits: historyArr})}`;
            } else {
                const parts = oldRec.description.split('|::|');
                if (parts.length > 1) finalDesc = `${cleanDesc} |::| ${parts[1]}`;
            }
        }
    }

    const recordId = editingTxnId || crypto.randomUUID();
    
    const recordPayload = {
        id: recordId,
        txn_type: activeTab,
        amount: amountVal,
        txn_date: txnDate, 
        description: finalDesc,
        profiles: isExpense ? null : { name: directoryCache.find(s => s.id === studentId)?.name || 'Unknown' }
    };

    if (editingTxnId) {
        allTxnsCache = allTxnsCache.map(t => t.id === editingTxnId ? recordPayload : t);
    } else {
        allTxnsCache.unshift(recordPayload);
    }

    allTxnsCache.sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date));

    const wasEditing = editingTxnId !== null;
    editingTxnId = null;
    expenseCategory = 'CONSUMABLE';
    selectedDate = new Date().toLocaleDateString('en-CA');
    
    extractPredictiveChips();
    updateLedgerKPIs();
    renderInputForm();
    renderHistory();
    triggerHaptic('light');

    try {
        if (wasEditing) {
            await updateTransaction(recordId, activeTab, amountVal, txnDate, finalDesc, studentId);
            showToast("Record updated.", "success");
        } else {
            await addTransaction(recordId, activeTab, amountVal, txnDate, finalDesc, studentId);
            showToast("Logged successfully.", "success");
        }
    } catch (err) {
        showToast("Saved offline. Will sync when online.", "info");
    }
}

// --- KPI & Z-SCORE ALGORITHM (Bessel's Correction) ---
function updateLedgerKPIs() {
    let totalConsumable = 0;
    let totalFixedAsset = 0;
    let totalAdvance = 0;
    const consumableSpends = [];

    allTxnsCache.forEach(t => {
        const amt = parseFloat(t.amount);
        if (t.txn_type === 'ADVANCE') {
            totalAdvance += amt;
        } else if (t.txn_type === 'EXPENSE') {
            if (t.description.startsWith('[ASSET]')) {
                totalFixedAsset += amt;
            } else {
                totalConsumable += amt;
                consumableSpends.push(amt);
            }
        }
    });

    if (consumableSpends.length > 3) {
        const sum = consumableSpends.reduce((a, b) => a + b, 0);
        averageSpend = sum / consumableSpends.length;
        const variance = consumableSpends.reduce((a, b) => a + Math.pow(b - averageSpend, 2), 0) / (consumableSpends.length - 1);
        dynamicThreshold = Math.max(1500, averageSpend + (2 * Math.sqrt(variance))); 
    } else {
        averageSpend = 0;
        dynamicThreshold = 1500;
    }

    const cashInHand = totalAdvance - (totalConsumable + totalFixedAsset);
    const mealRate = currentMealsCount > 0 ? (totalConsumable / currentMealsCount).toFixed(2) : '0.00';

    const kpiContainer = document.getElementById('ledger-kpis');
    if (kpiContainer) {
        kpiContainer.innerHTML = `
            <div class="col-span-2 flex justify-center mt-1 mb-2">
                <div class="px-5 py-2 rounded-full border shadow-sm flex items-center gap-2.5 bg-white/[0.02] border-white/[0.05]">
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                    <span class="text-[10px] font-black uppercase tracking-widest text-white/50">Live Meal Rate:</span>
                    <span class="text-[14px] font-black font-mono text-white tracking-wider">₹${mealRate}</span>
                </div>
            </div>
            <div class="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] rounded-[20px] p-4 flex flex-col justify-center items-center shadow-sm">
                <div class="text-[9px] font-black uppercase tracking-widest mb-1 text-white/40">Operating Capital</div>
                <div class="text-xl font-black font-mono tracking-tight ${cashInHand >= 0 ? 'text-emerald-400' : 'text-rose-500'}">₹${cashInHand.toLocaleString('en-IN')}</div>
            </div>
            <div class="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] rounded-[20px] p-4 flex flex-col justify-center items-center shadow-sm">
                <div class="text-[9px] font-black uppercase tracking-widest mb-1 text-white/40">Burn (Consumables)</div>
                <div class="text-xl font-black font-mono tracking-tight text-white">₹${totalConsumable.toLocaleString('en-IN')}</div>
            </div>
        `;
    }
}

async function loadLedgerData() {
    const historyContainer = document.getElementById('ledger-history');
    historyContainer.innerHTML = `<div class="text-center py-10 font-bold text-[12px] animate-pulse text-white/40">Syncing ledger...</div>`;
    
    const [txnRes, statsRes] = await Promise.all([
        fetchTransactions(currentMonth),
        fetchMonthlyStats(currentMonth)
    ]);

    if (!txnRes.success || !statsRes.success) return showToast("Error loading financial data", "error");

    currentMealsCount = 0;
    statsRes.logs.forEach(log => {
        if (log.day_meal !== 'OFF') currentMealsCount++;
        if (log.night_meal !== 'OFF') currentMealsCount++;
    });

    allTxnsCache = txnRes.transactions;
    
    extractPredictiveChips();
    updateLedgerKPIs();
    renderHistory();
}

function attachHistoryDelegation() {
    const container = document.getElementById('ledger-history');
    
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.txn-card');
        if (card && !e.target.closest('.txn-actions') && !e.target.closest('.badge-history')) {
            triggerHaptic('light');
            const actionGrid = card.querySelector('.txn-accordion');
            const isClosing = actionGrid.classList.contains('grid-rows-[1fr]');
            
            document.querySelectorAll('.txn-accordion').forEach(p => {
                p.classList.remove('grid-rows-[1fr]', 'opacity-100');
                p.classList.add('grid-rows-[0fr]', 'opacity-0');
            });
            
            if (!isClosing) {
                actionGrid.classList.remove('grid-rows-[0fr]', 'opacity-0');
                actionGrid.classList.add('grid-rows-[1fr]', 'opacity-100');
            }
            return;
        }

        const btnEdit = e.target.closest('.btn-edit-txn');
        if (btnEdit) {
            triggerHaptic('light');
            initiateEditMode(btnEdit.getAttribute('data-id'));
            return;
        }

        const btnDel = e.target.closest('.btn-delete-txn');
        if (btnDel) {
            triggerHaptic('heavy');
            const id = btnDel.getAttribute('data-id');
            showModal({
                title: "Delete Record?",
                message: "This will permanently remove the transaction and instantly update the hostel's mathematics.",
                type: "danger",
                confirmText: "Delete",
                onConfirm: (closeModal) => {
                    executeOptimisticDelete(id);
                    if(closeModal) closeModal();
                }
            });
            return;
        }

        const btnHistory = e.target.closest('.badge-history');
        if (btnHistory) {
            triggerHaptic('modal');
            const payloadStr = btnHistory.getAttribute('data-payload');
            try {
                const edits = JSON.parse(payloadStr).edits || [];
                const histHtml = edits.map(e => `
                    <div class="flex justify-between items-center py-2.5 border-b border-white/[0.06] last:border-0">
                        <div class="text-[11px] font-bold text-white/50">${new Date(e.t).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})} <span class="opacity-50">${new Date(e.t).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</span></div>
                        <div class="text-[13px] font-black text-rose-400 font-mono">Was ₹${e.oldAmt}</div>
                    </div>
                `).join('');
                
                showModal({
                    title: "Audit Log",
                    message: `<div class="mt-4 bg-[#111113]/80 backdrop-blur-md rounded-[16px] p-4 text-left border border-white/[0.08] shadow-inner">${histHtml}</div>`,
                    type: "info",
                    confirmText: "Close"
                });
            } catch(e) {}
        }
    });
}

function initiateEditMode(id) {
    const txn = allTxnsCache.find(t => t.id === id);
    if (!txn) return;

    editingTxnId = id;
    selectedDate = txn.txn_date;
    switchTab(txn.txn_type);
    
    let rawDesc = txn.description.split('|::|')[0].trim();
    let cleanDesc = rawDesc.replace('[ASSET] ', '');
    
    if (txn.txn_type === 'EXPENSE') {
        const isAsset = rawDesc.startsWith('[ASSET]');
        expenseCategory = isAsset ? 'ASSET' : 'CONSUMABLE';
        
        const splitNote = cleanDesc.split(' - ');
        const itemQty = splitNote[0] || '';
        
        // Advanced Regex to safely split quantity and unit (e.g. "Rice (5.5kg)" -> "Rice", "5.5", "kg")
        const qtyMatch = itemQty.match(/(.*?)\s*\(([\d.]+)([a-zA-Z]+)\)$/);
        
        renderInputForm(); 
        document.getElementById('txn-amount').value = txn.amount;
        
        if (qtyMatch) {
            document.getElementById('txn-item').value = qtyMatch[1].trim();
            document.getElementById('txn-qty').value = qtyMatch[2].trim();
            
            const unitSelect = document.getElementById('txn-unit');
            const storedUnit = qtyMatch[3].trim().toLowerCase();
            // Map common variants back to the strict selector values
            const validUnits = ['kg', 'g', 'l', 'ml', 'pc', 'pkt'];
            const mappedUnit = validUnits.includes(storedUnit) ? storedUnit : (storedUnit === 'litre' ? 'L' : 'kg');
            
            for (let i = 0; i < unitSelect.options.length; i++) {
                if (unitSelect.options[i].value.toLowerCase() === mappedUnit) {
                    unitSelect.selectedIndex = i;
                    break;
                }
            }
        } else {
            // Fallback for older formats "Rice (5)"
            const oldMatch = itemQty.match(/(.*?)\s*\((.*?)\)$/);
            if (oldMatch) {
                document.getElementById('txn-item').value = oldMatch[1].trim();
                document.getElementById('txn-qty').value = oldMatch[2].trim();
            } else {
                document.getElementById('txn-item').value = itemQty.trim();
            }
        }
        
        document.getElementById('txn-note').value = splitNote[1] || '';
    } else {
        renderInputForm();
        document.getElementById('txn-amount').value = txn.amount;
        document.getElementById('txn-note').value = cleanDesc;
        
        const selectEl = document.getElementById('txn-student');
        if (selectEl && txn.profiles?.name) {
            for (let i = 0; i < selectEl.options.length; i++) {
                if (selectEl.options[i].text === txn.profiles.name) {
                    selectEl.selectedIndex = i;
                    break;
                }
            }
        }
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function executeOptimisticDelete(id) {
    allTxnsCache = allTxnsCache.filter(t => t.id !== id);
    extractPredictiveChips();
    updateLedgerKPIs();
    renderHistory();
    triggerHaptic('light');

    deleteTransaction(id).catch(() => {
        showToast("Saved offline. Will sync later.", "info");
    });
}

function renderHistory() {
    const container = document.getElementById('ledger-history');
    const filtered = allTxnsCache.filter(t => historyFilter === 'ALL' || t.txn_type === historyFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-10 font-bold text-[12px] text-white/30">No records found.</div>`;
    } else {
        container.innerHTML = filtered.map(t => {
            const isExp = t.txn_type === 'EXPENSE';
            const dateObj = new Date(t.txn_date);
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            
            const parts = t.description.split('|::|');
            const rawDesc = parts[0].trim();
            const hasHistory = parts.length > 1;
            const historyPayload = hasHistory ? parts[1].trim() : '';

            const isAsset = isExp && rawDesc.startsWith('[ASSET]');
            let title = '';
            let subTitle = '';
            
            if (isExp) {
                const cleanDesc = rawDesc.replace('[ASSET] ', '');
                title = cleanDesc.split(' - ')[0];
                subTitle = cleanDesc.split(' - ')[1] || '';
            } else {
                title = t.profiles?.name || 'Student Pay';
                subTitle = rawDesc;
            }

            let badgeHtml = '';
            let amountColor = 'text-emerald-400';
            let prefix = '+';

            if (isExp) {
                prefix = '-';
                amountColor = 'text-white';
                if (isAsset) {
                    badgeHtml = `<span class="bg-telegram/10 text-telegram text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Asset</span>`;
                } else {
                    badgeHtml = `<span class="bg-rose-500/10 text-rose-400 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Exp</span>`;
                }
            } else {
                badgeHtml = `<span class="bg-emerald-400/10 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Adv</span>`;
            }

            const historyBadge = hasHistory ? `<button class="badge-history ml-2 bg-white/10 text-white/60 hover:text-white px-1.5 py-0.5 rounded-[6px] text-[8px] font-black uppercase tracking-wider transition-colors border border-white/5 shadow-sm" data-payload='${historyPayload}'>History</button>` : '';

            return `
            <div class="txn-card bg-[#09090b] border border-white/[0.04] rounded-[16px] shadow-sm overflow-hidden transition-colors hover:bg-white/[0.02]">
                <div class="p-4 flex items-center justify-between cursor-pointer group">
                    <div class="flex flex-col gap-1.5 flex-1 min-w-0 pr-4">
                        <div class="flex items-center gap-2">
                            ${badgeHtml}
                            <div class="text-[14px] font-black text-white tracking-tight truncate">${title}</div>
                        </div>
                        ${subTitle ? `<div class="text-[10px] font-bold text-white/40 truncate">${subTitle}</div>` : ''}
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-[16px] font-black font-mono tracking-tight ${amountColor}">${prefix}₹${parseFloat(t.amount).toLocaleString('en-IN')}</div>
                        <div class="text-[9px] font-bold uppercase tracking-widest mt-1 text-white/30 flex justify-end items-center">${dateStr} ${historyBadge}</div>
                    </div>
                </div>

                <div class="txn-accordion grid transition-all duration-300 grid-rows-[0fr] opacity-0">
                    <div class="overflow-hidden">
                        <div class="txn-actions border-t border-white/[0.04] bg-white/[0.01] px-3 py-2.5 flex gap-2">
                            <button class="btn-edit-txn flex-1 py-2 rounded-[10px] bg-white/[0.05] border border-white/5 text-white text-[11px] font-bold active-scale transition-colors hover:bg-white/10" data-id="${t.id}">Edit</button>
                            <button class="btn-delete-txn flex-1 py-2 rounded-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[11px] font-bold active-scale transition-colors hover:bg-rose-500/20" data-id="${t.id}">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }
    refreshIcons();
}
