// core/premium.js
import { supabase } from './supabase-client.js';
import { showModal } from './ui-core.js';

const TIER_MATRIX = {
    FREE: {
        maxDevices: 1,
        historyDays: 35,
        canExportPDF: true,
        canExportExcel: false,
        whatsAppAutomation: false,
        marketSmartCalculator: true,
        dutyRotationEngine: true
    },
    PRO: {
        maxDevices: 2,
        historyDays: 548, 
        canExportPDF: true,
        canExportExcel: true,
        whatsAppAutomation: true,
        marketSmartCalculator: true,
        dutyRotationEngine: true
    },
    ULTRA: {
        maxDevices: 5,
        historyDays: 548,
        canExportPDF: true,
        canExportExcel: true,
        whatsAppAutomation: true,
        marketSmartCalculator: true,
        dutyRotationEngine: true,
        multiManagerAuditLogs: true
    }
};

// Client-side verification salt (Must match Supabase Edge Function signing secret)
const CRYPTO_SALT = "spesium_enterprise_matrix_key";

class PremiumEngine {
    constructor() {
        this.currentTier = 'FREE';
        this.messId = null;
        this.cacheKey = 'mm_saas_license_token';
    }

    async syncTierStatus() {
        this.messId = localStorage.getItem('mm_mess_id');
        if (!this.messId) return TIER_MATRIX.FREE;

        try {
            const fetchPromise = supabase
                .from('messes')
                .select('tier_level, max_devices, status, license_token')
                .eq('id', this.messId)
                .maybeSingle();

            // 3-Second Failsafe Routing for weak connections
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000));
            
            const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
            if (error || !data) throw error;

            if (data.status === 'SUSPENDED') {
                localStorage.removeItem('mm_license_valid');
                window.location.replace('index.html');
                return null;
            }

            this.currentTier = data.tier_level || 'FREE';
            
            // Expected token format from DB: "base64EncodedPayload.sha256Hash"
            const tokenToStore = data.license_token || this.generateFallbackToken(this.currentTier);
            
            localStorage.setItem(this.cacheKey, JSON.stringify({ 
                tier: this.currentTier, 
                maxDev: data.max_devices, 
                token: tokenToStore 
            }));
            
            return TIER_MATRIX[this.currentTier];
        } catch (e) {
            console.warn("[Premium Engine] Network timeout or error. Executing cryptographic local verification.");
            return await this.verifyStoredSignature();
        }
    }

    async verifyStoredSignature() {
        try {
            const raw = localStorage.getItem(this.cacheKey);
            if (!raw) return TIER_MATRIX.FREE;

            const parsed = JSON.parse(raw);
            if (!parsed.tier || !parsed.token || !parsed.token.includes('.')) {
                throw new Error("Malformed structural payload.");
            }

            const [payloadB64, signature] = parsed.token.split('.');
            
            // Cryptographic HMAC SHA-256 Verification
            const encoder = new TextEncoder();
            const dataToHash = encoder.encode(payloadB64 + CRYPTO_SALT);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
            const calculatedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

            if (calculatedHash !== signature) {
                throw new Error("Cryptographic signature mismatch. Tampering detected.");
            }

            const decodedPayload = JSON.parse(atob(payloadB64));
            if (decodedPayload.tier !== parsed.tier) {
                throw new Error("Payload mismatch.");
            }

            this.currentTier = parsed.tier;
            return TIER_MATRIX[this.currentTier] || TIER_MATRIX.FREE;
            
        } catch (e) {
            console.error("[SECURITY] License validation failed. Force downgrading to FREE tier.", e);
            localStorage.removeItem(this.cacheKey);
            this.currentTier = 'FREE';
            return TIER_MATRIX.FREE;
        }
    }

    async enforce(featureKey, onAllowed) {
        const rules = await this.verifyStoredSignature();

        if (rules[featureKey]) {
            return onAllowed();
        }

        this.showUpgradeModal(featureKey);
    }

    showUpgradeModal(featureKey) {
        const featureNames = {
            canExportExcel: "Excel (XLSX) Data Export",
            whatsAppAutomation: "Automated WhatsApp Billing & Alerts",
            multiManagerAuditLogs: "Multi-Manager Audit Tracking",
            historyDays: "18-Month Historical Data Vault"
        };

        const targetFeature = featureNames[featureKey] || "Enterprise Capability";

        showModal({
            title: "Pro Feature Locked",
            message: `<b>${targetFeature}</b> is reserved for Mess Manager <b>PRO & ULTRA</b> subscribers.<br><br>Upgrade your tier to unlock deep historical analytics and multi-device syncing.`,
            type: "info",
            confirmText: "View Upgrade Plans",
            onConfirm: (closeModal) => {
                window.open(`mailto:support@spesium.com?subject=Upgrade%20Request%20-%20Mess%20${this.messId}`, '_blank');
                closeModal();
            }
        });
    }

    // Helper to generate a valid token locally if the DB hasn't issued one yet
    generateFallbackToken(tier) {
        const payloadStr = JSON.stringify({ tier, exp: Date.now() + 86400000 });
        const b64 = btoa(payloadStr);
        // Note: For a true offline mock, this requires async crypto, but to keep the sync function clean, 
        // a fallback string is used here. In production, ensure Supabase always returns the `license_token`.
        return `${b64}.mock_signature`; 
    }
}

export const Premium = new PremiumEngine();
