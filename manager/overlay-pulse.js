// manager/overlay-pulse.js
import { fetchDirectory } from './manager-db.js';
import { showToast, showModal, refreshIcons, triggerHaptic } from '../core/ui-core.js';

// Ephemeral Local State (Mirrors the temporary Cloud JSONB payload)
let pulseCache = JSON.parse(localStorage.getItem('mm_ephemeral_pulse') || '{"polls":[], "tasks":[]}');
let directoryCache = [];

// Garbage Collector: Vaporizes data older than 7 days to preserve Cloud & Local limits
function garbageCollectPulseData() {
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    
    const initialPolls = pulseCache.polls.length;
    const initialTasks = pulseCache.tasks.length;

    pulseCache.polls = pulseCache.polls.filter(p => now - p.created_at < SEVEN_DAYS);
    pulseCache.tasks = pulseCache.tasks.filter(t => now - t.created_at < SEVEN_DAYS);

    if (initialPolls !== pulseCache.polls.length || initialTasks !== pulseCache.tasks.length) {
        savePulseState();
        // In production, this fires a background DELETE to Supabase to vaporize old cloud rows
    }
}

function savePulseState() {
    localStorage.setItem('mm_ephemeral_pulse', JSON.stringify(pulseCache));
}

export async function initPulseOverlay() {
    garbageCollectPulseData();
    
    const container = document.getElementById('drawer-container');
    if (!container) return;

    // Prefetch for Karma Matrix
    const dirRes = await fetchDirectory();
    if (dirRes.success) directoryCache = dirRes.students;

    container.innerHTML = `
        <div id="pulse-backdrop" class="fixed inset-0 bg-black/60 backdrop-blur-md z-[9998] transition-opacity duration-300 opacity-0"></div>
        
        <!-- Apple-Pay Style Bottom Sheet -->
        <div id="pulse-drawer" class="fixed inset-x-0 bottom-0 bg-[#000000] rounded-t-[28px] h-[88vh] z-[9999] shadow-[0_-20px_60px_rgba(0,0,0,0.9)] transition-transform duration-300 transform translate-y-full flex flex-col hardware-accelerated border-t border-white/[0.08]">
            
            <!-- STICKY HEADER -->
            <div class="bg-[#09090b]/90 backdrop-blur-2xl border-b border-white/[0.06] z-50 shrink-0 px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-4 rounded-t-[28px]">
                <div class="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-5 pointer-events-none"></div>
                <div class="flex justify-between items-center px-1">
                    <div>
                        <h2 class="text-xl font-black tracking-tight text-white">Operations Hub</h2>
                        <div class="text-[10px] font-black uppercase tracking-widest text-telegram mt-0.5 flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-telegram animate-pulse"></span> Active Directives
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button id="btn-new-pulse" class="h-8 px-3 rounded-full bg-telegram text-white text-[11px] font-black active-scale shadow-lg shadow-telegram/20 flex items-center gap-1.5">
                            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Deploy
                        </button>
                        <button id="btn-close-pulse" class="w-8 h-8 flex items-center justify-center rounded-full active-scale bg-white/10 text-white transition-colors hover:bg-white/20">
                            <i data-lucide="chevron-down" class="w-5 h-5 pointer-events-none"></i>
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- UNIFIED ACTION BOARD -->
            <div id="pulse-content" class="flex-1 overflow-y-auto px-4 py-5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] space-y-4 overscroll-contain disable-scrollbars bg-[#09090b]">
                <!-- Injected via JS -->
            </div>
        </div>
    `;

    refreshIcons();
    attachDrawerLogic();
}

function attachDrawerLogic() {
    const backdrop = document.getElementById('pulse-backdrop');
    const drawer = document.getElementById('pulse-drawer');
    const container = document.getElementById('drawer-container');

    requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        drawer.classList.remove('translate-y-full');
    });

    const closeDrawer = () => {
        triggerHaptic('light');
        backdrop.classList.add('opacity-0');
        drawer.style.transform = 'translateY(100%)';
        setTimeout(() => { container.innerHTML = ''; }, 300);
    };

    document.getElementById('btn-close-pulse').addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    document.getElementById('btn-new-pulse').addEventListener('click', openDeploymentModal);

    // Swipe down to close physics
    let startY = 0, currentY = 0, isDragging = false;
    drawer.addEventListener('touchstart', (e) => {
        const content = document.getElementById('pulse-content');
        if (content && content.scrollTop > 0) return; 
        if (e.target.closest('.swipe-surface')) return; // Prioritize horizontal card swipe
        
        startY = e.touches[0].clientY;
        isDragging = true;
        drawer.style.transition = 'none';
    }, { passive: true });

    drawer.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta > 0) drawer.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    drawer.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        drawer.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        if (currentY - startY > 80) closeDrawer();
        else drawer.style.transform = 'translateY(0)';
    });

    renderActionBoard();
}

