// manager/overlay-comms.js
import { fetchAllAnnouncements, createAnnouncement, deleteAnnouncement, fetchDirectory } from './manager-db.js';
import { showToast, refreshIcons, triggerHaptic } from '../core/ui-core.js';

let commsCache = []; 
let directoryCache = [];
let activeTab = 'OUTBOX'; 

export async function initCommsOverlay() {
    const container = document.getElementById('drawer-container');
    if (!container) return;

    const dirRes = await fetchDirectory();
    if (dirRes.success) directoryCache = dirRes.students;

    container.innerHTML = `
        <div id="comms-backdrop" class="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] transition-opacity duration-300 opacity-0"></div>
        
        <!-- Native 95dvh Height: Anchors perfectly, lets OS handle keyboard -->
        <div id="comms-drawer" class="fixed inset-x-0 bottom-0 h-[95dvh] bg-[#000000] rounded-t-[24px] z-[101] shadow-[0_-20px_50px_rgba(0,0,0,0.9)] transition-transform duration-300 transform translate-y-full flex flex-col hardware-accelerated border-t border-white/[0.08]">
            
            <!-- STICKY HEADER -->
            <div class="bg-[#09090b]/95 backdrop-blur-2xl border-b border-white/[0.06] z-50 shrink-0 px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-4 rounded-t-[24px]">
                <div class="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-5 pointer-events-none"></div>
                <div class="flex justify-between items-center px-1">
                    <div>
                        <h2 class="text-xl font-black tracking-tight text-white">Broadcast Hub</h2>
                        <p class="text-[11px] font-bold text-telegram uppercase tracking-widest mt-0.5" id="ai-status">System Ready</p>
                    </div>
                    <button id="btn-close-comms" class="ripple-btn w-8 h-8 flex items-center justify-center rounded-full active-scale bg-white/10 text-white transition-colors hover:bg-white/20">
                        <i data-lucide="chevron-down" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                </div>

                <!-- Robust Segmented Control -->
                <div class="flex p-1 bg-white/[0.03] border border-white/[0.06] rounded-[14px] mt-5">
                    <button id="tab-inbox" class="flex-1 py-2 text-[12px] font-black rounded-[10px] transition-colors bg-transparent text-white/40">Admin Inbox</button>
                    <button id="tab-outbox" class="flex-1 py-2 text-[12px] font-black rounded-[10px] transition-colors bg-white/10 text-white shadow-sm">Compose</button>
                </div>
            </div>
            
            <!-- DUAL-DOM CACHED VIEWS -->
            <div id="view-inbox" class="hidden flex-1 overflow-y-auto px-5 py-5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] space-y-3 overscroll-contain disable-scrollbars"></div>
            <div id="view-outbox" class="flex-1 overflow-y-auto px-5 py-5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] space-y-4 overscroll-contain disable-scrollbars"></div>
        </div>
    `;

    refreshIcons();
    attachDrawerLogic();
}

function attachDrawerLogic() {
    const backdrop = document.getElementById('comms-backdrop');
    const drawer = document.getElementById('comms-drawer');
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

    document.getElementById('btn-close-comms').addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);

    // Swipe down physics to close
    let startY = 0, currentY = 0, isDragging = false;
    drawer.addEventListener('touchstart', (e) => {
        const vIn = document.getElementById('view-inbox');
        const vOut = document.getElementById('view-outbox');
        
        // Prevent accidental closing while interacting with UI internals
        if ((vIn && vIn.scrollTop > 0) || (vOut && vOut.scrollTop > 0) || e.target.closest('#custom-dropdown') || e.target.closest('textarea')) return; 
        
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
        if (currentY - startY > 100) closeDrawer();
        else drawer.style.transform = 'translateY(0)';
    });

    document.getElementById('tab-inbox').addEventListener('click', () => switchTab('INBOX'));
    document.getElementById('tab-outbox').addEventListener('click', () => switchTab('OUTBOX'));

    renderOutboxDOM();
    loadCommsData(); 
}

function switchTab(tab) {
    if (activeTab === tab) return;
    triggerHaptic('light');
    activeTab = tab;
    
    const btnIn = document.getElementById('tab-inbox');
    const btnOut = document.getElementById('tab-outbox');
    const viewInbox = document.getElementById('view-inbox');
    const viewOutbox = document.getElementById('view-outbox');

    if (tab === 'INBOX') {
        btnIn.className = "flex-1 py-2 text-[12px] font-black rounded-[10px] transition-colors bg-white/10 text-white shadow-sm";
        btnOut.className = "flex-1 py-2 text-[12px] font-black rounded-[10px] transition-colors bg-transparent text-white/40";
        viewOutbox.classList.add('hidden');
        viewInbox.classList.remove('hidden');
    } else {
        btnOut.className = "flex-1 py-2 text-[12px] font-black rounded-[10px] transition-colors bg-white/10 text-white shadow-sm";
        btnIn.className = "flex-1 py-2 text-[12px] font-black rounded-[10px] transition-colors bg-transparent text-white/40";
        viewInbox.classList.add('hidden');
        viewOutbox.classList.remove('hidden');
    }
}

