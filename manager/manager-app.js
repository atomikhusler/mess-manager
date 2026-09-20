// manager/manager-app.js
import { supabase } from '../core/supabase-client.js';
import { refreshIcons, showToast, showModal, triggerHaptic } from '../core/ui-core.js';
import { Premium } from '../core/premium.js';
import { OfflineEngine } from '../core/offline-engine.js';
import { CommsEngine } from '../core/comms-engine.js';

// Primary Views
import { initDailyView } from './ui-roster.js';
import { initDirectoryView } from './ui-directory.js'; 
import { initStatsView } from './ui-stats.js';       
import { initLedgerView } from './ui-ledger.js';     

// Overlays (Statically imported to guarantee Offline PWA Availability)
import { initMenuOverlay } from './overlay-menu.js';
import { initPulseOverlay } from './overlay-pulse.js';
import { initCalcOverlay } from './overlay-calc.js';
import { initCommsOverlay } from './overlay-comms.js';

async function bootManagerPortal() {
    window.__MM_BOOT_STARTED__ = true;
    const appBody = document.getElementById('app-body');

    // 1. INSTANT UI INITIALIZATION (Zero-Latency)
    initBootTheme();
    if (appBody) {
        appBody.classList.remove('opacity-0');
        appBody.style.opacity = '1';
    }

    try {
        // 2. Hardware Security Lock Check
        const licenseValid = localStorage.getItem('mm_license_valid');
        const messId = localStorage.getItem('mm_mess_id');

        if (!licenseValid || !messId) {
            window.location.replace('./index.html');
            return;
        }

        // 3. Inject Viewport Sandbox
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div id="view-roster" class="view-section hardware-accelerated"></div>
                <div id="view-directory" class="view-section hidden hardware-accelerated"></div>
                <div id="view-ledger" class="view-section hidden hardware-accelerated"></div>
                <div id="view-stats" class="view-section hidden hardware-accelerated"></div>
            `;
        }

        // 4. Wire Global Shell
        initNavigation();
        initGlobalTopBar();

        // 5. Instantly paint the Default View from GodCache
        await initDailyView();
        refreshIcons();

        // 6. 🚀 DESTROY SPLASH SCREEN IMMEDIATELY (Do not wait for network)
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 400);
        }

        // 7. KICKSTART DAEMONS & BACKGROUND TASKS (Non-Blocking)
        OfflineEngine.processQueue(); // Instantly flush any leftover offline mutations
        initServiceWorker();
        initPullToRefresh();
        initNetworkMonitor();
        initMidnightShiftDetector(messId);
        initAdminOverrideListener(messId);

        // 8. ASYNC CLOUD NEGOTIATIONS (Timeout Protected)
        CommsEngine.init().catch(e => console.warn("Comms init delayed:", e));
        
        Promise.race([
            Premium.syncTierStatus(),
            new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 2500))
        ]).then(res => {
            if (res === 'TIMEOUT') console.warn("[BOOT] Tier sync timed out. Proceeding on verified local cryptography.");
        });

        checkFirstBootVault(messId);

        window.__MM_BOOT_COMPLETED__ = true;

    } catch (error) {
        console.error("CRITICAL BOOT FAILURE:", error);
        if (appBody) {
            appBody.innerHTML = `
                <div class="flex flex-col items-center justify-center h-screen px-6 text-center">
                    <div class="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-4 border border-rose-500/20">
                        <i data-lucide="triangle-alert" class="w-8 h-8"></i>
                    </div>
                    <div class="text-[18px] font-black text-white tracking-tight mb-2">Portal Initialization Failed</div>
                    <div class="text-[12px] font-bold text-white/40 mb-8 max-w-xs">${error.message}</div>
                    <button onclick="localStorage.clear(); location.replace('./index.html');" class="bg-white/10 text-white font-black text-[13px] border border-white/20 py-3.5 px-8 rounded-xl active-scale transition-colors hover:bg-white/20">
                        Reset Session
                    </button>
                </div>
            `;
            refreshIcons();
        }
    }
}

// --- BASE THEME ENGINE ---
function initBootTheme() {
    let isDark = localStorage.getItem('mm_theme') === 'dark';
    if (!localStorage.getItem('mm_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        isDark = true;
    }
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
}

// --- PROGRESSIVE WEB APP REGISTRATION ---
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.warn("[PWA] Service Worker registration bypassed:", err);
            });
        });
    }
}

// --- 🧠 MIDNIGHT SHIFT DETECTOR (Stale UI Protocol) ---
function initMidnightShiftDetector(messId) {
    let bootDate = new Date().getDate();
    
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            const currentDate = new Date().getDate();
            if (currentDate !== bootDate) {
                bootDate = currentDate;
                triggerHaptic('light');
                
                const activeView = document.querySelector('.view-section:not(.hidden)')?.id;
                if (activeView === 'view-roster') initDailyView();
                if (activeView === 'view-directory') initDirectoryView();
                if (activeView === 'view-ledger') initLedgerView();
                if (activeView === 'view-stats') initStatsView();
            }

            // Silent Kill-Switch Check on App Resume
            supabase.from('messes').select('status').eq('id', messId).maybeSingle().then(({data}) => {
                if (data && data.status === 'SUSPENDED') {
                    OfflineEngine.executeNuclearPurge("Your account has been suspended by the Admin.");
                }
            }).catch(() => {});
        }
    });
}

// --- WEB3 RECOVERY VAULT (Non-Blocking Background Check) ---
async function checkFirstBootVault(messId) {
    if (localStorage.getItem('mm_first_login') !== 'true') return;

    try {
        const fetchPromise = supabase.from('messes').select('recovery_key').eq('id', messId).maybeSingle();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ error: 'TIMEOUT' }), 3500));
        
        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (error || !data || !data.recovery_key) {
            console.warn("[Vault] Network weak. Deferring vault display to next boot sequence.");
            return;
        }

        const vaultOverlay = document.createElement('div');
        vaultOverlay.className = "fixed inset-0 z-[9999] flex items-center justify-center px-6 bg-black/90 backdrop-blur-xl fade-in";
        vaultOverlay.innerHTML = `
            <div class="w-full max-w-sm bg-[#09090b] rounded-[24px] p-8 shadow-2xl text-center border border-white/[0.08]">
                <div class="w-16 h-16 bg-telegram/10 rounded-[16px] flex items-center justify-center mx-auto mb-5 border border-telegram/20">
                    <i data-lucide="shield-check" class="w-8 h-8 text-telegram"></i>
                </div>
                <h2 class="text-2xl font-black text-white tracking-tight mb-2">Master Vault Key</h2>
                <p class="text-[13px] font-bold text-white/40 mb-6 leading-relaxed">This is the ONLY way to recover your account if you forget your PIN. Screenshot or write this down immediately.</p>
                
                <div class="bg-white/5 border border-white/10 rounded-2xl py-5 mb-6">
                    <div class="text-[22px] font-black text-telegram tracking-[0.2em] font-mono">${data.recovery_key}</div>
                </div>

                <button id="btn-confirm-vault" class="w-full bg-telegram text-white font-black text-[14px] py-4 rounded-xl active-scale transition-all shadow-[0_0_20px_rgba(51,144,236,0.3)]">
                    I Have Saved It Securely
                </button>
            </div>
        `;
        document.body.appendChild(vaultOverlay);
        refreshIcons();

        document.getElementById('btn-confirm-vault')?.addEventListener('click', () => {
            triggerHaptic('heavy');
            localStorage.removeItem('mm_first_login'); 
            vaultOverlay.style.opacity = '0';
            setTimeout(() => vaultOverlay.remove(), 300);
        });
    } catch (e) {
        console.error("Vault check bypassed:", e);
    }
}

// --- BENTO TAB ROUTER & DOUBLE-TAP TOP LOGIC ---
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view-section');
    const headerTitle = document.getElementById('header-page-title'); 

    const titleMap = {
        'view-roster': 'Daily Execution',
        'view-directory': 'People Hub',
        'view-ledger': 'Financial Ledger',
        'view-stats': 'Meal Analytics'
    };

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerHaptic('light');
            
            // Double-Tap to Top Algorithm (iOS Physics)
            if (btn.classList.contains('text-telegram')) {
                const main = document.getElementById('main-content');
                if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            const targetId = btn.getAttribute('data-target');
            if (headerTitle) headerTitle.innerText = titleMap[targetId];

            views.forEach(v => {
                v.classList.add('hidden');
                v.classList.remove('fade-in');
            });
            
            const activeView = document.getElementById(targetId);
            if (activeView) {
                activeView.classList.remove('hidden');
                activeView.classList.add('fade-in');
            }

            // Cleanly reset color states using strict Tailwind classes
            navBtns.forEach(b => {
                b.classList.remove('text-telegram');
                b.classList.add('text-white/30');
            });
            
            btn.classList.remove('text-white/30');
            btn.classList.add('text-telegram');

            // Dispatch to corresponding view logic
            if (targetId === 'view-roster') initDailyView();
            if (targetId === 'view-directory') initDirectoryView();
            if (targetId === 'view-ledger') initLedgerView();
            if (targetId === 'view-stats') initStatsView();
        });
    });
}

// --- 🧠 ELASTIC PULL-TO-REFRESH (AEROSPACE GRADE) ---
function initPullToRefresh() {
    const main = document.getElementById('main-content');
    if (!main) return;

    const ptrIndicator = document.createElement('div');
    ptrIndicator.id = 'ptr-indicator';
    ptrIndicator.className = 'fixed top-[calc(5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-[45] flex items-center justify-center w-10 h-10 bg-[#09090b] rounded-full shadow-[0_15px_40px_rgba(0,0,0,0.9)] border border-white/[0.08] transition-transform duration-200 opacity-0 scale-0 pointer-events-none';
    
    ptrIndicator.innerHTML = `<svg class="w-5 h-5 text-white/50 transition-colors" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`;
    document.body.appendChild(ptrIndicator);

    let startY = 0, currentY = 0, isPulling = false, holdTimer = null, isLocked = false;
    let lastScrollTime = 0;
    const triggerThreshold = 110; // Deliberate Heavy Pull

    main.addEventListener('scroll', () => { lastScrollTime = Date.now(); }, { passive: true });

    main.addEventListener('touchstart', (e) => {
        // Scroll-Velocity Ignorer (500ms debounce on momentum bounce)
        if (main.scrollTop <= 1 && (Date.now() - lastScrollTime > 500)) {
            startY = e.touches[0].clientY;
            isPulling = true;
            isLocked = false;
            main.style.transition = 'none'; 
            ptrIndicator.style.transition = 'none';
        }
    }, { passive: true });

    main.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        currentY = e.touches[0].clientY;
        const rawPull = currentY - startY;

        if (rawPull > 0 && main.scrollTop <= 1) {
            // Exponential Friction Algorithm
            const resistedPull = 150 * (1 - Math.exp(-rawPull / 350));
            main.style.transform = `translateY(${resistedPull}px)`;
            
            ptrIndicator.style.opacity = Math.min(resistedPull / 70, 1);
            ptrIndicator.style.transform = `translate(-50%, ${resistedPull}px) scale(${Math.min(resistedPull / 70, 1)})`;
            
            const icon = ptrIndicator.firstElementChild;
            if(icon) icon.style.transform = `rotate(${resistedPull * 4}deg)`;

            // Time-Lock Matrix Trigger
            if (resistedPull >= triggerThreshold && !isLocked) {
                isLocked = true;
                triggerHaptic('medium');
                icon.classList.add('text-telegram');
                icon.classList.remove('text-white/50');
                
                holdTimer = setTimeout(() => {
                    if (isLocked) triggerHaptic('heavy');
                }, 400);
            } else if (resistedPull < triggerThreshold && isLocked) {
                isLocked = false;
                clearTimeout(holdTimer);
                icon.classList.remove('text-telegram');
                icon.classList.add('text-white/50');
            }
        }
    }, { passive: true });

    main.addEventListener('touchend', async () => {
        if (!isPulling) return;
        isPulling = false;
        clearTimeout(holdTimer);

        main.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        ptrIndicator.style.transition = 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)';

        if (isLocked) {
            const icon = ptrIndicator.firstElementChild;
            icon.classList.add('animate-spin');
            main.style.transform = `translateY(60px)`;
            ptrIndicator.style.transform = `translate(-50%, 60px) scale(1)`;

            await OfflineEngine.forceSync();

            icon.classList.remove('animate-spin', 'text-telegram');
            icon.classList.add('text-white/50');
        }

        // Clean Reset
        main.style.transform = `translateY(0)`;
        ptrIndicator.style.opacity = '0';
        ptrIndicator.style.transform = `translate(-50%, 0) scale(0)`;
        isLocked = false;
        
        // Purge residual transition styles to prevent DOM UI lag
        setTimeout(() => {
            if(!isPulling) main.style.transition = '';
        }, 400);
    });
}

// --- SMART NETWORK LISTENER ---
function initNetworkMonitor() {
    window.addEventListener('offline', () => {
        triggerHaptic('heavy');
        showToast("Offline. Securing data to native vault.", "error");
    });

    window.addEventListener('online', () => {
        triggerHaptic('light');
        showToast("Online. Synchronizing matrices...", "info");
        OfflineEngine.processQueue(); 
    });
}

// --- SUPABASE WEBSOCKET KILL-SWITCH ---
function initAdminOverrideListener(messId) {
    supabase.channel(`mess-override-${messId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messes', filter: `id=eq.${messId}` }, (payload) => {
            if (payload.new && payload.new.status === 'SUSPENDED') {
                OfflineEngine.executeNuclearPurge("Your account has been suspended by the Admin.");
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messes', filter: `id=eq.${messId}` }, () => {
            OfflineEngine.executeNuclearPurge("Your hostel database has been permanently terminated.");
        })
        .subscribe();
}

// --- GLOBAL HEADER ROUTING ---
function initGlobalTopBar() {
    // Left Anchors
    document.getElementById('btn-menu')?.addEventListener('click', () => {
        triggerHaptic('light');
        initMenuOverlay();
    });
    
    // Right Anchors
    document.getElementById('btn-calc-header')?.addEventListener('click', () => {
        initCalcOverlay();
    });

    document.getElementById('btn-notify')?.addEventListener('click', () => {
        initCommsOverlay();
    });

    document.getElementById('btn-pulse')?.addEventListener('click', () => {
        initPulseOverlay();
    });
}

// Safe Lifecycle Kickoff
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootManagerPortal);
} else {
    bootManagerPortal();
}