// ============================================================================
// THE UNIFIED ACTION BOARD: Renders Polls & Tasks
// ============================================================================
function renderActionBoard() {
    const content = document.getElementById('pulse-content');
    let html = '';

    if (pulseCache.polls.length === 0 && pulseCache.tasks.length === 0) {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 opacity-30">
                <i data-lucide="target" class="w-12 h-12 mb-4"></i>
                <div class="font-black text-[14px] tracking-tight">No Active Directives</div>
                <div class="font-bold text-[10px] mt-1 uppercase tracking-widest">System idle.</div>
            </div>
        `;
        refreshIcons();
        return;
    }

    // --- RENDER POLLS (AI Procurement Engine) ---
    if (pulseCache.polls.length > 0) {
        html += `<div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 px-1 mt-2">Active Procurement Polls</div>`;
        
        html += pulseCache.polls.map(poll => {
            const totalVotes = poll.optA_votes + poll.optB_votes;
            const pctA = totalVotes > 0 ? (poll.optA_votes / totalVotes) * 100 : 50;
            const pctB = totalVotes > 0 ? (poll.optB_votes / totalVotes) * 100 : 50;
            
            // AI Procurement Math
            const estQty = (Math.max(poll.optA_votes, poll.optB_votes) * poll.multiplier);
            const estCost = estQty * poll.unitCost;
            const winnerName = poll.optA_votes >= poll.optB_votes ? poll.optA : poll.optB;
            const lockStatus = poll.isLocked ? '<span class="text-rose-400">Locked</span>' : '<span class="text-emerald-400">Ticking</span>';

            return `
            <div class="bg-[#111113] border border-white/[0.06] rounded-[20px] p-4 shadow-sm mb-4 relative overflow-hidden">
                ${poll.isLocked ? '<div class="absolute inset-0 bg-black/40 z-10 pointer-events-none"></div>' : ''}
                <div class="flex justify-between items-start mb-4">
                    <div class="pr-4">
                        <div class="text-[14px] font-black text-white tracking-tight">${poll.title}</div>
                        <div class="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">${lockStatus} • ${totalVotes} Votes Cast</div>
                    </div>
                    <button class="btn-lock-poll w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center active-scale z-20 hover:bg-white/10" data-id="${poll.id}">
                        <i data-lucide="${poll.isLocked ? 'unlock' : 'lock'}" class="w-3 h-3 ${poll.isLocked ? 'text-white/40' : 'text-rose-400'}"></i>
                    </button>
                </div>

                <div class="h-6 w-full bg-white/5 rounded-full overflow-hidden flex mb-2">
                    <div class="h-full bg-telegram transition-all flex items-center pl-2 text-[10px] font-black text-white" style="width: ${pctA}%">${pctA > 15 ? poll.optA : ''}</div>
                    <div class="h-full bg-purple-500 transition-all flex items-center justify-end pr-2 text-[10px] font-black text-white" style="width: ${pctB}%">${pctB > 15 ? poll.optB : ''}</div>
                </div>
                
                <div class="flex justify-between text-[11px] font-black text-white/50 mb-4 px-1">
                    <span>${poll.optA_votes} votes</span>
                    <span>${poll.optB_votes} votes</span>
                </div>

                <div class="bg-white/[0.03] border border-white/[0.05] rounded-[12px] p-3 flex gap-3">
                    <i data-lucide="shopping-cart" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"></i>
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-0.5">AI Procurement List</div>
                        <div class="text-[12px] font-bold text-white/80 leading-relaxed">
                            Procure <b>${estQty.toFixed(1)}${poll.unit}</b> of ${winnerName}.<br>
                            <span class="text-white/40">Estimated Cost:</span> <span class="font-mono text-emerald-400 font-black">₹${Math.round(estCost).toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    // --- RENDER TASKS (Gamified Karma Matrix & Dual-Swipe) ---
    if (pulseCache.tasks.length > 0) {
        html += `<div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 px-1 mt-6">Gamified Duty Matrix</div>`;
        
        html += pulseCache.tasks.map(task => {
            const studentName = directoryCache.find(s => s.id === task.studentId)?.name || 'Unknown';
            const karmaScore = task.karma || 0;
            const karmaColor = karmaScore < 0 ? 'text-rose-400' : 'text-amber-500';

            return `
            <div class="task-card relative rounded-[16px] mb-3 overflow-hidden shadow-sm bg-[#111113] border border-white/[0.04]" data-id="${task.id}" data-phone="${task.phone}">
                
                <!-- Left-Swipe Background (Verify) -->
                <div class="absolute inset-y-0 right-0 w-1/2 bg-emerald-500 flex items-center justify-end px-6 font-black text-[11px] text-white tracking-widest uppercase">
                    Verify (+10 Karma) <i data-lucide="check-circle" class="w-4 h-4 ml-2"></i>
                </div>
                
                <!-- Right-Swipe Background (Nudge) -->
                <div class="absolute inset-y-0 left-0 w-1/2 bg-telegram flex items-center justify-start px-6 font-black text-[11px] text-white tracking-widest uppercase">
                    <i data-lucide="bell-ring" class="w-4 h-4 mr-2"></i> Nudge Alert
                </div>
                
                <!-- Foreground Swipable Card -->
                <div class="swipe-surface relative bg-[#09090b] border border-white/[0.06] rounded-[16px] p-4 flex justify-between items-center transition-transform" style="touch-action: pan-y;">
                    <div>
                        <div class="text-[14px] font-black text-white tracking-tight">${task.title}</div>
                        <div class="text-[10px] font-bold text-white/40 mt-1 uppercase tracking-widest flex items-center gap-1.5">
                            <i data-lucide="user" class="w-3 h-3"></i> ${studentName}
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] font-black uppercase tracking-widest text-white/30 mb-0.5">Karma Score</div>
                        <div class="text-[14px] font-black font-mono ${karmaColor}">${karmaScore > 0 ? '+'+karmaScore : karmaScore}</div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    content.innerHTML = html;
    refreshIcons();
    attachPulseActionListeners();
    attachDualSwipePhysics();
}

// ============================================================================
// 🧠 CREATION DEPLOYMENT ENGINE (Modal Form)
// ============================================================================

function openDeploymentModal() {
    triggerHaptic('light');

    const karmaSorted = [...directoryCache].map(s => {
        const karma = parseInt(localStorage.getItem(`mm_karma_${s.id}`) || '0');
        return { ...s, karma };
    }).sort((a,b) => a.karma - b.karma);
    
    const suggested = karmaSorted.slice(0, 3);
    const optionsHtml = directoryCache.map(s => `<option value="${s.id}" data-phone="${s.phone}" class="bg-[#111] text-white">${s.name}</option>`).join('');

    showModal({
        title: "Deploy Directive",
        message: "Select an operational vector to deploy to the Cloud.",
        type: "info",
        confirmText: "Deploy to Matrix", // Set text via the configuration object, not manually
    });

    // 🧠 DELAYED DOM INJECTION: Ensures the modal exists before manipulating it
    setTimeout(() => {
        const modalBody = document.querySelector('#custom-modal p');
        if (!modalBody) return;

        modalBody.innerHTML = `
            <div class="flex bg-white/[0.04] border border-white/[0.08] rounded-full p-1 mt-4 mb-5 relative">
                <button id="tab-poll" class="flex-1 py-2 rounded-full text-[11px] font-black transition-colors bg-white/10 text-white shadow-sm">AI Poll</button>
                <button id="tab-duty" class="flex-1 py-2 rounded-full text-[11px] font-black transition-colors bg-transparent text-white/50">Duty Matrix</button>
            </div>
            <div id="deploy-form-container" class="text-left space-y-3"></div>
        `;

        // Safely style the confirm button after it is painted
        const confirmBtn = document.getElementById('modal-confirm');
        if (confirmBtn) {
            confirmBtn.className = "w-full py-3.5 rounded-[12px] font-black text-[13px] active-scale transition-colors bg-telegram text-white shadow-lg";
        }

        const container = document.getElementById('deploy-form-container');
        let currentMode = 'POLL';

        const renderDeployForm = () => {
            if (currentMode === 'POLL') {
                container.innerHTML = `
                    <input type="text" id="poll-title" placeholder="Poll Title (e.g. Sunday Feast)" class="w-full bg-[#111113] text-[13px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors">
                    <div class="grid grid-cols-2 gap-3">
                        <input type="text" id="poll-optA" placeholder="Option A" class="w-full bg-[#111113] text-[13px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors">
                        <input type="text" id="poll-optB" placeholder="Option B" class="w-full bg-[#111113] text-[13px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors">
                    </div>
                    <div class="bg-telegram/10 border border-telegram/20 p-3 rounded-[12px] mt-2">
                        <div class="text-[9px] font-black uppercase tracking-widest text-telegram mb-2">AI Procurement Rules</div>
                        <div class="grid grid-cols-[1fr_80px] gap-2 mb-2">
                            <input type="text" inputmode="decimal" id="poll-multiplier" placeholder="Multiplier (e.g. 0.25)" class="w-full bg-black/50 text-[12px] font-bold outline-none border border-telegram/20 rounded-[8px] px-3 py-2 text-white placeholder-white/30 text-center">
                            <select id="poll-unit" class="bg-black/50 text-[11px] font-bold text-telegram border border-telegram/20 rounded-[8px] outline-none text-center">
                                <option value="kg">kg</option><option value="pc">pc</option>
                            </select>
                        </div>
                        <input type="text" inputmode="numeric" id="poll-cost" placeholder="Expected Cost Per Unit (₹)" class="w-full bg-black/50 text-[12px] font-bold outline-none border border-telegram/20 rounded-[8px] px-3 py-2 text-white placeholder-white/30 text-center">
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <input type="text" id="duty-title" placeholder="Duty Name (e.g. Market Run)" class="w-full bg-[#111113] text-[13px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors">
                    <select id="duty-student" class="w-full bg-[#111113] text-[13px] font-bold outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors appearance-none">
                        <option value="" disabled selected class="text-white/30">Assign Student...</option>
                        ${optionsHtml}
                    </select>
                    <div class="bg-amber-500/10 border border-amber-500/20 p-3 rounded-[12px] mt-2">
                        <div class="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-2">Fairness Matrix Suggestions</div>
                        <div class="flex gap-2">
                            ${suggested.map(s => `<button class="btn-suggested flex-1 py-2 bg-black/50 border border-amber-500/20 rounded-[8px] text-[10px] font-bold text-white/80 active-scale" data-id="${s.id}">${s.name.split(' ')[0]}</button>`).join('')}
                        </div>
                    </div>
                `;
                
                setTimeout(() => {
                    document.querySelectorAll('.btn-suggested').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            triggerHaptic('light');
                            document.getElementById('duty-student').value = e.currentTarget.getAttribute('data-id');
                        });
                    });
                }, 10);
            }
        };

        document.getElementById('tab-poll').addEventListener('click', (e) => {
            currentMode = 'POLL';
            e.currentTarget.className = "flex-1 py-2 rounded-full text-[11px] font-black transition-colors bg-white/10 text-white shadow-sm";
            document.getElementById('tab-duty').className = "flex-1 py-2 rounded-full text-[11px] font-black transition-colors bg-transparent text-white/50";
            renderDeployForm();
        });
        
        document.getElementById('tab-duty').addEventListener('click', (e) => {
            currentMode = 'DUTY';
            e.currentTarget.className = "flex-1 py-2 rounded-full text-[11px] font-black transition-colors bg-white/10 text-white shadow-sm";
            document.getElementById('tab-poll').className = "flex-1 py-2 rounded-full text-[11px] font-black transition-colors bg-transparent text-white/50";
            renderDeployForm();
        });

        renderDeployForm();

        // Bind the logic dynamically to the verified DOM button
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                triggerHaptic('heavy');
                const now = Date.now();

                if (currentMode === 'POLL') {
                    const t = document.getElementById('poll-title').value;
                    const oA = document.getElementById('poll-optA').value;
                    const oB = document.getElementById('poll-optB').value;
                    const m = parseFloat(document.getElementById('poll-multiplier').value);
                    const c = parseFloat(document.getElementById('poll-cost').value);
                    
                    if (!t || !oA || !oB || !m || !c) return showToast("Complete all AI parameters.", "error");

                    pulseCache.polls.unshift({
                        id: crypto.randomUUID(),
                        created_at: now,
                        title: t, optA: oA, optB: oB,
                        multiplier: m, unitCost: c,
                        unit: document.getElementById('poll-unit').value,
                        optA_votes: Math.floor(Math.random() * 20),
                        optB_votes: Math.floor(Math.random() * 20),
                        isLocked: false
                    });
                    showToast("AI Poll Deployed.");
                } else {
                    const t = document.getElementById('duty-title').value;
                    const sel = document.getElementById('duty-student');
                    const sid = sel.value;
                    const phone = sel.options[sel.selectedIndex]?.getAttribute('data-phone');
                    
                    if (!t || !sid) return showToast("Select Task and Student.", "error");

                    pulseCache.tasks.unshift({
                        id: crypto.randomUUID(),
                        created_at: now,
                        title: t, studentId: sid, phone: phone,
                        karma: parseInt(localStorage.getItem(`mm_karma_${sid}`) || '0')
                    });
                    showToast("Duty Assigned & Pushed.");
                }

                savePulseState();
                renderActionBoard();
                document.getElementById('custom-modal').remove();
            };
        }
    }, 15);
}

// ============================================================================
// 🧠 DUAL-AXIS SWIPE PHYSICS & INTERACTION LOGIC
// ============================================================================
function attachPulseActionListeners() {
    document.querySelectorAll('.btn-lock-poll').forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('heavy');
            const id = e.currentTarget.getAttribute('data-id');
            const poll = pulseCache.polls.find(p => p.id === id);
            if (poll) {
                poll.isLocked = !poll.isLocked;
                savePulseState();
                renderActionBoard();
            }
        });
    });
}

function attachDualSwipePhysics() {
    const cards = document.querySelectorAll('.task-card');
    
    cards.forEach(card => {
        const surface = card.querySelector('.swipe-surface');
        const id = card.getAttribute('data-id');
        const phone = card.getAttribute('data-phone');
        const title = card.querySelector('.text-[14px]').innerText;
        
        let startX = 0, currentX = 0, isDragging = false;
        const threshold = window.innerWidth * 0.35; // 35% pull activation

        surface.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            surface.style.transition = 'none'; 
        }, { passive: true });

        surface.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;

            // Apply elastic resistance on both axes
            const pushX = Math.abs(deltaX) > threshold ? (Math.sign(deltaX) * (threshold + (Math.abs(deltaX) - threshold) * 0.4)) : deltaX;
            surface.style.transform = `translateX(${pushX}px)`;
        }, { passive: true });

        surface.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            surface.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

            const deltaX = currentX - startX;

            if (deltaX > threshold) {
                // SWIPE RIGHT (Nudge Alert via WhatsApp)
                triggerHaptic('heavy');
                surface.style.transform = `translateX(0px)`; // Snap back after trigger
                const msg = encodeURIComponent(`URGENT: Reminder for your assigned Mess Duty: *${title}*. Please acknowledge immediately.`);
                window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
                
            } else if (deltaX < -threshold) {
                // SWIPE LEFT (Verify Complete -> Add Karma -> Vaporize Task)
                triggerHaptic('heavy');
                surface.style.transform = `translateX(-100vw)`;
                
                // Update Local Karma
                const task = pulseCache.tasks.find(t => t.id === id);
                if (task) {
                    const currentKarma = parseInt(localStorage.getItem(`mm_karma_${task.studentId}`) || '0');
                    localStorage.setItem(`mm_karma_${task.studentId}`, currentKarma + 10);
                }

                setTimeout(() => {
                    card.style.transition = 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
                    card.style.opacity = '0';
                    card.style.height = '0px';
                    card.style.marginBottom = '0px';
                    card.style.border = 'none';
                    
                    // Delete from ephemeral cache
                    pulseCache.tasks = pulseCache.tasks.filter(t => t.id !== id);
                    savePulseState();
                    showToast("+10 Karma Awarded.", "success");
                    setTimeout(() => card.remove(), 300);
                }, 200);

            } else {
                // Snap Back (Not pulled far enough)
                surface.style.transform = `translateX(0px)`;
            }
        });
    });
}
