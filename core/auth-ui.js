// core/auth-ui.js

export const AuthState = {
    STUDENT: 'student',
    MANAGER: 'manager',
    REGISTER: 'register',
    WAITLIST: 'waitlist',
    RECOVERY: 'recovery'
};

export class AuthUI {
    constructor(rootId, onStateChange) {
        this.root = document.getElementById(rootId);
        this.onStateChange = onStateChange; 
        this.currentState = AuthState.STUDENT;
    }

    render(state, data = {}) {
        this.currentState = state;
        this.root.innerHTML = ''; 
        
        let content = '';

        switch (state) {
            case AuthState.STUDENT: content = this.getStudentTemplate(); break;
            case AuthState.MANAGER: content = this.getManagerTemplate(); break;
            case AuthState.REGISTER: content = this.getRegisterTemplate(); break;
            case AuthState.WAITLIST: content = this.getWaitlistTemplate(data.phone); break;
            case AuthState.RECOVERY: content = this.getRecoveryTemplate(); break;
        }

        // Fluid, Keyboard-Safe Wrapper
        this.root.innerHTML = `
            <div class="w-full flex flex-col justify-center items-center min-h-full py-4 fade-in-up">
                <div class="w-full max-w-[360px] bg-[#09090b] border border-white/[0.08] rounded-[24px] p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,1)] relative overflow-hidden">
                    <div class="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                    ${content}
                </div>
                ${this.getSupportFooter()}
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        this.attachInternalListeners();
        this.attachFormatters();
    }

    getStudentTemplate() {
        return `
            <div class="text-center mb-8">
                <div class="w-14 h-14 bg-white/[0.03] border border-white/[0.06] rounded-[18px] flex items-center justify-center mx-auto mb-5 shadow-inner">
                    <i data-lucide="utensils" class="w-6 h-6 text-white/90"></i>
                </div>
                <h1 class="text-[22px] font-black tracking-tight text-white mb-1.5">Student Portal</h1>
                <p class="text-[13px] font-medium text-white/40">Enter your secure credentials</p>
            </div>
            
            <div class="space-y-4">
                <input type="text" id="auth-code" autocomplete="off" spellcheck="false" placeholder="Mess Code (e.g. M9X)" class="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-[14px] font-bold text-white placeholder-white/30 outline-none transition-all focus:bg-white/[0.06] focus:border-white/30 uppercase">
                
                <div class="flex items-center bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden transition-all focus-within:bg-white/[0.06] focus-within:border-white/30">
                    <div class="pl-5 pr-3 py-4 text-white/30 font-bold border-r border-white/10 select-none">+91</div>
                    <input type="tel" inputmode="numeric" pattern="[0-9]*" id="auth-phone" autocomplete="tel" placeholder="Mobile Number" maxlength="10" class="w-full bg-transparent text-[14px] font-bold text-white placeholder-white/30 outline-none px-4 py-4">
                </div>

                <input type="password" inputmode="numeric" pattern="[0-9]*" id="auth-pin" autocomplete="current-password" placeholder="PIN" maxlength="4" class="w-full bg-white/[0.03] border border-white/10 text-center tracking-[1em] text-xl font-black outline-none rounded-2xl px-5 py-4 text-white placeholder-white/30 placeholder:tracking-normal transition-all focus:bg-white/[0.06] focus:border-white/30">
                
                <button id="btn-user-login" class="w-full bg-white text-black hover:bg-gray-200 font-bold text-[14px] py-4 rounded-2xl transition-transform active:scale-95 mt-2 flex justify-center items-center gap-2">
                    Sign In <i data-lucide="arrow-right" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>
            
            <div class="text-center mt-7 pt-6 border-t border-white/[0.06]">
                <button data-switch-to="${AuthState.MANAGER}" class="text-[12px] font-bold text-white/40 hover:text-white transition-colors p-2">Switch to Manager Access</button>
            </div>
        `;
    }

    getManagerTemplate() {
        return `
            <div class="text-center mb-8">
                <div class="w-14 h-14 bg-telegram/10 border border-telegram/20 rounded-[18px] flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(51,144,236,0.15)]">
                    <i data-lucide="shield" class="w-6 h-6 text-telegram"></i>
                </div>
                <h1 class="text-[22px] font-black tracking-tight text-white mb-1.5">Manager Access</h1>
                <p class="text-[13px] font-medium text-white/40">Secure SaaS authorization</p>
            </div>
            
            <div class="space-y-4">
                <input type="text" id="mgr-code" autocomplete="off" spellcheck="false" placeholder="Mess Code (e.g. SP-1)" class="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-[14px] font-bold text-white placeholder-white/30 outline-none transition-all focus:bg-white/[0.06] focus:border-telegram/40 uppercase">
                
                <div class="flex items-center bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden transition-all focus-within:bg-white/[0.06] focus-within:border-telegram/40">
                    <div class="pl-5 pr-3 py-4 text-white/30 font-bold border-r border-white/10 select-none">+91</div>
                    <input type="tel" inputmode="numeric" pattern="[0-9]*" id="mgr-phone" autocomplete="tel" placeholder="Registered Mobile" maxlength="10" class="w-full bg-transparent text-[14px] font-bold text-white placeholder-white/30 outline-none px-4 py-4">
                </div>

                <input type="password" inputmode="numeric" pattern="[0-9]*" id="mgr-pin" autocomplete="current-password" placeholder="Manager PIN" maxlength="4" class="w-full bg-white/[0.03] border border-white/10 text-center tracking-[1em] text-xl font-black outline-none rounded-2xl px-5 py-4 text-white placeholder-white/30 placeholder:tracking-normal transition-all focus:bg-white/[0.06] focus:border-telegram/40">

                <button id="btn-mgr-login" class="w-full bg-telegram text-white font-bold text-[14px] py-4 rounded-2xl transition-transform active:scale-95 mt-2 shadow-[0_0_20px_rgba(51,144,236,0.25)] flex justify-center items-center gap-2">
                    Authorize Device
                </button>
                
                <div class="flex justify-between items-center px-2 pt-2">
                    <button data-switch-to="${AuthState.RECOVERY}" class="text-[11px] font-bold text-white/30 hover:text-white transition-colors p-1">Forgot PIN?</button>
                    <button data-switch-to="${AuthState.REGISTER}" class="text-[11px] font-bold text-telegram hover:text-blue-400 transition-colors p-1">New Hostel?</button>
                </div>
            </div>
            
            <div class="text-center mt-7 pt-6 border-t border-white/[0.06]">
                <button data-switch-to="${AuthState.STUDENT}" class="text-[12px] font-bold text-white/40 hover:text-white transition-colors p-2">Switch to Student Login</button>
            </div>
        `;
    }

    getRegisterTemplate() {
        return `
            <div class="text-center mb-8">
                <div class="w-14 h-14 bg-white text-black rounded-[18px] flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(255,255,255,0.15)]">
                    <i data-lucide="rocket" class="w-6 h-6"></i>
                </div>
                <h1 class="text-[22px] font-black tracking-tight text-white mb-1.5">Launch Mess</h1>
                <p class="text-[13px] font-medium text-white/40">Submit your lead to the Admin</p>
            </div>
            
            <div class="space-y-4">
                <input type="text" id="reg-hostel" autocomplete="off" spellcheck="false" placeholder="Hostel Name" class="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-[14px] font-bold text-white placeholder-white/30 outline-none transition-all focus:bg-white/[0.06] focus:border-white/30">
                <input type="text" id="reg-name" autocomplete="name" placeholder="Manager Name" class="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-[14px] font-bold text-white placeholder-white/30 outline-none transition-all focus:bg-white/[0.06] focus:border-white/30">
                
                <div class="flex items-center bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden transition-all focus-within:bg-white/[0.06] focus-within:border-white/30">
                    <div class="pl-5 pr-3 py-4 text-white/30 font-bold border-r border-white/10 select-none">+91</div>
                    <input type="tel" inputmode="numeric" pattern="[0-9]*" id="reg-phone" autocomplete="tel" placeholder="Mobile Number" maxlength="10" class="w-full bg-transparent text-[14px] font-bold text-white placeholder-white/30 outline-none px-4 py-4">
                </div>
                
                <button id="btn-submit-reg" class="w-full bg-white text-black font-bold text-[14px] py-4 rounded-2xl transition-transform active:scale-95 mt-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] flex justify-center items-center">
                    Submit Request
                </button>
            </div>
            
            <div class="text-center mt-7 pt-6 border-t border-white/[0.06]">
                <button data-switch-to="${AuthState.MANAGER}" class="text-[12px] font-bold text-white/40 hover:text-white transition-colors p-2 flex items-center justify-center gap-1 mx-auto"><i data-lucide="arrow-left" class="w-3 h-3"></i> Back to Login</button>
            </div>
        `;
    }

    getWaitlistTemplate(phone) {
        return `
            <div class="text-center mb-8">
                <div class="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-[18px] flex items-center justify-center mx-auto mb-5">
                    <i data-lucide="clock" class="w-6 h-6 text-amber-500"></i>
                </div>
                <h1 class="text-[22px] font-black tracking-tight text-white mb-1.5">Pending Approval</h1>
                <p class="text-[13px] font-medium text-white/40">+91 ${phone || '...'}</p>
            </div>
            
            <div class="space-y-5">
                <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 text-center">
                    <p class="text-[12px] font-medium text-white/50 leading-relaxed">Your application is currently under review by the Administration team.</p>
                </div>
                
                <button id="btn-check-status" class="w-full bg-amber-500 text-white font-bold text-[14px] py-4 rounded-2xl transition-transform active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.2)] flex justify-center items-center">
                    Check Status
                </button>
                
                <div class="text-center">
                    <button id="btn-cancel-req" class="text-[11px] font-bold text-rose-500/70 hover:text-rose-500 transition-colors uppercase tracking-wider p-2">Cancel Request</button>
                </div>
            </div>
        `;
    }

    getRecoveryTemplate() {
        return `
            <div class="text-center mb-8">
                <div class="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-[18px] flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(244,63,94,0.15)]">
                    <i data-lucide="key" class="w-6 h-6 text-rose-500"></i>
                </div>
                <h1 class="text-[22px] font-black tracking-tight text-rose-500 mb-1.5">Vault Recovery</h1>
                <p class="text-[13px] font-medium text-white/40">Reset PIN using your 12-Digit Key</p>
            </div>
            
            <div class="space-y-4">
                <input type="text" id="rec-code" autocomplete="off" spellcheck="false" placeholder="Mess Code" class="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-[14px] font-bold text-white placeholder-white/30 outline-none transition-all focus:bg-white/[0.06] focus:border-rose-500/40 uppercase">
                
                <div class="flex items-center bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden transition-all focus-within:bg-white/[0.06] focus-within:border-rose-500/40">
                    <div class="pl-5 pr-3 py-4 text-white/30 font-bold border-r border-white/10 select-none">+91</div>
                    <input type="tel" inputmode="numeric" pattern="[0-9]*" id="rec-phone" autocomplete="tel" placeholder="Registered Mobile" maxlength="10" class="w-full bg-transparent text-[14px] font-bold text-white placeholder-white/30 outline-none px-4 py-4">
                </div>

                <input type="text" id="rec-key" autocomplete="off" spellcheck="false" placeholder="Key (MM-XXXX-XXXX)" class="w-full bg-[#000000] border border-rose-500/30 text-rose-500 text-center text-[14px] font-mono font-bold outline-none rounded-2xl px-5 py-4 uppercase shadow-inner placeholder-rose-500/30 focus:border-rose-500/60 transition-all">
                
                <input type="password" inputmode="numeric" pattern="[0-9]*" id="rec-new-pin" autocomplete="new-password" placeholder="New 4-Digit PIN" maxlength="4" class="w-full bg-white/[0.03] border border-white/10 text-center tracking-[1em] text-xl font-black outline-none rounded-2xl px-5 py-4 text-white placeholder-white/30 placeholder:tracking-normal transition-all mt-4 focus:bg-white/[0.06] focus:border-rose-500/40">
                
                <button id="btn-submit-recovery" class="w-full bg-rose-500 text-white font-bold text-[14px] py-4 rounded-2xl transition-transform active:scale-95 mt-2 shadow-[0_0_20px_rgba(244,63,94,0.25)] flex justify-center items-center gap-2">
                    Reset PIN <i data-lucide="unlock" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>
            
            <div class="text-center mt-7 pt-6 border-t border-white/[0.06]">
                <button data-switch-to="${AuthState.MANAGER}" class="text-[12px] font-bold text-white/40 hover:text-white transition-colors p-2 flex items-center justify-center gap-1 mx-auto"><i data-lucide="arrow-left" class="w-3 h-3"></i> Cancel Recovery</button>
            </div>
        `;
    }

    getSupportFooter() {
        return `
            <div class="flex justify-center items-center gap-6 mt-6 pb-6 opacity-40 hover:opacity-100 transition-opacity w-full max-w-[360px] mx-auto">
                <a href="https://t.me/spesiumsupport" target="_blank" class="text-white hover:text-telegram transition-colors active:scale-90 p-2"><i data-lucide="send" class="w-5 h-5"></i></a>
                <a href="mailto:support@spesium.com" class="text-white hover:text-blue-400 transition-colors active:scale-90 p-2"><i data-lucide="mail" class="w-5 h-5"></i></a>
            </div>
        `;
    }

    attachFormatters() {
        // Automatically enforce numeric inputs
        const enforceNumeric = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); };
        this.root.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
            input.addEventListener('input', enforceNumeric);
        });
    }

    attachInternalListeners() {
        const switchButtons = this.root.querySelectorAll('[data-switch-to]');
        switchButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetState = e.currentTarget.getAttribute('data-switch-to');
                this.onStateChange(targetState);
            });
        });
    }
}
