// core/comms-engine.js
import { supabase } from './supabase-client.js';
import { showToast, showModal } from './ui-core.js';

class NotificationMatrix {
    constructor() {
        this.messId = localStorage.getItem('mm_mess_id');
        this.dismissedLog = this.loadGarbageCollectedLog();
        this.activeComms = [];
    }

    /**
     * Bootstrapper: Cleans old logs, fetches active messages, and routes them.
     */
    async init() {
        if (!this.messId) return;

        // Fetch all relevant active announcements
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .or(`mess_id.eq.${this.messId},mess_id.is.null`)
            .gte('expires_at', new Date().toISOString()) // Only non-expired
            .order('created_at', { ascending: false });

        if (error || !data) return;

        this.activeComms = data;
        let unreadCount = 0;

        this.activeComms.forEach(msg => {
            const isDismissed = this.dismissedLog.some(log => log.id === msg.id);
            
            if (msg.display_frequency === 'CRITICAL') {
                this.renderCritical(msg);
            } 
            else if (msg.display_frequency === 'ALWAYS' || (msg.display_frequency === 'DISMISSIBLE' && !isDismissed)) {
                this.renderDismissible(msg);
            } 
            else if (msg.display_frequency === 'PASSIVE' && !isDismissed) {
                unreadCount++;
            }
        });

        if (unreadCount > 0) this.updateBellBadge(unreadCount);
        this.listenForRealtime();
    }

    /**
     * Updates the global UI Bell Icon with a red stateful dot.
     */
    updateBellBadge(count) {
        const bellBtn = document.getElementById('btn-notify');
        if (!bellBtn) return;
        
        let badge = document.getElementById('notify-badge');
        if (!badge && count > 0) {
            badge = document.createElement('div');
            badge.id = 'notify-badge';
            badge.className = "absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-[#09090b] shadow-[0_0_10px_rgba(244,63,94,0.6)]";
            bellBtn.appendChild(badge);
        } else if (badge && count === 0) {
            badge.remove();
        }
    }

    /**
     * Level 3: Blocking full-screen overlay. Cannot be closed.
     */
    renderCritical(msg) {
        const blocker = document.createElement('div');
        blocker.className = "fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex flex-col justify-center items-center px-6 hardware-accelerated fade-in";
        blocker.innerHTML = `
            <div class="w-full max-w-sm border border-rose-500/30 bg-[#09090b] rounded-[24px] p-8 shadow-[0_0_50px_rgba(244,63,94,0.1)] text-center relative overflow-hidden">
                <div class="absolute top-0 inset-x-0 h-1 bg-rose-500"></div>
                <div class="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg class="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h2 class="text-2xl font-black tracking-tight text-white mb-3">Critical Action Required</h2>
                <p class="text-[14px] font-semibold text-white/60 leading-relaxed mb-8">${msg.message}</p>
                <button id="btn-ack-${msg.id}" class="w-full bg-rose-600 text-white font-black text-[14px] py-4 rounded-2xl active:scale-95 transition-all shadow-lg shadow-rose-600/20">Acknowledge to Proceed</button>
            </div>
        `;
        document.body.appendChild(blocker);

        document.getElementById(`btn-ack-${msg.id}`).addEventListener('click', () => {
            this.markAsDismissed(msg.id, msg.expires_at);
            blocker.style.opacity = '0';
            setTimeout(() => blocker.remove(), 300);
        });
    }

    /**
     * Level 2: Standard dismissible modal. Disappears forever once closed.
     */
    renderDismissible(msg) {
        const title = msg.mess_id === null ? "Global Broadcast" : "Direct Message";
        showModal({
            title: title,
            message: msg.message,
            type: msg.mess_id === null ? "danger" : "info",
            confirmText: "Dismiss",
            onConfirm: (closeModal) => {
                this.markAsDismissed(msg.id, msg.expires_at);
                if (closeModal) closeModal();
            }
        });
    }

    /**
     * Realtime WebSocket listener for inbound commands while app is open.
     */
    listenForRealtime() {
        supabase.channel('public:announcements')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, (payload) => {
                const msg = payload.new;
                const isTargeted = msg.mess_id === null || msg.mess_id === this.messId;
                const isExpired = new Date(msg.expires_at).getTime() < Date.now();
                
                if (!isTargeted || isExpired) return;

                if (msg.display_frequency === 'CRITICAL') {
                    this.renderCritical(msg);
                } else if (msg.display_frequency === 'DISMISSIBLE' || msg.display_frequency === 'ALWAYS') {
                    this.renderDismissible(msg);
                } else {
                    showToast(`New Message: ${msg.message}`, "info");
                    this.updateBellBadge(1);
                }
            })
            .subscribe();
    }

    /**
     * Time-To-Live (TTL) Garbage Collection:
     * Removes IDs from local storage if their actual deadline has passed to prevent cache bloat.
     */
    loadGarbageCollectedLog() {
        let log = [];
        try {
            const raw = localStorage.getItem('mm_dismissed_comms');
            if (raw) log = JSON.parse(raw);
            
            const now = Date.now();
            const cleanLog = log.filter(item => new Date(item.expires_at).getTime() > now);
            
            if (cleanLog.length !== log.length) {
                localStorage.setItem('mm_dismissed_comms', JSON.stringify(cleanLog));
            }
            return cleanLog;
        } catch(e) {
            localStorage.setItem('mm_dismissed_comms', JSON.stringify([]));
            return [];
        }
    }

    /**
     * Saves the dismissed state so it doesn't bother the user again.
     */
    markAsDismissed(id, expiresAtISO) {
        this.dismissedLog.push({ id, expires_at: expiresAtISO });
        localStorage.setItem('mm_dismissed_comms', JSON.stringify(this.dismissedLog));
    }
}

export const CommsEngine = new NotificationMatrix();
