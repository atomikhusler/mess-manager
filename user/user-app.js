// user/user-app.js
import { supabase } from '../core/supabase-client.js';
import { refreshIcons, showToast, showModal, triggerHaptic } from '../core/ui-core.js';
import { fetchUserConfig, fetchActiveAnnouncements, syncServerTime, getSession } from './user-db.js';
import { initStudentUI } from './user-ui.js';

let currentAnnouncements = [];

async function bootUserPortal() {
    const appBody = document.getElementById('app-body');
    let session;
    
    try {
        session = getSession();
    } catch(e) { return; } 
    
    document.getElementById('user-greeting').innerText = `Hi, ${session.name.split(' ')[0]}`;
    
    const dateOptions = { weekday: 'long', month: 'short', day: 'numeric' };
    document.getElementById('date-display').innerText = new Date().toLocaleDateString('en-US', dateOptions);
    
    // Bind universal buttons immediately
    bindGlobalButtons();

    try {
        initCollateralKillSwitch(session.messId);

        // 🧠 Initial Boot Sync (Bypasses Cooldown to guarantee fresh data on cold start)
        await executeMatrixSync(true);

        appBody.classList.remove('opacity-0');
        appBody.classList.add('opacity-100');
        refreshIcons();

        // Initialize the Physics Engine
        initThrottledPullToRefresh();

    } catch (error) {
        console.error("Boot Error:", error);
        showToast("System Boot Failure.", "error");
    }
}

// --- 🧠 THE THROTTLED SYNC ENGINE (Supabase Limit Protector) ---
async function executeMatrixSync(isBoot = false) {
    const lastSync = parseInt(localStorage.getItem('mm_last_student_sync') || '0', 10);
    const now = Date.now();
    
    // 5-Minute Mutex (300,000 milliseconds)
    if (!isBoot && (now - lastSync < 300000)) {
        triggerHaptic('light');
        showToast("Matrix Synchronized (Cached)", "success");
        return;
    }

    try {
        // Parallel fetching for maximum speed
        const [configRes, announcementsRes, _] = await Promise.all([
            fetchUserConfig(),
            fetchActiveAnnouncements(),
            syncServerTime()
        ]);

        await initStudentUI(configRes.success ? configRes.config : null);

        if (configRes.success && configRes.config?.is_holiday_freeze) {
            renderHolidayBanner(configRes.config.freeze_reason);
        } else {
            const bannerContainer = document.getElementById('banner-container');
            if (bannerContainer) bannerContainer.innerHTML = '';
        }

        if (announcementsRes.success) {
            currentAnnouncements = announcementsRes.announcements;
            updateNotificationBell();
        }

        // Reset the Mutex Timer
        localStorage.setItem('mm_last_student_sync', now.toString());
        
        if (!isBoot) {
            triggerHaptic('medium');
            showToast("Live Matrix Synchronized", "success");
        }
    } catch (error) {
        triggerHaptic('heavy');
        showToast("Sync Failed. Check Connection.", "error");
        throw error; // Re-throw to prevent updating the success timer
    }
}

// --- ELASTIC PULL-TO-REFRESH ---
function initThrottledPullToRefresh() {
    const main = document.getElementById('main-content');
    if (!main) return;

    const ptrIndicator = document.createElement('div');
    ptrIndicator.id = 'ptr-indicator';
    ptrIndicator.className = 'fixed top-[calc(5rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-[45] flex items-center justify-center w-10 h-10 bg-[#09090b] rounded-full shadow-[0_15px_40px_rgba(0,0,0,0.9)] border border-white/[0.08] transition-transform duration-200 opacity-0 scale-0 pointer-events-none';
    ptrIndicator.innerHTML = `<svg class="w-5 h-5 text-white/50 transition-colors" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`;
    document.body.appendChild(ptrIndicator);

    let startY = 0, currentY = 0, isPulling = false, holdTimer = null, isLocked = false;
    let lastScrollTime = 0;
    const triggerThreshold = 110; 

    main.addEventListener('scroll', () => { lastScrollTime = Date.now(); }, { passive: true });

    main.addEventListener('touchstart', (e) => {
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
            const resistedPull = 150 * (1 - Math.exp(-rawPull / 350));
            main.style.transform = `translateY(${resistedPull}px)`;
            
            ptrIndicator.style.opacity = Math.min(resistedPull / 70, 1);
            ptrIndicator.style.transform = `translate(-50%, ${resistedPull}px) scale(${Math.min(resistedPull / 70, 1)})`;
            
            const icon = ptrIndicator.firstElementChild;
            if(icon) icon.style.transform = `rotate(${resistedPull * 4}deg)`;

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

            // Execute the Smart Engine (will bypass network if < 5 mins)
            await executeMatrixSync();

            icon.classList.remove('animate-spin', 'text-telegram');
            icon.classList.add('text-white/50');
        }

        main.style.transform = `translateY(0)`;
        ptrIndicator.style.opacity = '0';
        ptrIndicator.style.transform = `translate(-50%, 0) scale(0)`;
        isLocked = false;
        
        setTimeout(() => { if(!isPulling) main.style.transition = ''; }, 400);
    });
}

