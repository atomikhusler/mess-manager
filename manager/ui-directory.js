// manager/ui-directory.js
import { fetchDirectory, addStudent, deleteStudent, fetchMonthlyStats, fetchTransactions } from './manager-db.js';
import { supabase } from '../core/supabase-client.js';
import { OfflineEngine } from '../core/offline-engine.js';
import { showToast, showModal, refreshIcons, triggerHaptic } from '../core/ui-core.js';

let directoryCache = [];
let currentMonth = new Date().toLocaleDateString('en-CA').substring(0, 7);
let liveMealRate = 0; 
let sortMode = 0; // 0 = A-Z, 1 = Triage (Defaulters), 2 = Room

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`;
}

function getInitials(name) {
    return name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

export async function initDirectoryView() {
    const container = document.getElementById('view-directory');
    if (!container) return;

    if (container.innerHTML === '') {
        container.innerHTML = `
            <!-- Unified Ergonomic Control Bar -->
            <div class="mb-4 px-2 pt-2 fade-in flex gap-2 h-[48px]">
                <div class="relative flex-1 bg-[#111113] border border-white/[0.08] rounded-[14px] focus-within:border-telegram/50 transition-colors shadow-inner flex items-center">
                    <i data-lucide="search" class="w-4 h-4 absolute left-3 text-white/30 pointer-events-none"></i>
                    <input type="text" id="dir-search" autocomplete="off" spellcheck="false" placeholder="Search roster..." class="w-full bg-transparent pl-9 pr-3 py-2 text-[13px] font-bold outline-none text-white placeholder-white/30">
                </div>
                
                <button id="btn-onboard" class="w-[48px] h-full shrink-0 rounded-[14px] bg-telegram text-white flex items-center justify-center active-scale transition-transform shadow-[0_0_15px_rgba(51,144,236,0.3)]">
                    <i data-lucide="user-plus" class="w-5 h-5 pointer-events-none"></i>
                </button>

                <button id="btn-sort-toggle" class="w-[48px] h-full shrink-0 rounded-[14px] bg-[#111113] border border-white/[0.08] flex flex-col items-center justify-center active-scale transition-colors text-white relative shadow-sm">
                    <i data-lucide="arrow-up-down" class="w-3.5 h-3.5 mt-0.5"></i>
                    <span id="sort-indicator" class="text-[7px] font-black uppercase tracking-widest text-telegram mt-0.5">A-Z</span>
                </button>
            </div>

            <!-- Context Header -->
            <div class="flex justify-between items-end px-3 mb-2">
                <div class="text-[10px] font-black uppercase tracking-widest text-white/40" id="dir-list-header">Alphabetical View</div>
                <div class="text-[9px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1"><i data-lucide="info" class="w-3 h-3"></i> Swipe ⬅️ to Vaporize</div>
            </div>

            <div id="dir-list" class="space-y-2 pb-28 px-2"></div>
        `;

        document.getElementById('dir-search').addEventListener('input', (e) => renderDirectory(e.target.value));
        document.getElementById('btn-onboard').addEventListener('click', openAddStudentModal);
        
        document.getElementById('btn-sort-toggle').addEventListener('click', () => {
            triggerHaptic('light');
            sortMode = (sortMode + 1) % 3;
            const indicator = document.getElementById('sort-indicator');
            const header = document.getElementById('dir-list-header');
            
            if (sortMode === 0) {
                indicator.innerText = "A-Z";
                header.innerText = "Alphabetical View";
            } else if (sortMode === 1) {
                indicator.innerText = "DEBT";
                indicator.className = "text-[7px] font-black uppercase tracking-widest text-rose-400 mt-0.5";
                header.innerText = "Financial Triage";
            } else {
                indicator.innerText = "ROOM";
                indicator.className = "text-[7px] font-black uppercase tracking-widest text-amber-500 mt-0.5";
                header.innerText = "Room Sector View";
            }
            renderDirectory(document.getElementById('dir-search').value);
        });
    }

    loadDirectoryData();
}

async function loadDirectoryData() {
    const listEl = document.getElementById('dir-list');
    
    // Only show loading state if the cache is completely empty (first boot)
    if (directoryCache.length === 0) {
        listEl.innerHTML = `<div class="text-center py-10 font-bold text-[12px] animate-pulse text-white/30 flex flex-col items-center gap-3"><i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Syncing Matrix...</div>`;
        refreshIcons();
    }

    const [dirRes, statsRes, txnRes] = await Promise.all([
        fetchDirectory(),
        fetchMonthlyStats(currentMonth),
        fetchTransactions(currentMonth)
    ]);

    if (!dirRes.success) {
        listEl.innerHTML = `<div class="text-center py-10 font-bold text-rose-500">Database connection failed.</div>`;
        return;
    }

    let globalMeals = 0;
    let globalExpense = 0;
    
    if (statsRes.success) {
        statsRes.logs.forEach(log => {
            if (log.day_meal !== 'OFF') globalMeals++;
            if (log.night_meal !== 'OFF') globalMeals++;
        });
    }
    
    if (txnRes.success) {
        txnRes.transactions.forEach(t => {
            if (t.txn_type === 'EXPENSE' && !t.description.startsWith('[ASSET]')) {
                globalExpense += parseFloat(t.amount);
            }
        });
    }

    liveMealRate = globalMeals > 0 ? (globalExpense / globalMeals) : 0;

    directoryCache = dirRes.students.map(s => {
        let stuMeals = 0, stuAdvance = 0, rice = 0, noRice = 0;
        let logs = [];

        if (statsRes.success) {
            statsRes.logs.forEach(log => {
                if (log.member_id === s.id) {
                    let dVal = log.day_meal === 'OFF' ? 0 : 1;
                    let nVal = log.night_meal === 'OFF' ? 0 : 1;
                    
                    stuMeals += (dVal + nVal);
                    if (log.day_meal === 'RICE') rice++;
                    if (log.day_meal === 'NORICE') noRice++;
                    if (log.night_meal === 'RICE') rice++;
                    if (log.night_meal === 'NORICE') noRice++;

                    if (dVal > 0 || nVal > 0) {
                        logs.push({
                            date: log.log_date,
                            dayStr: log.day_meal === 'NORICE' ? 'N-Rice' : (log.day_meal === 'OFF' ? '--' : 'Rice'),
                            nightStr: log.night_meal === 'NORICE' ? 'N-Rice' : (log.night_meal === 'OFF' ? '--' : 'Rice')
                        });
                    }
                }
            });
        }

        if (txnRes.success) {
            txnRes.transactions.forEach(t => {
                if (t.member_id === s.id && t.txn_type === 'ADVANCE') stuAdvance += parseFloat(t.amount);
            });
        }

        const totalBill = stuMeals * liveMealRate;
        const remainingDues = totalBill - stuAdvance;

        logs.sort((a, b) => b.date.localeCompare(a.date));

        return { ...s, stuMeals, stuAdvance, remainingDues, totalBill, logs, rice, noRice };
    });

    renderDirectory(document.getElementById('dir-search').value);
}

function renderDirectory(searchQuery = '') {
    const listEl = document.getElementById('dir-list');
    const query = searchQuery.toLowerCase().trim();

    let filtered = directoryCache.filter(s => {
        return s.name.toLowerCase().includes(query) || (s.room && s.room.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="flex flex-col items-center justify-center py-16 opacity-30"><i data-lucide="users-2" class="w-10 h-10 mb-3"></i><div class="text-[12px] font-black tracking-tight">No members found</div></div>`;
        refreshIcons();
        return;
    }

    filtered.sort((a, b) => {
        if (sortMode === 1) {
            if (a.status === 'ACTIVE' && b.status === 'INACTIVE') return -1;
            if (a.status === 'INACTIVE' && b.status === 'ACTIVE') return 1;
            return b.remainingDues - a.remainingDues;
        } else if (sortMode === 2) {
            const rA = a.room || 'ZZZ';
            const rB = b.room || 'ZZZ';
            return rA.localeCompare(rB, undefined, { numeric: true, sensitivity: 'base' });
        } else {
            return a.name.localeCompare(b.name);
        }
    });

    listEl.innerHTML = filtered.map(s => {
        const isActive = s.status === 'ACTIVE';
        const isDefaulter = isActive && s.remainingDues > 0;
        const duesColor = isDefaulter ? 'text-rose-400' : 'text-emerald-400';
        
        // Compact Inline Meal Log
        const logHtml = s.logs.length === 0 
            ? `<div class="text-[10px] py-4 text-center font-bold text-white/30">No meals logged yet.</div>` 
            : s.logs.map(l => {
                const parts = l.date.split('-');
                const fmtDate = `${parts[2]}.${parts[1]}`;
                return `
                <div class="flex items-center justify-between text-[10px] py-2 border-b border-white/[0.04] last:border-0 font-bold">
                    <span class="text-white/50 tracking-wider font-mono">${fmtDate}</span>
                    <div class="flex gap-4">
                        <span class="${l.dayStr === '--' ? 'text-white/20' : 'text-telegram'} w-10 text-center">${l.dayStr}</span>
                        <span class="${l.nightStr === '--' ? 'text-white/20' : 'text-telegram'} w-10 text-center">${l.nightStr}</span>
                    </div>
                </div>`;
            }).join('');

        return `
            <div class="relative w-full overflow-hidden rounded-[16px] group border border-white/[0.04] bg-[#09090b] shadow-sm dir-card-wrapper">
                
                <!-- Underlay Delete Block (Revealed purely by swipe) -->
                <div class="absolute inset-y-0 right-0 w-[80px] bg-rose-600 flex items-center justify-center z-0">
                    <button class="btn-execute-delete w-full h-full flex flex-col items-center justify-center text-white active-scale" data-id="${s.id}">
                        <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none mb-0.5"></i>
                        <span class="text-[8px] font-black uppercase tracking-widest pointer-events-none">Delete</span>
                    </button>
                </div>
                
                <!-- Swipable Foreground Surface -->
                <div class="swipe-surface relative w-full bg-[#09090b] flex flex-col z-10 transition-transform duration-200 ease-out ${!isActive ? 'opacity-50 grayscale' : ''}">
                    
                    <!-- Compact Header Toggle -->
                    <div class="dir-accordion-toggle px-3 py-3 flex items-center justify-between cursor-pointer active-scale hover:bg-white/[0.02]">
                        <div class="flex items-center gap-3 flex-1 min-w-0 pr-2 pointer-events-none">
                            <div class="w-9 h-9 rounded-[10px] flex items-center justify-center text-white text-[11px] font-black shrink-0 ${!isActive ? 'ring-1 ring-white/10' : ''}" style="background-color: ${getAvatarColor(s.name)};">
                                ${getInitials(s.name)}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-black text-[14px] truncate text-white leading-tight">${s.name}</div>
                                <div class="text-[9px] font-bold text-white/40 truncate mt-0.5 tracking-wider">Rm ${s.room || '-'} • ${s.phone}</div>
                            </div>
                        </div>
                        
                        <div class="flex flex-col items-end shrink-0 pointer-events-none">
                            <div class="text-[13px] font-black font-mono tracking-tight ${duesColor}">
                                ${isDefaulter ? '-' : '+'}₹${Math.abs(s.remainingDues).toLocaleString('en-IN', {maximumFractionDigits:0})}
                            </div>
                            <div class="text-[7px] font-black uppercase tracking-widest text-white/30 mt-0.5">${isDefaulter ? 'Dues' : 'Balance'}</div>
                        </div>
                    </div>

                    <!-- Compact Accordion Content -->
                    <div class="grid transition-all duration-300 grid-rows-[0fr] dir-accordion-content bg-[#111113]/50">
                        <div class="overflow-hidden">
                            <div class="p-3 border-t border-white/[0.04]">
                                
                                <div class="flex justify-between items-center mb-3 px-2 py-1.5 bg-[#09090b] rounded-[10px] border border-white/[0.04]">
                                    <div class="text-[10px] font-bold text-white/60"><span class="text-white font-black">${s.stuMeals}</span> Meals</div>
                                    <div class="text-[10px] font-bold text-white/60"><span class="text-white font-black">${s.rice}</span> Rice</div>
                                    <div class="text-[10px] font-bold text-white/60"><span class="text-white font-black">${s.noRice}</span> N-Rice</div>
                                </div>

                                <div class="max-h-[140px] overflow-y-auto mb-3 bg-[#09090b] border border-white/[0.04] p-2 rounded-[10px] disable-scrollbars">
                                    ${logHtml}
                                </div>
                                
                                <div class="flex gap-2">
                                    <button class="btn-toggle-status flex-1 py-2.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest active-scale transition-colors ${isActive ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-telegram/20 text-telegram'}" data-id="${s.id}" data-status="${s.status}">
                                        ${isActive ? 'Suspend' : 'Reactivate'}
                                    </button>
                                    <button class="btn-receipt flex-1 py-2.5 rounded-[10px] text-white font-black text-[10px] uppercase tracking-widest active-scale flex items-center justify-center gap-1.5 transition-colors bg-emerald-600 hover:bg-emerald-500" data-student='${JSON.stringify(s).replace(/'/g, "&#39;")}'>
                                        <i data-lucide="share" class="w-3 h-3 pointer-events-none"></i> Share Bill
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    refreshIcons();
    attachActionListeners();
    attachPerfectSwipePhysics();
}

function attachActionListeners() {
    const listEl = document.getElementById('dir-list');

    listEl.querySelectorAll('.dir-accordion-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const surface = btn.closest('.swipe-surface');
            // Prevent expand if card is swiped open
            if (surface.classList.contains('delete-mode')) {
                surface.style.transform = 'translateX(0px)';
                surface.classList.remove('delete-mode');
                return;
            }

            triggerHaptic('light');
            const content = btn.nextElementSibling;
            const isOpen = content.classList.contains('grid-rows-[1fr]');
            
            // Close all others
            listEl.querySelectorAll('.dir-accordion-content').forEach(c => {
                c.classList.remove('grid-rows-[1fr]');
                c.classList.add('grid-rows-[0fr]');
            });
            
            if (!isOpen) {
                content.classList.remove('grid-rows-[0fr]');
                content.classList.add('grid-rows-[1fr]');
            }
        });
    });

    listEl.querySelectorAll('.btn-execute-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            triggerHaptic('heavy');
            const id = btn.getAttribute('data-id');
            const cardWrapper = e.target.closest('.dir-card-wrapper');

            // Visual Collapse Animation
            cardWrapper.style.transition = 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
            cardWrapper.style.opacity = '0';
            cardWrapper.style.height = '0px';
            cardWrapper.style.marginBottom = '0px';
            cardWrapper.style.border = 'none';
            
            // Optimistic Cache Removal
            directoryCache = directoryCache.filter(s => s.id !== id);
            setTimeout(() => cardWrapper.remove(), 300);

            const res = await deleteStudent(id);
            if (!res.success) {
                showToast("Failed to vaporize.", "error");
                loadDirectoryData(); // Silent revert
            } else {
                showToast("Member Vaporized.", "success");
            }
        });
    });

    // Share Receipt & Suspend logic remains unchanged from functional core...
    listEl.querySelectorAll('.btn-toggle-status').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); 
            triggerHaptic('heavy');
            const id = btn.getAttribute('data-id');
            const currentStatus = btn.getAttribute('data-status');
            const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

            const studentIndex = directoryCache.findIndex(s => s.id === id);
            if (studentIndex > -1) directoryCache[studentIndex].status = newStatus;
            renderDirectory(document.getElementById('dir-search').value);

            await supabase.from('profiles').update({ status: newStatus }).eq('id', id);
        });
    });

    listEl.querySelectorAll('.btn-receipt').forEach(btn => {
        btn.addEventListener('click', async () => {
            triggerHaptic('light');
            const s = JSON.parse(btn.getAttribute('data-student'));
            const monthName = new Date(currentMonth + "-01").toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            
            let logBlock = "```text\nDate  | L | D\n-------------\n";
            s.logs.forEach(l => {
                const dPart = l.date.split('-')[2];
                const lunch = l.dayStr === '--' ? 'X' : '✓';
                const dinner = l.nightStr === '--' ? 'X' : '✓';
                logBlock += `${dPart} ${monthName.substring(0,3)} | ${lunch} | ${dinner}\n`;
            });
            logBlock += "```";

            const epochHash = btoa(`${s.id}-${Date.now()}`).substring(0, 6).toUpperCase();

            let text = `🧾 *MESS BILL*\n🗓️ *${monthName}*\n👤 *${s.name}*\n\n`;
            text += `*💰 FINANCIALS*\n• Rate/Meal: ₹${liveMealRate.toFixed(2)}\n• Total Bill: ₹${Math.round(s.totalBill).toLocaleString('en-IN')}\n• Advances: ₹${s.stuAdvance.toLocaleString('en-IN')}\n• *Final Dues: ₹${Math.round(Math.abs(s.remainingDues)).toLocaleString('en-IN')}*\n\n`;
            text += `*📅 ATTENDANCE LOG*\n${logBlock}\n\n🔒 _Hash: ${epochHash}_`;

            if (navigator.share) {
                try { await navigator.share({ text: text }); } catch (err) {}
            } else {
                navigator.clipboard.writeText(text);
                showToast("Receipt copied!");
            }
        });
    });
}

