// core/boot.js
import { supabase } from './supabase-client.js';
import { showToast, showModal, refreshIcons } from './ui-core.js';
import { AuthUI, AuthState } from './auth-ui.js'; 

// ==========================================
// 1. HARDWARE IDENTITY & CRYPTO ENGINE
// ==========================================
function getOrCreateDeviceId() {
    let did = localStorage.getItem('mm_device_id');
    if (!did) {
        did = crypto.randomUUID();
        localStorage.setItem('mm_device_id', did);
    }
    return did;
}

// 🧠 The Shadow Quarantine Fingerprint
function getHardwareSig() {
    let sig = localStorage.getItem('mm_hardware_sig');
    if (!sig) {
        // High-entropy footprint that survives standard clearing
        sig = crypto.randomUUID() + '-' + Date.now().toString(36);
        localStorage.setItem('mm_hardware_sig', sig);
    }
    return sig;
}

async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==========================================
// 2. MASTER BOOT SEQUENCE
// ==========================================
let uiEngine = null;

async function runBootSequence() {
    refreshIcons();
    const splash = document.getElementById('splash-screen');
    const bootStatus = document.getElementById('boot-status');
    const deviceId = getOrCreateDeviceId();
    getHardwareSig(); // Ensure fingerprint exists on boot

    const isManager = localStorage.getItem('mm_license_valid') === 'true';
    const messId = localStorage.getItem('mm_mess_id');

    if (isManager && messId) {
        if (bootStatus) bootStatus.innerText = "Verifying SaaS License...";
        try {
            const checkPromise = supabase.from('messes').select('active_devices, status').eq('id', messId).maybeSingle();
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 3000));
            
            const res = await Promise.race([checkPromise, timeoutPromise]);
            
            if (res.timeout) {
                window.location.replace('portal-manager.html');
                return;
            }

            if (res.data && res.data.status !== 'SUSPENDED' && res.data.active_devices.includes(deviceId)) {
                window.location.replace('portal-manager.html');
                return;
            } else {
                localStorage.clear();
                showModal({
                    title: "Session Expired",
                    message: res.data?.status === 'SUSPENDED' ? "Account suspended by Admin." : "Logged in from another device.",
                    type: "danger"
                });
            }
        } catch (e) {
            window.location.replace('portal-manager.html'); 
            return;
        }
    }

    if (bootStatus) bootStatus.innerText = "Checking User Session...";
    const userSession = localStorage.getItem('mm_user_session');
    if (userSession) {
        window.location.replace('portal-user.html');
        return;
    }

    setTimeout(() => {
        if (splash) {
            splash.style.transform = 'scale(1.05)';
            splash.style.opacity = '0';
        }
        
        setTimeout(() => {
            if (splash) splash.remove(); 
            
            uiEngine = new AuthUI('app-root', (newState) => {
                const data = newState === AuthState.WAITLIST ? { phone: localStorage.getItem('mm_pending_phone') } : {};
                uiEngine.render(newState, data);
            });

            const pendingPhone = localStorage.getItem('mm_pending_phone');
            if (pendingPhone) {
                uiEngine.render(AuthState.WAITLIST, { phone: pendingPhone });
            } else {
                uiEngine.render(AuthState.STUDENT);
            }
        }, 500); 
    }, 800); 
}