// --- SECURE LIFECYCLE LISTENERS ---
function bindGlobalButtons() {
    const notifyBtn = document.getElementById('btn-user-notify');
    if (notifyBtn) {
        notifyBtn.addEventListener('click', () => {
            triggerHaptic('light');
            if (currentAnnouncements.length > 0) {
                showModal({
                    title: "Matrix Directive",
                    message: currentAnnouncements[0].message,
                    type: 'info',
                    confirmText: "Acknowledge",
                    onConfirm: (closeModal) => {
                        triggerHaptic('light');
                        closeModal();
                        currentAnnouncements.shift(); 
                        updateNotificationBell();
                    }
                });
            } else {
                showToast("Inbox Zero. All caught up!", "success");
            }
        });
    }

    document.getElementById('btn-user-logout')?.addEventListener('click', () => {
        triggerHaptic('modal');
        showModal({
            title: "Sever Connection",
            message: "Are you sure you want to disconnect your device from the hostel matrix?",
            type: 'info',
            confirmText: "Disconnect",
            onConfirm: () => {
                localStorage.removeItem('mm_user_session');
                window.location.replace('./index.html');
            }
        });
    });
}

function updateNotificationBell() {
    const notifyBtn = document.getElementById('btn-user-notify');
    if (!notifyBtn) return;
    
    if (currentAnnouncements.length > 0) {
        notifyBtn.innerHTML = `
            <div class="relative">
                <i data-lucide="bell-ring" class="w-5 h-5 text-telegram"></i>
                <span class="absolute -top-1 -right-1 flex h-3 w-3">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border-2 border-[#09090b]"></span>
                </span>
            </div>
        `;
    } else {
        notifyBtn.innerHTML = `<i data-lucide="bell" class="w-5 h-5 pointer-events-none text-white/50"></i>`;
    }
    refreshIcons();
}

// --- THE COLLATERAL KILL SWITCH ---
function initCollateralKillSwitch(messId) {
    supabase.from('messes').select('status').eq('id', messId).maybeSingle().then(({data}) => {
        if (data && data.status === 'SUSPENDED') forceStudentLogout("Mess operations suspended by Admin.");
    });

    supabase.channel(`student-killswitch-${messId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messes', filter: `id=eq.${messId}` }, (payload) => {
            if (payload.new && payload.new.status === 'SUSPENDED') forceStudentLogout("Mess operations suspended by Admin.");
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messes', filter: `id=eq.${messId}` }, () => {
            forceStudentLogout("Hostel account permanently terminated.");
        })
        .subscribe();
}

function forceStudentLogout(reason) {
    localStorage.removeItem('mm_user_session');
    document.body.innerHTML = `
        <div class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-rose-600 text-white p-8 text-center fade-in">
            <svg class="w-16 h-16 mb-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <h1 class="text-3xl font-black tracking-tight mb-3">Connection Severed</h1>
            <p class="text-[15px] font-bold opacity-90 leading-relaxed">${reason}</p>
        </div>
    `;
    setTimeout(() => window.location.replace('./index.html'), 3000);
}

function renderHolidayBanner(reason) {
    const container = document.getElementById('banner-container');
    if (!container) return;
    container.innerHTML = `
        <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-[20px] p-5 flex items-start gap-4 mb-4 backdrop-blur-xl">
            <div class="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center shrink-0">
                <i data-lucide="calendar-off" class="w-5 h-5 text-indigo-400"></i>
            </div>
            <div>
                <h4 class="font-black text-[13px] text-indigo-300 tracking-tight">Meals Suspended</h4>
                <p class="text-[11px] font-bold text-indigo-400/60 mt-1">${reason || "A holiday freeze is currently active."}</p>
            </div>
        </div>
    `;
    refreshIcons();
}

window.addEventListener('DOMContentLoaded', bootUserPortal);
