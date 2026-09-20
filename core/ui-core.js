// core/ui-core.js

/**
 * Core Haptic Feedback Engine
 * Replaces visual confirmation delays with immediate physical tactile responses.
 */
export function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    
    // 🧠 SMART ARCHITECTURE: The Global Haptic Gatekeeper
    if (localStorage.getItem('mm_haptics_enabled') === 'false') return;

    try {
        if (type === 'light') navigator.vibrate(10); // Success/Toggle (Sharp tap)
        if (type === 'heavy') navigator.vibrate([30, 40, 30]); // Error/Warn (Double buzz)
        if (type === 'modal') navigator.vibrate(15); // Modal pop (Medium tap)
    } catch (e) {}
}

export function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

/**
 * ⚡ Industry-Standard Pill Notification (Centered & Animated)
 */
export function showToast(message, type = 'success') {
    triggerHaptic(type === 'success' ? 'light' : 'heavy');

    const existingWrapper = document.getElementById('toast-wrapper');
    if (existingWrapper) existingWrapper.remove();

    // The Invisible Centering Wrapper (Bypasses Transform Collision)
    const wrapper = document.createElement('div');
    wrapper.id = 'toast-wrapper';
    wrapper.className = "fixed top-[calc(1.5rem+env(safe-area-inset-top,0px))] inset-x-0 z-[9999] flex justify-center pointer-events-none px-4";

    // The Animated Pill
    const toast = document.createElement('div');
    const baseClasses = "px-5 py-3 rounded-full shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] font-bold text-[12px] fade-in flex items-center gap-3 backdrop-blur-2xl border max-w-full truncate pointer-events-auto";
    
    if (type === 'success') {
        toast.className = `${baseClasses} bg-[#111113] text-white border-white/[0.08]`;
        toast.innerHTML = `<div class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] shrink-0"></div> <span class="truncate">${message}</span>`;
    } else if (type === 'info') {
        toast.className = `${baseClasses} bg-[#111113] text-white border-white/[0.08]`;
        toast.innerHTML = `<div class="w-2 h-2 rounded-full bg-telegram shadow-[0_0_8px_rgba(51,144,236,0.8)] shrink-0"></div> <span class="truncate">${message}</span>`;
    } else {
        toast.className = `${baseClasses} bg-rose-600 text-white border-rose-500/30`;
        toast.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4 text-white shrink-0"></i> <span class="truncate">${message}</span>`;
    }

    wrapper.appendChild(toast);
    document.body.appendChild(wrapper);

    refreshIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-15px) scale(0.9)';
        toast.style.transition = 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        setTimeout(() => wrapper.remove(), 300);
    }, 3000);
}

/**
 * 🧠 Cognitive-Load-Free Modal Engine
 */