// --- 🧠 FLAWLESS JS TOUCH PHYSICS (Locks vertical scroll safely) ---
function attachPerfectSwipePhysics() {
    const surfaces = document.querySelectorAll('.swipe-surface');
    
    surfaces.forEach(surface => {
        let startX = 0, startY = 0, isDragging = false, isScrolling = false;
        
        surface.addEventListener('touchstart', (e) => {
            // Prevent swiping if interacting with internal accordion buttons
            if(e.target.closest('.dir-accordion-content')) return;
            
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
            isScrolling = false;
            surface.style.transition = 'none'; 
        }, { passive: true });

        surface.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            let dx = e.touches[0].clientX - startX;
            let dy = e.touches[0].clientY - startY;

            // Strict Axis Locking: If moving vertically more than horizontally, it's a scroll
            if (!isScrolling && Math.abs(dy) > Math.abs(dx)) {
                isScrolling = true;
                isDragging = false;
                surface.style.transform = `translateX(0px)`;
                return;
            }

            if (!isScrolling) {
                // Only allow Right-to-Left swipe (negative dx)
                if (dx < 0) {
                    // Cap the pull at 90px max stretch
                    let tx = Math.max(dx, -90);
                    surface.style.transform = `translateX(${tx}px)`;
                } else {
                    surface.style.transform = `translateX(0px)`;
                }
            }
        }, { passive: true });

        surface.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            surface.style.transition = 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)';

            let dx = e.changedTouches[0].clientX - startX;

            // If pulled more than 45px, snap open
            if (dx < -45) {
                triggerHaptic('light');
                surface.style.transform = `translateX(-80px)`; // Exact width of delete button
                surface.classList.add('delete-mode');
            } else {
                surface.style.transform = `translateX(0px)`;
                surface.classList.remove('delete-mode');
            }
        });
    });
}