// ==========================================
// OUTBOX: INTELLIGENT AI BROADCASTER
// ==========================================
function renderOutboxDOM() {
    const viewOutbox = document.getElementById('view-outbox');
    const offset = new Date().getTimezoneOffset() * 60000;
    const defaultExpiry = (new Date(Date.now() - offset + 24 * 60 * 60 * 1000)).toISOString().slice(0, 16);

    let draftMsg = '';
    try {
        const draft = JSON.parse(localStorage.getItem('mm_comms_draft'));
        if (draft && draft.msg) draftMsg = draft.msg;
    } catch(e){}

    viewOutbox.innerHTML = `
        <div class="bg-[#09090b] border border-white/[0.06] p-5 rounded-[20px] shadow-sm">
            
            <select id="comms-audience" class="w-full bg-white/[0.03] text-[14px] font-bold outline-none border border-white/10 rounded-[12px] px-3 py-3.5 focus:border-telegram/50 transition-colors text-white mb-4 appearance-none">
                <option value="ALL" class="bg-[#111] text-white">Broadcast: All Students</option>
                <option value="DEFAULTERS" class="bg-[#111] text-rose-400">Target: Defaulters Only</option>
                <option value="ROOM" class="bg-[#111] text-telegram">Target: Specific Room</option>
                <option value="INDIVIDUAL" class="bg-[#111] text-amber-500">Target: Single Individual</option>
            </select>

            <div id="room-input-container" class="hidden mb-4">
                <input type="text" id="comms-room" placeholder="Enter Target Room (e.g., 201)" class="w-full bg-transparent text-[14px] font-bold outline-none border-b border-telegram/30 py-2.5 text-white placeholder-white/30 focus:border-telegram transition-colors">
            </div>

            <!-- Native Absolute Autocomplete (Zero Layout Dancing) -->
            <div id="individual-input-container" class="hidden mb-4 relative">
                <input type="text" id="comms-individual" placeholder="Search by Name or Room..." autocomplete="off" class="w-full bg-transparent text-[14px] font-bold outline-none border-b border-amber-500/30 py-2.5 text-amber-500 placeholder-white/30 focus:border-amber-500 transition-colors">
                
                <div id="custom-dropdown" class="absolute top-[100%] left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#111113]/95 backdrop-blur-3xl border border-white/10 rounded-[12px] shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[60] hidden flex-col disable-scrollbars"></div>
            </div>

            <!-- Textarea -->
            <div class="relative bg-white/[0.02] border border-white/10 rounded-[12px] focus-within:border-telegram/50 transition-colors mb-5">
                <textarea id="comms-message" placeholder="Compose alert..." class="w-full bg-transparent text-[14px] font-medium outline-none resize-none text-white placeholder-white/30 p-3.5 block min-h-[120px]" maxlength="300">${draftMsg}</textarea>
                <div class="absolute bottom-2 right-3 text-[10px] font-black tracking-widest text-white/30"><span id="char-count">${draftMsg.length}</span>/300</div>
            </div>
            
            <div class="grid grid-cols-2 gap-3 mb-6">
                <div>
                    <label class="text-[9px] font-black uppercase tracking-widest block mb-1 text-white/40">Lifespan</label>
                    <input type="datetime-local" id="comms-expiry" value="${defaultExpiry}" class="bg-transparent border-b border-white/10 py-2.5 text-[12px] font-bold outline-none w-full text-white focus:border-telegram/50">
                </div>
                <div id="priority-container" class="transition-colors border-b border-white/10 focus-within:border-telegram/50">
                    <label class="text-[9px] font-black uppercase tracking-widest block mb-1 text-white/40">Urgency</label>
                    <select id="comms-priority" class="w-full bg-transparent py-2.5 text-[12px] font-bold outline-none text-white appearance-none">
                        <option value="DISMISSIBLE" class="bg-[#111] text-white">Standard</option>
                        <option value="CRITICAL" class="bg-[#111] text-rose-400">Critical (Force Read)</option>
                    </select>
                </div>
            </div>

            <div class="flex gap-2">
                <button id="btn-send-comms" class="ripple-btn flex-1 py-3.5 rounded-[14px] font-black text-[13px] active-scale text-white shadow-lg flex items-center justify-center gap-2 bg-telegram">
                    <i data-lucide="send" class="w-4 h-4 pointer-events-none"></i> Deploy
                </button>
                
                <!-- Omnichannel Fallback -->
                <button id="btn-whatsapp-fallback" class="ripple-btn hidden shrink-0 px-4 rounded-[14px] active-scale bg-[#25D366] text-white shadow-lg flex items-center justify-center">
                    <svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                </button>
            </div>
        </div>
    `;
    refreshIcons();

    // Variables & Bindings
    const audSelect = document.getElementById('comms-audience');
    const roomInput = document.getElementById('room-input-container');
    const indInputContainer = document.getElementById('individual-input-container');
    const priSelect = document.getElementById('comms-priority');
    const priContainer = document.getElementById('priority-container');
    const btnWA = document.getElementById('btn-whatsapp-fallback');
    
    const msgBox = document.getElementById('comms-message');
    const charCount = document.getElementById('char-count');
    const indInput = document.getElementById('comms-individual');
    const customDropdown = document.getElementById('custom-dropdown');
    const aiStatus = document.getElementById('ai-status');

    // NLP Dictionary for Smart Prioritization
    const criticalWeights = {
        'urgent': 3, 'critical': 3, 'immediate': 3, 'penalty': 2, 
        'strict': 2, 'fine': 2, 'tomorrow': 1, 'warning': 2
    };
    
    const evalFallback = () => {
        if (audSelect.value === 'INDIVIDUAL' && priSelect.value === 'CRITICAL') {
            btnWA.classList.remove('hidden');
            btnWA.classList.add('flex', 'fade-in');
        } else {
            btnWA.classList.add('hidden');
            btnWA.classList.remove('flex', 'fade-in');
        }
    };

    audSelect.addEventListener('change', (e) => {
        roomInput.classList.add('hidden');
        indInputContainer.classList.add('hidden');
        
        if (e.target.value === 'ROOM') roomInput.classList.remove('hidden');
        if (e.target.value === 'INDIVIDUAL') indInputContainer.classList.remove('hidden');
        evalFallback();
    });

    priSelect.addEventListener('change', evalFallback);

    // 🧠 NLP Engine & Draft System
    msgBox.addEventListener('input', (e) => {
        const text = e.target.value;
        const len = text.length;
        charCount.innerText = len;
        charCount.className = len > 280 ? 'text-rose-400' : 'text-white/30';
        
        // Auto-expand textarea
        e.target.style.height = 'auto';
        e.target.style.height = (e.target.scrollHeight) + 'px';

        // Background LocalStorage Serialization
        localStorage.setItem('mm_comms_draft', JSON.stringify({ msg: text }));

        // AI Sentiment Analysis Trigger
        let dangerScore = 0;
        const lowerText = text.toLowerCase();
        
        Object.keys(criticalWeights).forEach(kw => {
            if (lowerText.includes(kw)) dangerScore += criticalWeights[kw];
        });

        if (dangerScore >= 3) {
            if (priSelect.value !== 'CRITICAL') {
                triggerHaptic('light');
                priSelect.value = 'CRITICAL';
                priContainer.classList.add('border-rose-500');
                aiStatus.innerText = 'AI: Priority Upgraded';
                aiStatus.classList.replace('text-telegram', 'text-rose-400');
            }
        } else {
            if (priSelect.value === 'CRITICAL' && dangerScore === 0) {
                priSelect.value = 'DISMISSIBLE';
                priContainer.classList.remove('border-rose-500');
                aiStatus.innerText = 'AI: Tracking Intent';
                aiStatus.classList.replace('text-rose-400', 'text-telegram');
            }
        }
        evalFallback();
    });

    // --- Absolute Command Palette Autocomplete ---
    let selectedStudentId = null;

    indInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        customDropdown.innerHTML = '';
        selectedStudentId = null;
        
        if (query.length < 1) {
            customDropdown.classList.add('hidden');
            return;
        }

        const matches = directoryCache.filter(s => 
            s.name.toLowerCase().includes(query) || 
            (s.room && s.room.toLowerCase().includes(query))
        ).slice(0, 5);

        if (matches.length === 0) {
            customDropdown.innerHTML = `<div class="p-3 text-[11px] font-bold text-white/40 text-center">No matching students</div>`;
        } else {
            customDropdown.innerHTML = matches.map(s => `
                <div class="dropdown-item p-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.05] cursor-pointer flex justify-between items-center transition-colors" data-id="${s.id}" data-name="${s.name}">
                    <div class="text-[13px] font-black text-white">${s.name}</div>
                    <div class="text-[10px] font-bold uppercase tracking-widest text-amber-500/70 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Room ${s.room || '-'}</div>
                </div>
            `).join('');

            customDropdown.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', (ev) => {
                    triggerHaptic('light');
                    selectedStudentId = ev.currentTarget.getAttribute('data-id');
                    indInput.value = ev.currentTarget.getAttribute('data-name');
                    customDropdown.classList.add('hidden');
                });
            });
        }
        customDropdown.classList.remove('hidden');
    });

    // Close Dropdown naturally when clicking away
    document.addEventListener('click', (e) => {
        if (!indInputContainer.contains(e.target)) {
            customDropdown.classList.add('hidden');
        }
    });

    document.getElementById('btn-send-comms').addEventListener('click', (e) => handleOptimisticSend(e, selectedStudentId));
    
    // WhatsApp Core Implementation
    btnWA.addEventListener('click', () => {
        triggerHaptic('heavy');
        const rawMsg = msgBox.value.trim();
        if (!selectedStudentId) return showToast("Select a student from the dropdown.", "error");
        
        const student = directoryCache.find(s => s.id === selectedStudentId);
        if (!student || !student.phone) return showToast("Target phone number missing.", "error");
        
        const encoded = encodeURIComponent(`Urgent Alert:\n\n${rawMsg}`);
        window.open(`https://wa.me/91${student.phone}?text=${encoded}`, '_blank');
    });
}