export function showModal({ title, message, type = 'info', confirmText = 'OK', onConfirm = null }) {
    triggerHaptic('modal');
    
    const container = document.getElementById('modal-container');
    if (!container) return;
  
    const iconColor = type === 'danger' ? 'var(--theme-accent-danger)' : 'var(--theme-accent-primary)';
    const iconBg = type === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(51, 144, 236, 0.1)';

    container.innerHTML = `
        <div id="custom-modal" class="fixed inset-0 z-[9999] flex items-center justify-center px-6 hardware-accelerated">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-md fade-in" id="modal-backdrop"></div>
            
            <div class="relative w-full max-w-sm rounded-[24px] p-6 shadow-2xl fade-in flex flex-col items-center text-center theme-card active-scale" style="background-color: var(--theme-bg-surface);">
                
                <div class="w-14 h-14 rounded-[16px] flex items-center justify-center mb-5" style="background-color: ${iconBg}; color: ${iconColor};">
                    <i data-lucide="${type === 'danger' ? 'alert-triangle' : 'info'}" class="w-6 h-6"></i>
                </div>
                
                <h3 class="text-[18px] font-black tracking-tight mb-2" style="color: var(--theme-text-main);">${title}</h3>
                <p class="text-[13px] font-medium mb-8 leading-relaxed" style="color: var(--theme-text-muted);">${message}</p>
                
                <div class="flex gap-2.5 w-full">
                    ${type === 'danger' ? `<button id="modal-btn-cancel" class="flex-1 py-3.5 rounded-[14px] font-bold text-[13px] active-scale" style="background-color: var(--theme-bg-elevated); color: var(--theme-text-main);">Cancel</button>` : ''}
                    <button id="modal-btn-confirm" class="flex-1 py-3.5 rounded-[14px] font-bold text-[13px] text-white active-scale shadow-lg" style="background-color: ${iconColor};">${confirmText}</button>
                </div>
            </div>
        </div>
    `;
    
    refreshIcons();

    const closeModal = () => { 
        const modalEl = container.querySelector('.theme-card');
        if(modalEl) modalEl.style.transform = 'scale(0.95)';
        setTimeout(() => container.innerHTML = '', 150);
    };

    document.getElementById('modal-backdrop').addEventListener('click', closeModal);
    const cancelBtn = document.getElementById('modal-btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    document.getElementById('modal-btn-confirm').addEventListener('click', () => {
        triggerHaptic('light');
        if (onConfirm) onConfirm(closeModal);
        else closeModal();
    });
}

/**
 * 🧱 Perceived Performance Engine (Skeleton UI)
 * Generates exact structural replicas of components to eliminate layout shift during data sync.
 */
export function getSkeletonUI(type = 'roster') {
    if (type === 'roster') {
        return Array(4).fill(0).map(() => `
            <div class="theme-card rounded-[1.25rem] p-4 flex flex-col gap-3 shadow-sm border-transparent opacity-60">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full skeleton-pulse shrink-0"></div>
                    <div class="flex-1">
                        <div class="h-4 w-32 rounded skeleton-pulse mb-1.5"></div>
                        <div class="h-2 w-16 rounded skeleton-pulse"></div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <div class="flex-1 h-8 rounded-xl skeleton-pulse"></div>
                    <div class="flex-1 h-8 rounded-xl skeleton-pulse"></div>
                </div>
            </div>
        `).join('');
    }
    
    if (type === 'ledger') {
        return Array(5).fill(0).map(() => `
            <div class="theme-card rounded-[1.25rem] p-3.5 flex items-center justify-between shadow-sm border-transparent opacity-60">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full skeleton-pulse shrink-0"></div>
                    <div class="flex-col gap-1.5 flex">
                        <div class="h-3 w-24 rounded skeleton-pulse"></div>
                        <div class="h-2 w-12 rounded skeleton-pulse"></div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                    <div class="h-3 w-16 rounded skeleton-pulse"></div>
                    <div class="h-2 w-10 rounded skeleton-pulse"></div>
                </div>
            </div>
        `).join('');
    }

    return '';
}

/**
 * 🎯 GLOBAL DELEGATED RIPPLE ENGINE
 * Attaches instantly to any element with the class '.ripple-btn'. 
 * Handles pointer normalization and keyboard accessibility natively.
 */
if (typeof window !== 'undefined') {
    document.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('.ripple-btn');
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        
        // Handle keyboard 'Enter' triggers which pass coordinates as (0,0)
        const isKeyboard = e.clientX === 0 && e.clientY === 0;
        const clientX = isKeyboard ? rect.left + rect.width / 2 : e.clientX;
        const clientY = isKeyboard ? rect.top + rect.height / 2 : e.clientY;
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const ripple = document.createElement('span');
        ripple.className = 'absolute bg-white/20 rounded-full pointer-events-none transform -translate-x-1/2 -translate-y-1/2 animate-[ping_0.4s_ease-out_forwards] z-10';
        ripple.style.width = '120px';
        ripple.style.height = '120px';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        
        if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
        btn.style.overflow = 'hidden';
        btn.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 400);
    });
}