// --- 🧠 ZERO-LATENCY OPTIMISTIC PIPELINE ---
function openAddStudentModal() {
    triggerHaptic('light');
    showModal({
        title: "Onboard Member",
        message: "Add a new resident to the mess matrix.",
        type: "info",
        confirmText: "Create Profile",
        onConfirm: async (closeModal) => {
            const name = document.getElementById('new-stu-name').value.trim();
            const phone = document.getElementById('new-stu-phone').value.trim();
            const room = document.getElementById('new-stu-room').value.trim();
            const pin = document.getElementById('new-stu-pin').value.trim();
            
            if(!name || phone.length !== 10 || pin.length !== 4) return showToast("Check phone (10) and PIN (4).", "error");
            
            if (closeModal) closeModal();
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // 1. Instant UI Injection (Zero Latency)
            const tempId = 'temp-' + Date.now();
            directoryCache.unshift({
                id: tempId, name, phone, room, pin_hash: pin, status: 'ACTIVE',
                stuMeals: 0, stuAdvance: 0, remainingDues: 0, totalBill: 0, logs: [], rice: 0, noRice: 0
            });
            
            // Re-render instantly without the global loading spinner
            renderDirectory(document.getElementById('dir-search').value);

            // 2. Silent Background Sync
            const res = await addStudent(name, phone, pin, room);
            if(res.success) { 
                showToast("Profile synced securely.", "success");
                // Silently fetch and update cache without disrupting the UI
                const d = await fetchDirectory();
                if (d.success) directoryCache = d.students; 
            } else {
                showToast("Creation failed. Network error.", "error");
                directoryCache = directoryCache.filter(s => s.id !== tempId);
                renderDirectory();
            }
        }
    });

    // Highly Visible, Solid Background Dark Inputs
    setTimeout(() => {
        document.querySelector('#custom-modal p').insertAdjacentHTML('afterend', `
            <div class="w-full space-y-3 mb-4 mt-5 text-left">
                <input type="text" id="new-stu-name" autocomplete="name" placeholder="Full Name" class="w-full bg-[#1c1c1e] text-[14px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3.5 text-white placeholder-white/40 focus:border-telegram transition-colors shadow-inner">
                <input type="tel" inputmode="numeric" pattern="[0-9]*" id="new-stu-phone" autocomplete="tel" maxlength="10" placeholder="10-Digit Mobile" class="w-full bg-[#1c1c1e] text-[14px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3.5 text-white placeholder-white/40 focus:border-telegram transition-colors shadow-inner">
                <div class="flex gap-3">
                    <input type="text" id="new-stu-room" autocomplete="off" placeholder="Room No." class="w-full bg-[#1c1c1e] text-[14px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3.5 text-white placeholder-white/40 focus:border-telegram transition-colors shadow-inner">
                    <input type="tel" inputmode="numeric" pattern="[0-9]*" id="new-stu-pin" maxlength="4" placeholder="4-Digit PIN" class="w-full bg-[#1c1c1e] text-[14px] font-black tracking-[0.3em] text-center outline-none border border-white/10 rounded-[12px] px-4 py-3.5 text-telegram placeholder-white/40 placeholder:tracking-normal focus:border-telegram transition-colors shadow-inner">
                </div>
            </div>
        `);
        
        const enforceNum = (e) => e.target.value = e.target.value.replace(/[^0-9]/g, '');
        document.getElementById('new-stu-phone').addEventListener('input', enforceNum);
        document.getElementById('new-stu-pin').addEventListener('input', enforceNum);
        document.getElementById('new-stu-name').focus();
    }, 10);
}