async function handleOptimisticSend(e, selectedStudentId) {
    const btn = e.currentTarget;
    const msgInput = document.getElementById('comms-message');
    const audience = document.getElementById('comms-audience').value;
    const priority = document.getElementById('comms-priority').value;
    const expiry = document.getElementById('comms-expiry').value;
    
    let finalMessage = msgInput.value.trim();
    if (!finalMessage) return showToast("Payload is empty.", "error");
    if (!expiry) return showToast("Deadline required.", "error");

    if (audience === 'DEFAULTERS') finalMessage = `[TARGET:DEFAULTERS][PRIORITY:${priority}] ${finalMessage}`;
    else if (audience === 'ROOM') {
        const roomNo = document.getElementById('comms-room').value.trim();
        if (!roomNo) return showToast("Enter a target room.", "error");
        finalMessage = `[TARGET:ROOM:${roomNo}][PRIORITY:${priority}] ${finalMessage}`;
    } 
    else if (audience === 'INDIVIDUAL') {
        if (!selectedStudentId) return showToast("Select a student from the dropdown.", "error");
        finalMessage = `[TARGET:INDIVIDUAL:${selectedStudentId}][PRIORITY:${priority}] ${finalMessage}`;
    }
    else finalMessage = `[TARGET:ALL][PRIORITY:${priority}] ${finalMessage}`;

    triggerHaptic('light');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin pointer-events-none"></i> Deploying...`;
    
    createAnnouncement(finalMessage, new Date(expiry).toISOString()).then(res => {
        if (!res.success) {
            showToast("Failed to dispatch.", "error");
        } else {
            showToast("Payload Deployed!", "success");
            
            // Clean UI & Draft State
            msgInput.value = '';
            msgInput.style.height = 'auto';
            document.getElementById('char-count').innerText = '0';
            localStorage.removeItem('mm_comms_draft');
            document.getElementById('ai-status').innerText = 'System Ready';
            document.getElementById('ai-status').classList.replace('text-rose-400', 'text-telegram');
            
            if (audience === 'ROOM') document.getElementById('comms-room').value = '';
            if (audience === 'INDIVIDUAL') document.getElementById('comms-individual').value = '';
            
            loadCommsData();
        }
        btn.innerHTML = originalText;
        refreshIcons();
    });
}

