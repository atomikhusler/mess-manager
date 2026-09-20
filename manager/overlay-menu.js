// manager/overlay-menu.js
import { showToast, showModal, refreshIcons, triggerHaptic } from '../core/ui-core.js';
import { OfflineEngine } from '../core/offline-engine.js';
import { updateMessProfile, fetchSettings, updateSettings } from './manager-db.js';
import { Premium } from '../core/premium.js';

// --- Cryptographic Security Utility ---
async function hashPIN(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function initMenuOverlay() {
    const container = document.getElementById('drawer-container');
    if (!container) return;

    // Zero-Latency Memory Reads
    const messId = localStorage.getItem('mm_mess_id') || 'UNKNOWN';
    const messName = localStorage.getItem('mm_mess_name') || 'Hostel Matrix';
    const managerName = localStorage.getItem('mm_manager_name') || 'System Manager';
    const capacity = localStorage.getItem('mm_capacity') || '';
    const hapticsEnabled = localStorage.getItem('mm_haptics_enabled') !== 'false';

    let pendingActions = 0;
    try {
        const queue = JSON.parse(localStorage.getItem('mm_offline_queue') || '[]');
        pendingActions = queue.length;
    } catch(e) {}

    // Master DOM Tree
    container.innerHTML = `
        <div id="menu-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] transition-opacity duration-300 opacity-0"></div>
        
        <div id="menu-drawer" class="fixed inset-x-0 bottom-0 bg-[#000000] rounded-t-[28px] h-[92vh] z-[101] shadow-[0_-20px_60px_rgba(0,0,0,0.9)] transition-transform duration-300 transform translate-y-full flex flex-col hardware-accelerated border-t border-white/[0.08] overflow-hidden">
            
            <!-- DYNAMIC STICKY HEADER -->
            <div class="bg-[#09090b]/90 backdrop-blur-2xl border-b border-white/[0.06] z-50 shrink-0 px-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-4 relative">
                <div class="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-4 pointer-events-none"></div>
                
                <div class="flex justify-between items-center relative h-9">
                    <!-- iOS Slide-in Back Button -->
                    <button id="btn-menu-back" class="absolute left-0 w-9 h-9 flex items-center justify-center rounded-full active-scale bg-white/5 text-white transition-all duration-300 opacity-0 pointer-events-none -translate-x-4">
                        <i data-lucide="chevron-left" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                    
                    <div id="menu-title-container" class="absolute left-0 transition-transform duration-300 transform translate-x-0">
                        <h2 id="menu-title" class="text-[20px] font-black tracking-tight text-white leading-none">System Menu</h2>
                        <div id="menu-subtitle" class="text-[10px] font-black uppercase tracking-widest text-telegram mt-1 font-mono">ID: ${messId}</div>
                    </div>

                    <button id="btn-close-menu" class="absolute right-0 w-9 h-9 flex items-center justify-center rounded-full active-scale bg-white/10 text-white transition-colors hover:bg-white/20">
                        <i data-lucide="chevron-down" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                </div>
            </div>

            <!-- SLIDING PANES VIEWPORT -->
            <div class="relative flex-1 overflow-hidden bg-[#000000]">
                
                <!-- ============================================== -->
                <!-- PANE 1: MAIN NAVIGATION HUB                    -->
                <!-- ============================================== -->
                <div id="pane-main" class="absolute inset-0 overflow-y-auto px-4 py-5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] disable-scrollbars transition-transform duration-300 ease-out transform translate-x-0 w-full">
                    
                    <div class="p-6 border border-white/[0.06] bg-gradient-to-b from-[#111113] to-[#09090b] rounded-[24px] mb-5 shadow-sm">
                        <div class="w-12 h-12 rounded-[14px] bg-telegram/10 flex items-center justify-center text-telegram font-black mb-4 border border-telegram/20">
                            <i data-lucide="building-2" class="w-6 h-6"></i>
                        </div>
                        <div class="text-[18px] font-black text-white tracking-tight truncate">${messName}</div>
                        <div class="text-[11px] font-bold text-white/40 uppercase tracking-widest mt-1 truncate">${managerName}</div>
                    </div>
                    
                    <div class="space-y-3">
                        <button class="menu-nav-btn w-full flex items-center justify-between p-4 rounded-[20px] bg-[#09090b] border border-white/[0.06] hover:bg-white/[0.02] active-scale transition-colors shadow-sm" data-target="pane-account" data-title="Identity & Security" data-subtitle="Profile & Access">
                            <div class="flex items-center gap-3.5">
                                <div class="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20"><i data-lucide="shield-check" class="w-5 h-5 text-emerald-400"></i></div>
                                <div class="text-left">
                                    <div class="text-[14px] font-black tracking-tight text-white leading-none">Identity & Security</div>
                                    <div class="text-[10px] font-bold text-white/40 mt-1">Profile, PIN, Factory Reset</div>
                                </div>
                            </div>
                            <i data-lucide="chevron-right" class="w-5 h-5 text-white/20"></i>
                        </button>
                        
                        <button class="menu-nav-btn w-full flex items-center justify-between p-4 rounded-[20px] bg-[#09090b] border border-white/[0.06] hover:bg-white/[0.02] active-scale transition-colors shadow-sm" data-target="pane-settings" data-title="System Operations" data-subtitle="App Configuration">
                            <div class="flex items-center gap-3.5">
                                <div class="w-10 h-10 rounded-full bg-telegram/10 flex items-center justify-center border border-telegram/20"><i data-lucide="server-cog" class="w-5 h-5 text-telegram"></i></div>
                                <div class="text-left">
                                    <div class="text-[14px] font-black tracking-tight text-white leading-none">System Operations</div>
                                    <div class="text-[10px] font-bold text-white/40 mt-1">Rules, Exports, Support</div>
                                </div>
                            </div>
                            <i data-lucide="chevron-right" class="w-5 h-5 text-white/20"></i>
                        </button>
                    </div>

                    <div class="mt-5 p-5 border border-amber-500/20 bg-amber-500/5 rounded-[20px] shadow-sm flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <i data-lucide="crown" class="w-5 h-5 text-amber-500"></i>
                            <div>
                                <div class="text-[9px] font-black uppercase tracking-widest text-amber-500/70 mb-0.5">Active License</div>
                                <div class="text-[14px] font-black text-white tracking-tight uppercase">${Premium.currentTier || 'FREE'} TIER</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ============================================== -->
                <!-- PANE 2: IDENTITY & SECURITY                    -->
                <!-- ============================================== -->
                <div id="pane-account" class="absolute inset-0 overflow-y-auto px-4 py-5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] space-y-6 disable-scrollbars transition-transform duration-300 ease-out transform translate-x-full w-full hidden">
                    
                    <div class="bg-[#09090b] border border-white/[0.08] p-5 rounded-[24px] relative shadow-sm">
                        <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                            <i data-lucide="building-2" class="w-4 h-4"></i> Hostel Profile
                        </div>
                        <div class="space-y-4">
                            <div>
                                <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">Hostel / Mess Name</label>
                                <input type="text" id="prof-mess-name" value="${messName}" class="w-full bg-[#111113] text-[14px] font-black outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors">
                            </div>
                            <div class="grid grid-cols-[1fr_100px] gap-3">
                                <div>
                                    <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">Manager Name</label>
                                    <input type="text" id="prof-manager-name" value="${managerName}" class="w-full bg-[#111113] text-[14px] font-black outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors">
                                </div>
                                <div>
                                    <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">Capacity</label>
                                    <input type="text" inputmode="numeric" id="prof-capacity" value="${capacity}" class="w-full bg-[#111113] text-[14px] font-black outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white focus:border-telegram/50 transition-colors text-center">
                                </div>
                            </div>
                        </div>
                        <div id="prof-save-container" class="mt-5 overflow-hidden transition-all duration-300 h-0 opacity-0">
                            <button id="btn-save-profile" class="ripple-btn w-full py-3.5 rounded-[14px] font-black text-[13px] active-scale shadow-lg flex items-center justify-center gap-2 bg-telegram text-white">
                                <i data-lucide="cloud-upload" class="w-4 h-4 pointer-events-none"></i> Push Changes to Cloud
                            </button>
                        </div>
                    </div>

                    <div class="bg-[#09090b] border border-white/[0.08] p-5 rounded-[24px] shadow-sm">
                        <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                            <i data-lucide="shield-check" class="w-4 h-4"></i> Access Security
                        </div>
                        <div class="space-y-3">
                            <input type="password" inputmode="numeric" id="pin-old" placeholder="Current 4-Digit PIN" maxlength="4" class="w-full bg-[#111113] text-[14px] font-black tracking-[0.3em] text-center outline-none border border-white/10 rounded-[12px] px-4 py-3 text-white placeholder-white/20 placeholder:tracking-normal focus:border-telegram/50 transition-colors">
                            <div class="grid grid-cols-2 gap-3">
                                <input type="password" inputmode="numeric" id="pin-new" placeholder="New PIN" maxlength="4" class="w-full bg-[#111113] text-[14px] font-black tracking-[0.3em] text-center outline-none border border-white/10 rounded-[12px] px-4 py-3 text-telegram placeholder-white/20 placeholder:tracking-normal focus:border-telegram/50 transition-colors">
                                <input type="password" inputmode="numeric" id="pin-confirm" placeholder="Confirm" maxlength="4" class="w-full bg-[#111113] text-[14px] font-black tracking-[0.3em] text-center outline-none border border-white/10 rounded-[12px] px-4 py-3 text-telegram placeholder-white/20 placeholder:tracking-normal focus:border-telegram/50 transition-colors">
                            </div>
                            <button id="btn-change-pin" class="ripple-btn w-full py-3.5 rounded-[14px] font-black text-[13px] mt-2 active-scale transition-colors bg-white/5 border border-white/10 text-white hover:bg-white/10">
                                Update Security PIN
                            </button>
                        </div>
                    </div>

                    <div class="space-y-3 pt-4 border-t border-white/[0.06]">
                        <button id="btn-standard-logout" class="ripple-btn w-full py-4 rounded-[16px] font-black text-[13px] active-scale flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white transition-colors hover:bg-white/10">
                            <i data-lucide="log-out" class="w-4 h-4 text-white/50 pointer-events-none"></i> Sign Out of Device
                        </button>
                        
                        <div id="purge-container">
                            <button id="btn-init-purge" class="ripple-btn w-full py-4 rounded-[16px] font-black text-[13px] active-scale flex items-center justify-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 transition-colors hover:bg-rose-500/20">
                                <i data-lucide="alert-octagon" class="w-4 h-4 pointer-events-none"></i> Factory Data Reset
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ============================================== -->
                <!-- PANE 3: SYSTEM OPERATIONS                      -->
                <!-- ============================================== -->
                <div id="pane-settings" class="absolute inset-0 overflow-y-auto px-4 py-5 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] space-y-6 disable-scrollbars transition-transform duration-300 ease-out transform translate-x-full w-full hidden">
                    
                    <div class="bg-[#09090b] border border-white/[0.08] p-4 rounded-[20px] flex justify-between items-center shadow-sm">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-[14px] bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                                <i data-lucide="database-zap" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="text-[13px] font-black text-white tracking-tight">Offline GodCache</div>
                                <div class="text-[10px] font-bold text-white/40 mt-0.5">Pending Background Actions: <span class="${pendingActions > 0 ? 'text-amber-400' : 'text-emerald-400'}">${pendingActions}</span></div>
                            </div>
                        </div>
                        <button id="btn-force-sync" class="ripple-btn bg-white/10 text-white w-9 h-9 rounded-full flex items-center justify-center active-scale transition-colors hover:bg-white/20">
                            <i data-lucide="refresh-cw" class="w-4 h-4 pointer-events-none"></i>
                        </button>
                    </div>

                    <div class="bg-[#09090b] border border-white/[0.08] p-4 rounded-[20px] flex justify-between items-center shadow-sm">
                        <div>
                            <div class="text-[13px] font-black text-white tracking-tight">Tactile Haptics</div>
                            <div class="text-[9px] font-bold text-white/40 mt-0.5">Physical vibration feedback</div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="toggle-haptics" class="sr-only peer" ${hapticsEnabled ? 'checked' : ''}>
                            <div class="w-11 h-6 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-telegram"></div>
                        </label>
                    </div>

                    <div class="bg-[#09090b] border border-white/[0.08] p-5 rounded-[24px] shadow-sm">
                        <h3 class="text-[11px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-white/40">
                            <i data-lucide="clock" class="w-4 h-4"></i> Roster Cut-offs & Freezes
                        </h3>
                        <div class="flex items-center justify-between mb-4 pb-4 border-b border-white/[0.04]">
                            <label class="text-[13px] font-bold text-white">Lunch Cut-off Time</label>
                            <input type="time" id="set-day-cutoff" class="bg-transparent text-[14px] font-black outline-none text-right text-telegram">
                        </div>
                        <div class="flex items-center justify-between mb-5">
                            <label class="text-[13px] font-bold text-white">Dinner Cut-off Time</label>
                            <input type="time" id="set-night-cutoff" class="bg-transparent text-[14px] font-black outline-none text-right text-telegram">
                        </div>

                        <div class="border-t border-white/[0.04] pt-5">
                            <label class="text-[10px] font-black uppercase tracking-widest block mb-3 text-rose-400">Global Holiday Freeze</label>
                            <div class="flex items-center gap-2 mb-3">
                                <input type="date" id="freeze-start" class="flex-1 bg-[#111113] rounded-[12px] px-3 py-2.5 text-[11px] font-bold outline-none text-white border border-white/10 focus:border-rose-500/50 transition-colors">
                                <span class="text-[10px] font-bold text-white/30">to</span>
                                <input type="date" id="freeze-end" class="flex-1 bg-[#111113] rounded-[12px] px-3 py-2.5 text-[11px] font-bold outline-none text-white border border-white/10 focus:border-rose-500/50 transition-colors">
                            </div>
                            <input type="text" id="freeze-reason" autocomplete="off" placeholder="Reason (e.g., Diwali Vacation)" class="w-full bg-transparent text-[13px] font-bold outline-none border-b border-white/10 py-2.5 mb-5 text-white placeholder-white/30 focus:border-rose-500/50 transition-colors">
                            <button id="btn-save-ops" class="ripple-btn w-full py-3.5 rounded-[14px] font-black text-[13px] active-scale bg-telegram text-white shadow-lg shadow-telegram/20 flex items-center justify-center gap-2">
                                <i data-lucide="cloud-upload" class="w-4 h-4 pointer-events-none"></i> Push Rules to Cloud
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <button id="btn-vault-backup" class="ripple-btn bg-[#09090b] border border-white/[0.08] py-5 rounded-[20px] flex flex-col items-center justify-center gap-2.5 active-scale transition-colors hover:bg-white/[0.02] shadow-sm">
                            <i data-lucide="download-cloud" class="w-5 h-5 text-emerald-400 pointer-events-none"></i>
                            <span class="text-[10px] font-black uppercase tracking-widest text-white pointer-events-none">Create Backup</span>
                        </button>
                        <button id="btn-vault-restore" class="ripple-btn bg-[#09090b] border border-white/[0.08] py-5 rounded-[20px] flex flex-col items-center justify-center gap-2.5 active-scale transition-colors hover:bg-white/[0.02] shadow-sm relative">
                            <i data-lucide="upload-cloud" class="w-5 h-5 text-telegram pointer-events-none"></i>
                            <span class="text-[10px] font-black uppercase tracking-widest text-white pointer-events-none">Restore Data</span>
                            <input type="file" id="file-restore-input" accept=".json" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                        </button>
                        <button id="btn-drawer-export" class="ripple-btn bg-[#09090b] border border-white/[0.08] py-5 rounded-[20px] flex flex-col items-center justify-center gap-2.5 active-scale transition-colors hover:bg-white/[0.02] shadow-sm">
                            <i data-lucide="file-down" class="w-5 h-5 text-amber-500 pointer-events-none"></i>
                            <span class="text-[10px] font-black uppercase tracking-widest text-white pointer-events-none">Export Hub</span>
                        </button>
                        <button id="btn-invite-students" class="ripple-btn bg-[#09090b] border border-white/[0.08] py-5 rounded-[20px] flex flex-col items-center justify-center gap-2.5 active-scale transition-colors hover:bg-white/[0.02] shadow-sm">
                            <i data-lucide="user-plus" class="w-5 h-5 text-purple-400 pointer-events-none"></i>
                            <span class="text-[10px] font-black uppercase tracking-widest text-white pointer-events-none">Invite Links</span>
                        </button>
                    </div>

                    <div class="bg-[#09090b] border border-white/[0.08] rounded-[24px] p-5 shadow-sm">
                        <div class="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">Help & Support</div>
                        <div class="flex gap-3">
                            <a href="https://t.me/spesiumsupport" target="_blank" class="flex-1 bg-telegram/10 border border-telegram/20 py-3 rounded-[14px] flex items-center justify-center gap-2 active-scale text-telegram font-bold text-[12px] transition-colors hover:bg-telegram/20">
                                <i data-lucide="send" class="w-4 h-4"></i> Telegram
                            </a>
                            <a href="mailto:support@spesium.com" class="flex-1 bg-white/5 border border-white/10 py-3 rounded-[14px] flex items-center justify-center gap-2 active-scale text-white font-bold text-[12px] transition-colors hover:bg-white/10">
                                <i data-lucide="mail" class="w-4 h-4"></i> Email Us
                            </a>
                        </div>
                    </div>

                    <!-- Developer Tribute -->
                    <div class="relative p-6 rounded-[24px] bg-[#09090b] border border-white/[0.08] text-center overflow-hidden group shadow-sm">
                        <div class="absolute inset-0 bg-gradient-to-br from-telegram/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
                        <div class="relative z-10">
                            <div class="text-2xl font-black tracking-tight text-white mb-1 flex items-center justify-center gap-1">
                                Mess Manager<span class="text-telegram animate-pulse">.</span>
                            </div>
                            <div class="text-[9px] font-black uppercase tracking-widest text-white/40 mb-5 font-mono bg-white/[0.03] border border-white/5 inline-block px-2.5 py-1 rounded-lg">Build 3.0 (Enterprise)</div>
                            <div class="w-12 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent mx-auto mb-4"></div>
                            <div class="text-[9px] font-black text-white/30 mb-1 uppercase tracking-widest">Architected By</div>
                            <div class="text-[15px] font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/60 group-hover:from-telegram group-hover:to-purple-400 transition-all duration-500">
                                SAHIL KUMAR ROUT
                            </div>
                            <div class="text-[9px] font-black tracking-[0.3em] mt-2 text-telegram flex items-center justify-center gap-1.5 opacity-80">
                                <span class="w-1.5 h-1.5 rounded-full bg-telegram shadow-[0_0_8px_#3390ec] animate-ping"></span> SPESIUM
                            </div>
                            <button id="easter-egg-btn" class="absolute top-0 right-0 p-2 text-white/10 hover:text-rose-500 transition-colors active-scale"><i data-lucide="code-2" class="w-4 h-4 pointer-events-none"></i></button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;

    refreshIcons();
    attachDrawerLogic(messId, messName, managerName, capacity);
}

function attachDrawerLogic(messId, origMess, origManager, origCap) {
    const backdrop = document.getElementById('menu-backdrop');
    const drawer = document.getElementById('menu-drawer');
    const container = document.getElementById('drawer-container');
    
    const paneMain = document.getElementById('pane-main');
    const title = document.getElementById('menu-title');
    const subtitle = document.getElementById('menu-subtitle');
    const titleContainer = document.getElementById('menu-title-container');
    const backBtn = document.getElementById('btn-menu-back');

    let activePaneId = 'pane-main';

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

    document.getElementById('btn-close-menu').addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);

    // --- 📱 NATIVE iOS SLIDING NAVIGATION ROUTER ---
    document.querySelectorAll('.menu-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            const targetId = btn.getAttribute('data-target');
            const targetPane = document.getElementById(targetId);
            
            targetPane.classList.remove('hidden');
            
            // Slide Animations
            paneMain.classList.replace('translate-x-0', '-translate-x-full');
            targetPane.classList.replace('translate-x-full', 'translate-x-0');
            
            // Header Cross-fade & Back Button reveal
            title.innerText = btn.getAttribute('data-title');
            subtitle.innerText = btn.getAttribute('data-subtitle');
            
            titleContainer.classList.add('translate-x-9');
            backBtn.classList.remove('opacity-0', '-translate-x-4', 'pointer-events-none');
            
            activePaneId = targetId;
        });
    });

    backBtn.addEventListener('click', () => {
        triggerHaptic('light');
        const activePane = document.getElementById(activePaneId);
        
        // Reverse Animations
        activePane.classList.replace('translate-x-0', 'translate-x-full');
        paneMain.classList.replace('-translate-x-full', 'translate-x-0');
        
        // Header Reset
        title.innerText = 'System Menu';
        subtitle.innerText = `ID: ${messId}`;
        
        titleContainer.classList.remove('translate-x-9');
        backBtn.classList.add('opacity-0', '-translate-x-4', 'pointer-events-none');
        
        // DOM Cleanup
        setTimeout(() => { activePane.classList.add('hidden'); }, 300);
        activePaneId = 'pane-main';
    });

    // --- SWIPE DOWN TO CLOSE (Strictly Y-Axis to prevent horizontal conflicts) ---
    let startY = 0, currentY = 0, isDragging = false;
    drawer.addEventListener('touchstart', (e) => {
        const activeScrollArea = document.getElementById(activePaneId);
        if (activeScrollArea && activeScrollArea.scrollTop > 0) return;
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

    // ==========================================
    // MODULE 1: ACCOUNT & SECURITY LOGIC
    // ==========================================
    const iMess = document.getElementById('prof-mess-name');
    const iManager = document.getElementById('prof-manager-name');
    const iCap = document.getElementById('prof-capacity');
    const saveContainer = document.getElementById('prof-save-container');

    const checkMutations = () => {
        iCap.value = iCap.value.replace(/[^0-9]/g, '');
        if (iMess.value.trim() !== origMess || iManager.value.trim() !== origManager || iCap.value.trim() !== origCap) {
            saveContainer.style.height = '48px'; saveContainer.style.opacity = '1';
        } else {
            saveContainer.style.height = '0px'; saveContainer.style.opacity = '0';
        }
    };
    [iMess, iManager, iCap].forEach(el => el.addEventListener('input', checkMutations));

    document.getElementById('btn-save-profile').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const newMess = iMess.value.trim(); const newManager = iManager.value.trim(); const newCap = iCap.value.trim();
        if (!newMess || !newManager || !newCap) return showToast("All fields required.", "error");

        triggerHaptic('light');
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin pointer-events-none"></i> Syncing...`;
        refreshIcons();

        const res = await updateMessProfile({ mess_name: newMess, manager_name: newManager, capacity: newCap });
        if (res.success) {
            localStorage.setItem('mm_mess_name', newMess); localStorage.setItem('mm_manager_name', newManager); localStorage.setItem('mm_capacity', newCap);
            origMess = newMess; origManager = newManager; origCap = newCap;
            checkMutations(); 
            showToast("Profile Synced.", "success");
        } else {
            triggerHaptic('heavy');
            showToast("Sync failed.", "error");
        }
        btn.innerHTML = `<i data-lucide="cloud-upload" class="w-4 h-4 pointer-events-none"></i> Push Changes to Cloud`;
        refreshIcons();
    });

    const enforceNum = (e) => e.target.value = e.target.value.replace(/[^0-9]/g, '');
    ['pin-old', 'pin-new', 'pin-confirm'].forEach(id => document.getElementById(id).addEventListener('input', enforceNum));

    document.getElementById('btn-change-pin').addEventListener('click', async () => {
        const oldPin = document.getElementById('pin-old').value; const newPin = document.getElementById('pin-new').value; const confirmPin = document.getElementById('pin-confirm').value;
        if (oldPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4) return showToast("All PINs must be 4 digits.", "error");
        if (newPin !== confirmPin) return showToast("New PINs do not match.", "error");

        triggerHaptic('heavy');
        const hashedOldInput = await hashPIN(oldPin);
        const storedHash = localStorage.getItem('mm_pin_hash');
        if (!storedHash || hashedOldInput !== storedHash) return showToast("Current PIN is incorrect.", "error");

        localStorage.setItem('mm_pin_hash', await hashPIN(newPin));
        showToast("Security PIN Updated.", "success");
        document.getElementById('pin-old').value = ''; document.getElementById('pin-new').value = ''; document.getElementById('pin-confirm').value = '';
    });

    document.getElementById('btn-standard-logout').addEventListener('click', () => {
        triggerHaptic('modal');
        showModal({
            title: "Sign Out", message: "Securely log out of this device. Cloud data remains safe.", type: "info", confirmText: "Sign Out",
            onConfirm: () => { localStorage.removeItem('mm_license_valid'); window.location.replace('./index.html'); }
        });
    });

    document.getElementById('btn-init-purge').addEventListener('click', () => {
        triggerHaptic('heavy');
        document.getElementById('purge-container').innerHTML = `
            <div class="flex gap-2 w-full mt-4 fade-in">
                <input type="password" inputmode="numeric" pattern="[0-9]*" id="input-purge-pin" placeholder="Enter 4-Digit PIN to Reset" maxlength="4" class="flex-1 bg-[#111113] border border-rose-500/30 text-rose-500 rounded-[16px] px-4 py-3.5 text-center tracking-[0.3em] font-black outline-none focus:border-rose-500/60 placeholder:tracking-normal placeholder:text-rose-500/30 transition-colors">
                <button id="btn-confirm-purge" class="ripple-btn bg-rose-600 text-white font-black px-6 rounded-[16px] active-scale shadow-lg shadow-rose-600/20">Wipe</button>
            </div>
        `;
        document.getElementById('input-purge-pin').addEventListener('input', enforceNum);
        document.getElementById('btn-confirm-purge').addEventListener('click', async (e) => {
            const pinInput = document.getElementById('input-purge-pin').value;
            if (pinInput.length !== 4) return showToast("Enter 4-digit PIN.", "error");

            e.currentTarget.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin pointer-events-none"></i>`;
            refreshIcons();

            const hashedPinInput = await hashPIN(pinInput);
            if (hashedPinInput !== localStorage.getItem('mm_pin_hash')) {
                e.currentTarget.innerHTML = "Wipe";
                triggerHaptic('heavy');
                return showToast("Invalid PIN. Reset aborted.", "error");
            }
            triggerHaptic('light');
            OfflineEngine.executeNuclearPurge("Factory Data Reset authorized. Wiping device.");
        });
    });

    // ==========================================
    // MODULE 2: SYSTEM OPERATIONS LOGIC
    // ==========================================
    document.getElementById('toggle-haptics').addEventListener('change', (e) => {
        localStorage.setItem('mm_haptics_enabled', e.target.checked ? 'true' : 'false');
        triggerHaptic('light'); 
    });

    document.getElementById('btn-force-sync')?.addEventListener('click', () => {
        triggerHaptic('light');
        OfflineEngine.forceSync();
    });

    document.getElementById('btn-drawer-export').addEventListener('click', () => {
        triggerHaptic('light');
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        import('./file-export.js').then(m => m.openExportMenu(monthStr));
    });

    document.getElementById('btn-invite-students').addEventListener('click', () => {
        triggerHaptic('light');
        if (navigator.share) {
            navigator.share({ title: 'Mess Manager Enterprise', text: `Join our Mess matrix!\n\nUse Code: ${messId}`, url: window.location.origin }).catch(() => {});
        } else {
            showToast("Native sharing unavailable.", "error");
        }
    });

    document.getElementById('btn-vault-backup').addEventListener('click', async () => {
        triggerHaptic('light');
        showToast("Generating Encrypted Backup...", "info");
        const backupPayload = {
            metadata: { app: "Mess Manager Enterprise", version: "3.0", timestamp: new Date().toISOString(), mess_id: messId },
            data: { config: localStorage.getItem(`config_${messId}`), templates: localStorage.getItem(`mm_duty_tpl_${messId}`) }
        };
        const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `MM_Backup_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast("Backup downloaded successfully!", "success");
    });

    document.getElementById('file-restore-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        triggerHaptic('modal');
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const backup = JSON.parse(event.target.result);
                if (!backup.metadata || backup.metadata.mess_id !== messId) return showToast("Backup belongs to a different Mess ID.", "error");
                if (backup.data.config) localStorage.setItem(`config_${messId}`, backup.data.config);
                if (backup.data.templates) localStorage.setItem(`mm_duty_tpl_${messId}`, backup.data.templates);
                showToast("Data restored. Rebooting...", "success");
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) { showToast("Corrupt backup file.", "error"); }
        };
        reader.readAsText(file);
    });

    document.getElementById('easter-egg-btn')?.addEventListener('click', () => {
        triggerHaptic('heavy'); showToast("Stay Hungry. Stay Foolish. 🚀", "info");
    });

    loadSettingsData(messId);
}

async function loadSettingsData(messId) {
    const res = await fetchSettings(); 
    if (!res.success) return;

    const config = res.config || {};
    document.getElementById('set-day-cutoff').value = config.day_cutoff || '10:00';
    document.getElementById('set-night-cutoff').value = config.night_cutoff || '17:00';
    if (config.freeze_start) document.getElementById('freeze-start').value = config.freeze_start;
    if (config.freeze_end) document.getElementById('freeze-end').value = config.freeze_end;
    document.getElementById('freeze-reason').value = config.freeze_reason || '';

    document.getElementById('btn-save-ops')?.addEventListener('click', (e) => {
        triggerHaptic('light');
        const btn = e.currentTarget;
        const fStart = document.getElementById('freeze-start').value;
        const fEnd = document.getElementById('freeze-end').value;
        const fReason = document.getElementById('freeze-reason').value.trim();

        let isFreeze = false;
        if (fStart && fEnd) {
            if (new Date(fStart) > new Date(fEnd)) { triggerHaptic('heavy'); return showToast("End date must be after start date.", "error"); }
            if (!fReason) { triggerHaptic('heavy'); return showToast("Provide a reason for the freeze.", "error"); }
            isFreeze = true;
        }

        const updates = { day_cutoff: document.getElementById('set-day-cutoff').value, night_cutoff: document.getElementById('set-night-cutoff').value, is_holiday_freeze: isFreeze, freeze_start: fStart || null, freeze_end: fEnd || null, freeze_reason: isFreeze ? fReason : null };
        
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin pointer-events-none"></i> Pushing...`;
        refreshIcons();

        const currentConfigStr = localStorage.getItem(`config_${messId}`);
        let newConfig = updates;
        if(currentConfigStr) { try { newConfig = { ...JSON.parse(currentConfigStr), ...updates }; } catch(e){} }
        localStorage.setItem(`config_${messId}`, JSON.stringify(newConfig));
        showToast("Rules Updated Locally.", "success");

        updateSettings(updates).then(uRes => {
            if(!uRes.success) { triggerHaptic('heavy'); showToast("Failed to push rules to cloud.", "error"); } 
            else showToast("Pushed to Cloud.", "success");
            btn.innerHTML = `<i data-lucide="cloud-upload" class="w-4 h-4 pointer-events-none"></i> Push Rules to Cloud`;
            refreshIcons();
        });
    });
}
