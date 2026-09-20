// core/bughunter.js
(function initBugHunterSentinel() {
    window.__MM_SENTINEL_ACTIVE__ = true;
    window.__MM_BOOT_STARTED__ = false;
    window.__MM_BOOT_COMPLETED__ = false;

    // Helper: Mount directly to <html> to bypass <body> opacity/display bugs
    function getRootContainer() {
        let container = document.getElementById('bughunter-sentinel');
        if (!container) {
            container = document.createElement('div');
            container.id = 'bughunter-sentinel';
            container.style.cssText = `
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                max-height: 70vh !important;
                overflow-y: auto !important;
                background-color: rgba(9, 9, 11, 0.98) !important;
                backdrop-filter: blur(16px) !important;
                border-top: 2px solid #ef4444 !important;
                z-index: 2147483647 !important;
                padding: 16px !important;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
                font-size: 11px !important;
                color: #f4f4f5 !important;
                box-shadow: 0 -10px 40px rgba(0,0,0,0.8) !important;
            `;

            const header = document.createElement('div');
            header.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #27272a;";
            header.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#ef4444; box-shadow:0 0 10px #ef4444;"></span>
                    <span style="font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#ef4444;">BugHunter Sentinel (WSOD Inspector)</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button id="bh-btn-force-reveal" style="background:#2563eb; color:white; border:none; padding:4px 10px; border-radius:6px; font-weight:bold; cursor:pointer;">Force Reveal UI</button>
                    <button id="bh-btn-purge" style="background:#dc2626; color:white; border:none; padding:4px 10px; border-radius:6px; font-weight:bold; cursor:pointer;">Clear Storage</button>
                    <button id="bh-btn-close" style="background:#27272a; color:#a1a1aa; border:none; padding:4px 10px; border-radius:6px; font-weight:bold; cursor:pointer;">Close</button>
                </div>
            `;
            container.appendChild(header);

            // Mount directly to documentElement (never body)
            document.documentElement.appendChild(container);

            document.getElementById('bh-btn-close').onclick = () => container.remove();
            document.getElementById('bh-btn-force-reveal').onclick = () => {
                if (document.body) {
                    document.body.classList.remove('opacity-0');
                    document.body.style.opacity = '1';
                    document.body.style.visibility = 'visible';
                }
            };
            document.getElementById('bh-btn-purge').onclick = () => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace('./index.html');
            };
        }
        return container;
    }

    function renderDiagnostic(title, message, trace, isWarning = false) {
        const container = getRootContainer();
        const errDiv = document.createElement('div');
        errDiv.style.cssText = "margin-bottom:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.08);";
        errDiv.innerHTML = `
            <div style="color:${isWarning ? '#f59e0b' : '#f87171'}; font-weight:900; font-size:12px; margin-bottom:4px;">${title}</div>
            <div style="color:#e4e4e7; font-weight:600; margin-bottom:6px; word-break:break-word;">${message}</div>
            ${trace ? `<pre style="color:#71717a; margin:0; overflow-x:auto; white-space:pre-wrap; font-size:10px; background:#000; padding:8px; border-radius:4px;">${trace}</pre>` : ''}
        `;
        container.appendChild(errDiv);
    }

    // 1. Standard Runtime & Syntax Errors
    window.onerror = function (message, source, lineno, colno, error) {
        const file = source ? source.split('/').pop() : 'inline';
        renderDiagnostic(`Runtime Exception [${file}:${lineno}]`, message, error?.stack || `Column: ${colno}`);
        return false;
    };

    // 2. Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', function (e) {
        const err = e.reason;
        renderDiagnostic("Unhandled Promise Rejection", err?.message || String(err), err?.stack || "No stack trace available.");
    });

    // 3. Module & Asset Loading Errors
    window.addEventListener('error', function (e) {
        if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {
            renderDiagnostic("Resource / Module Fetch Failure", `Failed to load: ${e.target.src || e.target.href}`, "Verify that the path is valid and the file exports all imported symbols.");
        }
    }, true);

    // 4. Console.Error Capture
    const origConsoleError = console.error;
    console.error = function (...args) {
        const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
        renderDiagnostic("Console Error Intercepted", message, null, true);
        origConsoleError.apply(console, args);
    };

    // 5. THE WSOD WATCHDOG TIMER
    // If the body is still hidden or unpopulated after 1.8 seconds, sound the alarm.
    setTimeout(() => {
        const body = document.body;
        const mainContent = document.getElementById('main-content');
        const isBodyHidden = body && (body.classList.contains('opacity-0') || getComputedStyle(body).opacity === '0');
        const isMainEmpty = !mainContent || mainContent.children.length === 0;

        if (isBodyHidden || (!window.__MM_BOOT_COMPLETED__ && isMainEmpty)) {
            renderDiagnostic(
                "WSOD Deadlock Detected by Watchdog",
                `The page is blank. Reasons identified:
- document.body opacity: ${body ? getComputedStyle(body).opacity : 'Missing body'}
- Body contains 'opacity-0': ${body ? body.classList.contains('opacity-0') : 'N/A'}
- Boot routine started: ${window.__MM_BOOT_STARTED__}
- Boot routine completed: ${window.__MM_BOOT_COMPLETED__}
- Active session (mm_license_valid): ${localStorage.getItem('mm_license_valid')}
- Active Mess ID (mm_mess_id): ${localStorage.getItem('mm_mess_id')}`,
                "Remedy: Ensure boot routine execution is not blocked by a stalled network await. Click 'Force Reveal UI' above to inspect DOM elements.",
                false
            );

            // Auto-heal body opacity so developer can see the page state
            if (body) {
                body.classList.remove('opacity-0');
                body.style.opacity = '1';
            }
        }
    }, 1800);
})();