// ==========================================
// 3. EVENT DELEGATION ROUTER
// ==========================================
document.getElementById('app-root')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // --- REGISTRATION REQUEST ---
    if (btn.id === 'btn-submit-reg') {
        const hostel = document.getElementById('reg-hostel').value.trim();
        const name = document.getElementById('reg-name').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();

        if (!hostel || !name || phone.length !== 10) return showToast("All fields required. Phone must be 10 digits.", "error");

        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        refreshIcons();
        btn.disabled = true;

        try {
            // 🧠 BIND FINGERPRINT: Send hardware_sig to the backend for the Quarantine Matrix
            const { error } = await supabase.from('registration_requests').insert([{
                hostel_name: hostel, 
                manager_name: name, 
                manager_phone: phone, 
                hardware_sig: getHardwareSig(),
                status: 'PENDING'
            }]);
            if (error) throw error;

            localStorage.setItem('mm_pending_phone', phone);
            showToast("Request Sent Successfully!", "success");
            setTimeout(() => uiEngine.render(AuthState.WAITLIST, { phone }), 800);

        } catch (err) {
            showToast("Network error or connection blocked.", "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
            refreshIcons();
        }
    }

    // --- WAITLIST STATUS CHECK ---
    if (btn.id === 'btn-check-status') {
        const phone = localStorage.getItem('mm_pending_phone');
        if (!phone) return uiEngine.render(AuthState.MANAGER);

        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        refreshIcons();
        btn.disabled = true;

        try {
            const { data: reqData, error: reqErr } = await supabase.from('registration_requests')
                .select('status').eq('manager_phone', phone).order('created_at', { ascending: false }).limit(1).maybeSingle();

            if (reqErr) throw reqErr;

            if (reqData && reqData.status === 'APPROVED') {
                showModal({
                    title: "Application Approved",
                    message: "Please check your registered Email or WhatsApp for your 6-digit Activation Token.",
                    type: "success",
                    confirmText: "Proceed to Setup",
                    onConfirm: (closeModal) => {
                        closeModal();
                        uiEngine.render(AuthState.SETUP, { phone });
                    }
                });
            } else {
                showToast("Request is still pending review.", "info");
                btn.innerHTML = originalText;
                btn.disabled = false;
                refreshIcons();
            }
        } catch (err) {
            showToast("Error checking status.", "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
            refreshIcons();
        }
    }

    // --- ZERO-KNOWLEDGE ACCOUNT SETUP ---
    if (btn.id === 'btn-submit-setup') {
        const token = document.getElementById('setup-token').value.trim();
        const pin = document.getElementById('setup-pin').value.trim();
        const confirm = document.getElementById('setup-confirm').value.trim();
        const phone = localStorage.getItem('mm_pending_phone');

        if (token.length !== 6 || pin.length !== 4 || pin !== confirm) {
            return showToast("Token must be 6 digits. PINs must be 4 digits and match.", "error");
        }

        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        refreshIcons();
        btn.disabled = true;

        try {
            const hashedPin = await hashPin(pin);
            
            // Validate the token and push the hashed PIN securely
            const { data: updateData, error: updateErr } = await supabase.from('messes')
                .update({ manager_pin: hashedPin, activation_token: null })
                .eq('activation_token', token)
                .eq('manager_phone', phone)
                .select('mess_code').single();

            if (updateErr || !updateData) throw new Error("Invalid or Expired Token.");

            // 🧠 SELF-DESTRUCT PROTOCOL: Purge the original lead request instantly
            await supabase.from('registration_requests').delete().eq('manager_phone', phone);

            localStorage.removeItem('mm_pending_phone');
            
            showModal({
                title: "Vault Secured",
                message: `Your account is ready. Your Mess Code is: <b class="text-telegram">${updateData.mess_code}</b>.`,
                type: "success",
                onConfirm: (closeModal) => {
                    closeModal();
                    uiEngine.render(AuthState.MANAGER);
                }
            });

        } catch (err) {
            showToast(err.message, "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
            refreshIcons();
        }
    }

    // --- MANAGER LOGIN ---
    if (btn.id === 'btn-mgr-login') {
        const messCode = document.getElementById('mgr-code').value.trim().toUpperCase(); 
        const phone = document.getElementById('mgr-phone').value.trim();
        const pin = document.getElementById('mgr-pin').value.trim();

        if (!messCode || phone.length !== 10 || pin.length !== 4) {
            return showToast("Check Mess Code, Phone (10) and PIN (4).", "error");
        }

        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        refreshIcons();
        btn.disabled = true;

        try {
            const hashedInputPin = await hashPin(pin);
            const deviceId = getOrCreateDeviceId();
            
            const { data, error } = await supabase.from('messes')
                .select('*').eq('mess_code', messCode).eq('manager_phone', phone).eq('manager_pin', hashedInputPin).maybeSingle();

            if (error || !data) throw new Error("Invalid Credentials.");
            if (data.status === 'SUSPENDED') throw new Error("Subscription inactive.");

            let activeDevices = data.active_devices || [];
            const maxDevices = data.max_devices || 1;

            if (!activeDevices.includes(deviceId)) {
                activeDevices.push(deviceId);
                while (activeDevices.length > maxDevices) activeDevices.shift(); 
                const { error: updateErr } = await supabase.from('messes').update({ active_devices: activeDevices }).eq('id', data.id);
                if (updateErr) throw updateErr;
            }

            localStorage.setItem('mm_pin_hash', hashedInputPin);
            localStorage.setItem('mm_license_valid', 'true');
            localStorage.setItem('mm_mess_id', data.id);
            localStorage.setItem('mm_first_login', 'true'); 
            
            btn.innerHTML = "Login Successful!";
            btn.classList.replace('bg-telegram', 'bg-emerald-500');
            showToast("Device Authorized. Booting...", "success");
            setTimeout(() => window.location.replace('portal-manager.html'), 800);

        } catch (err) {
            showModal({ title: "Login Failed", message: err.message, type: "danger" });
            btn.innerHTML = originalText;
            btn.disabled = false;
            refreshIcons();
        }
    }

    // --- STUDENT LOGIN ---
    if (btn.id === 'btn-user-login') {
        const code = document.getElementById('auth-code').value.trim().toUpperCase();
        const phone = document.getElementById('auth-phone').value.trim();
        const pin = document.getElementById('auth-pin').value.trim();

        if (!code || phone.length !== 10 || pin.length !== 4) return showToast("Check Mess Code, Phone (10) and PIN (4).", "error");

        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        refreshIcons();
        btn.disabled = true;

        try {
            const { data: messData, error: messErr } = await supabase.from('messes').select('id, status').eq('mess_code', code).maybeSingle();
            if (messErr || !messData) throw new Error("Invalid Mess Code.");
            if (messData.status === 'SUSPENDED') throw new Error("Mess operations suspended by Admin.");

            const { data: userData, error: userErr } = await supabase.from('profiles')
                .select('id, name, phone, status')
                .eq('mess_id', messData.id).eq('phone', phone).eq('pin_hash', pin).eq('role', 'STUDENT').maybeSingle();

            if (userErr || !userData) throw new Error("Invalid Mobile or PIN.");
            if (userData.status === 'INACTIVE') throw new Error("Account deactivated by Manager.");

            localStorage.setItem('mm_user_session', JSON.stringify({ userId: userData.id, messId: messData.id, name: userData.name }));
            showToast("Login Successful!");
            setTimeout(() => window.location.replace('portal-user.html'), 800);

        } catch (err) {
            showModal({ title: "Login Failed", message: err.message, type: "danger" });
            btn.innerHTML = originalText;
            btn.disabled = false;
            refreshIcons();
        }
    }

    // --- WEB3 PIN RECOVERY ---
    if (btn.id === 'btn-submit-recovery') {
        const code = document.getElementById('rec-code').value.trim().toUpperCase();
        const phone = document.getElementById('rec-phone').value.trim();
        const key = document.getElementById('rec-key').value.trim().toUpperCase();
        const newPin = document.getElementById('rec-new-pin').value.trim();

        if (!code || phone.length !== 10 || !key || newPin.length !== 4) return showToast("Check formatting: Phone (10) and PIN (4).", "error");

        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>`;
        refreshIcons();
        btn.disabled = true;

        try {
            const { data, error } = await supabase.from('messes')
                .select('id, recovery_key').eq('mess_code', code).eq('manager_phone', phone).maybeSingle();

            if (error || !data) throw new Error("Invalid Mess Code or Phone.");
            if (data.recovery_key !== key) throw new Error("Invalid Recovery Key.");

            const hashedNewPin = await hashPin(newPin);
            const { error: updateErr } = await supabase.from('messes').update({ manager_pin: hashedNewPin }).eq('id', data.id);
            if (updateErr) throw new Error("Failed to reset PIN.");

            showModal({
                title: "Vault Recovered",
                message: "Your Manager PIN has been successfully reset. You can now log in.",
                type: "success",
                onConfirm: (closeModal) => {
                    uiEngine.render(AuthState.MANAGER);
                    if(closeModal) closeModal();
                }
            });

        } catch (err) {
            showModal({ title: "Recovery Failed", message: err.message, type: "danger" });
            btn.innerHTML = originalText;
            btn.disabled = false;
            refreshIcons();
        }
    }

    if (btn.id === 'btn-cancel-req') {
        localStorage.removeItem('mm_pending_phone');
        uiEngine.render(AuthState.MANAGER);
    }
});

// Start the engine safely
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runBootSequence);
} else {
    runBootSequence();
}
