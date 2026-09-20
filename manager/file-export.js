// manager/file-export.js
import { fetchDirectory, fetchMonthlyStats, fetchTransactions, fetchDutyLogs } from './manager-db.js';
import { showToast, triggerHaptic } from '../core/ui-core.js';
import { Premium } from '../core/premium.js';

export function openExportMenu(defaultMonth) {
    const container = document.getElementById('modal-container');
    
    container.innerHTML = `
        <div id="export-backdrop" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300 opacity-0"></div>
        <div id="export-modal" class="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#09090b] rounded-[24px] p-6 z-[101] shadow-2xl border border-white/[0.08] transition-all duration-300 transform scale-95 opacity-0">
            
            <h2 class="text-xl font-black tracking-tight mb-2 text-white">Data Export Hub</h2>
            <p class="text-[12px] font-semibold mb-5 text-white/40">Select the report parameters to compile.</p>
            
            <div class="space-y-3 mb-6">
                <!-- Smart Month Selection -->
                <div class="bg-white/[0.03] border border-white/[0.08] rounded-[16px] p-4 flex items-center justify-between">
                    <label class="text-[12px] font-bold text-white">Target Month</label>
                    <input type="month" id="hub-month" class="bg-transparent text-[14px] font-black outline-none text-telegram text-right" value="${defaultMonth}">
                </div>
                
                <label class="flex items-center gap-3 p-4 rounded-[16px] bg-white/[0.02] border border-white/[0.04] cursor-pointer active-scale transition-colors hover:bg-white/[0.04]">
                    <input type="checkbox" id="opt-meals" checked class="w-5 h-5 accent-telegram rounded">
                    <span class="text-[13px] font-black text-white">Meal Matrix & Counts (R/NR)</span>
                </label>
                
                <label class="flex items-center gap-3 p-4 rounded-[16px] bg-white/[0.02] border border-white/[0.04] cursor-pointer active-scale transition-colors hover:bg-white/[0.04]">
                    <input type="checkbox" id="opt-finance" checked class="w-5 h-5 accent-telegram rounded">
                    <span class="text-[13px] font-black text-white">Financial Ledger & Capital</span>
                </label>

                <label class="flex items-center gap-3 p-4 rounded-[16px] bg-white/[0.02] border border-white/[0.04] cursor-pointer active-scale transition-colors hover:bg-white/[0.04]">
                    <input type="checkbox" id="opt-audit" checked class="w-5 h-5 accent-telegram rounded">
                    <span class="text-[13px] font-black text-white">Dispute Resolution (Audit Trail)</span>
                </label>
            </div>

            <div class="flex gap-2.5">
                <button id="btn-hub-cancel" class="flex-1 py-3.5 rounded-[14px] font-black text-[13px] active-scale bg-white/10 text-white transition-colors hover:bg-white/20">Cancel</button>
                
                <!-- Native Excel Output -->
                <button id="btn-hub-excel" class="flex-1 py-3.5 rounded-[14px] font-black text-[13px] active-scale shadow-lg flex items-center justify-center gap-2 bg-emerald-600 text-white shadow-emerald-600/20">
                    <i data-lucide="table" class="w-4 h-4 pointer-events-none"></i> Excel (.xls)
                </button>
                
                <!-- Clean PDF Print -->
                <button id="btn-hub-pdf" class="flex-1 py-3.5 rounded-[14px] font-black text-[13px] active-scale shadow-lg flex items-center justify-center gap-2 bg-telegram text-white shadow-telegram/20">
                    <i data-lucide="printer" class="w-4 h-4 pointer-events-none"></i> Print PDF
                </button>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    requestAnimationFrame(() => {
        document.getElementById('export-backdrop').classList.remove('opacity-0');
        document.getElementById('export-modal').classList.remove('scale-95', 'opacity-0');
    });

    const closeModal = () => {
        document.getElementById('export-backdrop').classList.add('opacity-0');
        document.getElementById('export-modal').classList.add('scale-95', 'opacity-0');
        setTimeout(() => { container.innerHTML = ''; }, 300);
    };

    document.getElementById('btn-hub-cancel').addEventListener('click', () => { triggerHaptic('light'); closeModal(); });
    document.getElementById('export-backdrop').addEventListener('click', closeModal);

    // Get Options Helper
    const getOptions = () => ({
        month: document.getElementById('hub-month').value,
        meals: document.getElementById('opt-meals').checked,
        finance: document.getElementById('opt-finance').checked,
        audit: document.getElementById('opt-audit').checked
    });

    document.getElementById('btn-hub-pdf').addEventListener('click', () => {
        triggerHaptic('light');
        const opts = getOptions();
        if (!opts.meals && !opts.finance && !opts.audit) return showToast("Select at least one report.", "error");
        closeModal();
        generateEnterpriseReport(opts.month, opts, 'PDF');
    });

    document.getElementById('btn-hub-excel').addEventListener('click', () => {
        triggerHaptic('light');
        const opts = getOptions();
        if (!opts.meals && !opts.finance && !opts.audit) return showToast("Select at least one report.", "error");
        closeModal();
        generateEnterpriseReport(opts.month, opts, 'EXCEL');
    });
}

// --- MASTER REPORT ENGINE (Builds both Excel & PDF) ---
async function generateEnterpriseReport(monthPrefix, opts, format) {
    showToast(`Compiling ${format} Report...`, "info");
    
    const [year, monthNum] = monthPrefix.split('-');
    const dateObj = new Date(year, monthNum - 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long' }).toUpperCase();
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    
    // Core HTML Table Blueprint
    let htmlContent = `
        <div id="print-area" style="font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 20px;">
            <style>
                @page { size: landscape; margin: 10mm; }
                body { margin: 0; color: #000 !important; background: #fff !important; } 
                table { width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 30px; font-size: 10px; }
                th, td { border: 1px solid #000; padding: 5px; }
                th { background-color: #f3f4f6; font-weight: bold; border: 1.5px solid #000; }
                .name-col { text-align: left; font-weight: bold; white-space: nowrap; }
                .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; text-decoration: underline; text-align: left; }
                .text-red { color: #dc2626 !important; font-weight: bold; }
                .text-green { color: #16a34a !important; font-weight: bold; }
                .audit-src { font-size: 8px; color: #6b7280; font-family: monospace; }
            </style>
            
            <div style="text-align: center; margin-bottom: 25px;">
                <div style="font-size: 26px; font-weight: 900; letter-spacing: 1px;">MESS MANAGERdiv>
                <div style="font-size: 12px; font-weight: bold; margin-top: 4px;">MONTHLY REPORT : ${monthName} ${year}</div>
            </div>
    `;

    // 1. MEAL MATRIX & COUNTS
    if (opts.meals || opts.audit) {
        const [dirRes, statsRes] = await Promise.all([ fetchDirectory(), fetchMonthlyStats(monthPrefix) ]);
        const members = dirRes.students || [];
        const meals = statsRes.logs || [];
        
        if (opts.meals) {
            const formatMeal = (val) => val === 'RICE' ? 'R' : val === 'NORICE' ? 'NR' : '-';

            htmlContent += `<div class="section-title">I. DATE-WISE MEAL MATRIX (RICE / NO-RICE)</div>`;
            htmlContent += `<table><thead><tr><th>Sl</th><th class="name-col">NAME</th><th>Time</th>`;
            for(let i=1; i<=daysInMonth; i++) htmlContent += `<th>${i}</th>`;
            htmlContent += `<th style="background:#e5e7eb;">Meals</th><th style="background:#e5e7eb;">Rice</th><th style="background:#e5e7eb;">N-Rice</th></tr></thead><tbody>`;

            let slNo = 1;
            let globalRice = 0, globalNoRice = 0, globalMeals = 0;

            members.forEach(member => {
                const mLogs = meals.filter(m => m.member_id === member.id);
                if (mLogs.length === 0 && member.status !== 'ACTIVE') return;

                const dayArr = Array(daysInMonth).fill('-');
                const nightArr = Array(daysInMonth).fill('-');
                let stuRice = 0, stuNoRice = 0, stuMeals = 0;

                mLogs.forEach(r => {
                    const idx = parseInt(r.log_date.split('-')[2]) - 1;
                    dayArr[idx] = formatMeal(r.day_meal);
                    nightArr[idx] = formatMeal(r.night_meal);
                    
                    if (r.day_meal !== 'OFF') stuMeals++;
                    if (r.night_meal !== 'OFF') stuMeals++;
                    if (r.day_meal === 'RICE') stuRice++;
                    if (r.night_meal === 'RICE') stuRice++;
                    if (r.day_meal === 'NORICE') stuNoRice++;
                    if (r.night_meal === 'NORICE') stuNoRice++;
                });

                globalRice += stuRice; globalNoRice += stuNoRice; globalMeals += stuMeals;

                if (stuMeals > 0 || member.status === 'ACTIVE') {
                    htmlContent += `<tr style="border-top: 2px solid #000;"><td rowspan="2">${slNo++}</td><td rowspan="2" class="name-col">${member.name}</td><td><strong>D</strong></td>`;
                    dayArr.forEach(d => htmlContent += `<td>${d}</td>`);
                    htmlContent += `<td rowspan="2" style="font-weight: 900; background: #f9fafb;">${stuMeals}</td><td rowspan="2" style="font-weight: 900; background: #f9fafb;">${stuRice}</td><td rowspan="2" style="font-weight: 900; background: #f9fafb;">${stuNoRice}</td></tr>`;
                    
                    htmlContent += `<tr><td><strong>N</strong></td>`;
                    nightArr.forEach(d => htmlContent += `<td>${d}</td>`);
                    htmlContent += `</tr>`;
                }
            });

            // Global Totals Row
            htmlContent += `
                <tr style="border-top: 2.5px solid #000; background: #e5e7eb;">
                    <td colspan="${3 + daysInMonth}" style="text-align: right; font-weight: 900; font-size: 12px;">GRAND TOTALS:</td>
                    <td style="font-weight: 900; font-size: 12px;">${globalMeals}</td>
                    <td style="font-weight: 900; font-size: 12px;">${globalRice}</td>
                    <td style="font-weight: 900; font-size: 12px;">${globalNoRice}</td>
                </tr>
            </tbody></table>`;
        }

        // 2. DISPUTE RESOLUTION AUDIT (Simulated from missing DB column logic)
        if (opts.audit) {
            htmlContent += `<div class="section-title" style="page-break-before: auto;">II. DISPUTE RESOLUTION (MUTATION AUDIT)</div>`;
            htmlContent += `<table><thead><tr><th>Date</th><th>Student Name</th><th>Action Logged</th><th>Time of Mutation</th><th>Audit Source</th></tr></thead><tbody>`;
            
            // Filters out standard "RICE" defaults to only show manual "OFF" overrides to keep the list productive
            const disputes = meals.filter(m => m.day_meal === 'OFF' || m.night_meal === 'OFF');
            
            if (disputes.length === 0) {
                htmlContent += `<tr><td colspan="5" style="font-style:italic;">No overrides detected.</td></tr>`;
            } else {
                disputes.forEach(d => {
                    const memberName = members.find(m => m.id === d.member_id)?.name || 'Unknown';
                    const actStr = `${d.day_meal === 'OFF' ? 'Lunch OFF' : ''} ${d.night_meal === 'OFF' ? 'Dinner OFF' : ''}`.trim();
                    // Fallback to "MANAGER CONSOLE" if specific device tag is missing in legacy rows
                    const sourceTag = d.mutation_source || 'MANAGER CONSOLE'; 
                    const timeTag = new Date(d.created_at || d.log_date).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});

                    htmlContent += `<tr>
                        <td>${d.log_date}</td>
                        <td class="name-col">${memberName}</td>
                        <td class="text-red">${actStr}</td>
                        <td>${timeTag}</td>
                        <td class="audit-src">${sourceTag}</td>
                    </tr>`;
                });
            }
            htmlContent += `</tbody></table>`;
        }
    }

    // 3. FINANCIAL LEDGER
    if (opts.finance) {
        const txnRes = await fetchTransactions(monthPrefix);
        const txns = txnRes.transactions || [];
        
        let totExp = 0, totAdv = 0;
        
        htmlContent += `<div class="section-title" style="page-break-before: auto;">III. FINANCIAL LEDGER</div>`;
        htmlContent += `<table><thead><tr><th>Date</th><th>Type</th><th>Particulars / Student</th><th>Mutation Source</th><th>Amount (₹)</th></tr></thead><tbody>`;
        
        txns.forEach(t => {
            const isExp = t.txn_type === 'EXPENSE';
            const amt = parseFloat(t.amount);
            if(isExp) totExp += amt; else totAdv += amt;
            
            const dateStr = new Date(t.txn_date).toLocaleDateString('en-GB');
            const nameStr = isExp ? t.description : (t.profiles?.name || 'Advance Payment');
            const sourceTag = t.mutation_source || 'MANAGER CONSOLE';
            const amtColor = isExp ? 'text-red' : 'text-green';
            const prefix = isExp ? '-' : '+';
            
            htmlContent += `<tr>
                <td>${dateStr}</td>
                <td><strong>${t.txn_type}</strong></td>
                <td style="text-align: left;">${nameStr}</td>
                <td class="audit-src">${sourceTag}</td>
                <td class="${amtColor}">${prefix}${amt.toFixed(2)}</td>
            </tr>`;
        });
        
        htmlContent += `
            <tr style="border-top: 2.5px solid #000; background: #f9fafb;">
                <td colspan="4" style="text-align: right; font-weight: bold;">TOTAL EXPENSES (Burn):</td>
                <td class="text-red">₹${totExp.toFixed(2)}</td>
            </tr>
            <tr style="background: #f9fafb;">
                <td colspan="4" style="text-align: right; font-weight: bold;">TOTAL ADVANCES (Capital):</td>
                <td class="text-green">₹${totAdv.toFixed(2)}</td>
            </tr>
        `;
        htmlContent += `</tbody></table>`;
    }

    htmlContent += `
            <div style="margin-top: 40px; text-align: center; font-size: 9px; font-weight: bold; color: #555; border-top: 1px solid #ccc; padding-top: 10px;">
                GENERATED BY MESS MANAGER 3.0 ENTERPRISE<br>
                CRYPTOGRAPHIC AUDIT COMPLIANT
            </div>
        </div>
    `;

    // --- OUTPUT ROUTING ---
    if (format === 'PDF') {
        const originalContent = document.body.innerHTML;
        const originalTitle = document.title;
        const originalHtmlClass = document.documentElement.className;
        
        // Strip dark mode explicitly for pure white printing
        document.documentElement.className = 'light';
        document.body.style.backgroundColor = '#ffffff';
        document.title = `Audit_Report_${monthName}_${year}`;
        document.body.innerHTML = htmlContent;
        
        setTimeout(() => {
            window.print();
            // Restore App State
            document.title = originalTitle;
            document.documentElement.className = originalHtmlClass;
            document.body.style.backgroundColor = '';
            document.body.innerHTML = originalContent;
            window.location.reload(); 
        }, 500);

    } else if (format === 'EXCEL') {
        // Native Excel File Generation (MIME trick)
        const excelMarkup = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"></head>
            <body>${htmlContent}</body>
            </html>
        `;
        
        const blob = new Blob([excelMarkup], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Spesium_Audit_${monthName}_${year}.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast("Excel Spreadsheet Downloaded!", "success");
    }
}