// ==========================================
// INBOX: CACHED VIEW RENDERING
// ==========================================
async function loadCommsData() {
    const res = await fetchAllAnnouncements();
    if (res.success) {
        commsCache = res.announcements;
        renderInboxDOM(); 
    }
}

function renderInboxDOM() {
    const viewInbox = document.getElementById('view-inbox');
    if(!viewInbox) return;
    
    if (commsCache.length === 0) {
        viewInbox.innerHTML = `<div class="flex flex-col items-center justify-center py-20 opacity-30"><i data-lucide="inbox" class="w-10 h-10 mb-3"></i><div class="font-bold text-[12px] tracking-wide">Inbox is clear</div></div>`;
        refreshIcons();
        return;
    }

    const now = new Date();

    viewInbox.innerHTML = commsCache.map(a => {
        const expiresAt = new Date(a.expires_at);
        const isExpired = expiresAt < now;
        const createdDateStr = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        const isCrit = a.message.includes('[PRIORITY:CRITICAL]');
        const isDefaulter = a.message.includes('[TARGET:DEFAULTERS]');
        const isRoom = a.message.includes('[TARGET:ROOM:');
        const isIndiv = a.message.includes('[TARGET:INDIVIDUAL:');
        
        let targetPill = `<span class="bg-white/10 text-white/70 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-white/5">Global</span>`;
        if (isDefaulter) targetPill = `<span class="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-rose-500/20">Defaulters</span>`;
        if (isRoom) targetPill = `<span class="bg-telegram/10 text-telegram px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-telegram/20">Targeted Room</span>`;
        if (isIndiv) {
            const sidMatch = a.message.match(/\[TARGET:INDIVIDUAL:(.*?)\]/);
            let nameTag = 'Individual';
            if (sidMatch && sidMatch[1]) {
                const s = directoryCache.find(x => x.id === sidMatch[1]);
                if (s) nameTag = s.name.split(' ')[0]; 
            }
            targetPill = `<span class="bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-amber-500/20">${nameTag}</span>`;
        }

        let cleanMsg = a.message.replace(/\[TARGET:.*?\]/g, '').replace(/\[PRIORITY:.*?\]/g, '').trim();

        return `
            <div class="swipe-card relative overflow-hidden rounded-[16px] bg-rose-600 shadow-sm" data-id="${a.id}">
                <div class="absolute inset-0 flex items-center justify-start px-6 font-black text-[11px] text-white tracking-widest uppercase pointer-events-none">
                    <i data-lucide="trash-2" class="w-4 h-4 mr-2"></i> Vaporize
                </div>
                
                <div class="swipe-surface relative bg-[#09090b] border border-white/[0.06] rounded-[16px] p-4 shadow-sm transition-transform ${isExpired ? 'opacity-50 grayscale' : ''}" style="touch-action: pan-y;">
                    <div class="flex justify-between items-start mb-2.5">
                        <div class="flex items-center gap-2">
                            ${isCrit ? `<div class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div>` : `<div class="w-1.5 h-1.5 rounded-full bg-white/20"></div>`}
                            ${targetPill}
                        </div>
                        <div class="text-[9px] font-black uppercase tracking-widest text-white/30">${createdDateStr}</div>
                    </div>
                    
                    <div class="text-[13px] font-bold leading-relaxed mb-3 text-white">${cleanMsg}</div>
                    
                    <div class="flex items-center justify-between border-t border-white/[0.04] pt-3 mt-1">
                        <div class="text-[9px] font-black uppercase tracking-widest text-white/30 flex items-center gap-1">
                            <i data-lucide="hourglass" class="w-3 h-3"></i> 
                            ${isExpired ? 'Expired' : `Ends ${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                        </div>
                        <div class="text-[8px] font-black text-white/20 uppercase tracking-widest">Swipe right to delete</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    refreshIcons();
    attachSwipePhysics();
}

function attachSwipePhysics() {
    const cards = document.querySelectorAll('.swipe-card');
    
    cards.forEach(card => {
        const surface = card.querySelector('.swipe-surface');
        const id = card.getAttribute('data-id');
        let startX = 0, currentX = 0, isDragging = false;
        const threshold = 100; 

        surface.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            surface.style.transition = 'none'; 
        }, { passive: true });

        surface.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;

            if (deltaX > 0) {
                const resistance = deltaX > threshold ? threshold + (deltaX - threshold) * 0.3 : deltaX;
                surface.style.transform = `translateX(${resistance}px)`;
                surface.style.opacity = Math.max(1 - (resistance / (threshold * 2)), 0.6);
            }
        }, { passive: true });

        surface.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            surface.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s';

            const deltaX = currentX - startX;

            if (deltaX > threshold) {
                triggerHaptic('heavy');
                surface.style.transform = `translateX(100vw)`;
                
                setTimeout(() => {
                    card.style.transition = 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
                    card.style.opacity = '0';
                    card.style.height = '0px';
                    card.style.marginBottom = '0px';
                    card.style.padding = '0px';
                    
                    commsCache = commsCache.filter(a => String(a.id) !== String(id));
                    deleteAnnouncement(id);
                    setTimeout(() => card.remove(), 300);
                }, 150);
            } else {
                surface.style.transform = `translateX(0px)`;
                surface.style.opacity = '1';
            }
        });
    });
}
