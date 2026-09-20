// manager/overlay-calc.js
import { showToast, refreshIcons, triggerHaptic } from '../core/ui-core.js';

export function initCalcOverlay() {
    let widget = document.getElementById('calc-widget');
    
    if (widget) {
        closeWidget(widget);
        return;
    }

    widget = document.createElement('div');
    widget.id = 'calc-widget';
    // Samsung-Style Floating Architecture (Resizable & Draggable)
    widget.className = "fixed z-[9999] flex flex-col hardware-accelerated transition-opacity duration-200 opacity-0 overflow-hidden rounded-[24px] shadow-[0_30px_60px_rgba(0,0,0,0.9)] border border-white/10";
    
    // Initial Dimensions (Responsive constraints)
    const initialWidth = Math.min(window.innerWidth * 0.85, 340);
    const initialHeight = 500;
    
    widget.style.width = `${initialWidth}px`;
    widget.style.height = `${initialHeight}px`;
    widget.style.top = `${(window.innerHeight - initialHeight) / 2}px`;
    widget.style.left = `${(window.innerWidth - initialWidth) / 2}px`;

    // Dynamic Engine Defaults
    widget.style.backgroundColor = `rgba(9, 9, 11, 0.9)`;
    widget.style.backdropFilter = `blur(24px)`;
    widget.style.webkitBackdropFilter = `blur(24px)`;
    
    // Strict ASCII Keys to prevent encoding crashes
    const KEYS = ['C', '()', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL', '='];
    
    widget.innerHTML = `
        <!-- SAMSUNG-STYLE TOP BAR -->
        <div class="h-10 shrink-0 bg-white/[0.03] border-b border-white/[0.06] flex items-center justify-between px-3 relative z-40">
            <!-- Glassmorphism Transparency Toggle -->
            <button id="calc-btn-opacity" class="ripple-btn w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors hover:bg-white/10 active-scale">
                <i data-lucide="droplet" class="w-4 h-4 pointer-events-none"></i>
            </button>
            
            <!-- Center Drag Zone -->
            <div id="calc-drag-handle" class="flex-1 h-full flex items-center justify-center cursor-move touch-none">
                <div class="w-12 h-1.5 bg-white/20 rounded-full pointer-events-none"></div>
            </div>
            
            <!-- Context Actions -->
            <div class="flex items-center gap-1">
                <button id="calc-btn-history" class="ripple-btn w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors hover:bg-white/10 active-scale">
                    <i data-lucide="clock" class="w-4 h-4 pointer-events-none"></i>
                </button>
                <button id="calc-btn-close" class="ripple-btn w-7 h-7 rounded-full flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-colors active-scale">
                    <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>

            <!-- Hidden Dual-Binding Opacity Slider -->
            <div id="calc-opacity-slider" class="absolute top-12 left-2 bg-[#111113]/95 backdrop-blur-xl border border-white/10 p-3 rounded-[16px] shadow-xl flex items-center gap-3 transition-all duration-200 opacity-0 pointer-events-none scale-95 origin-top-left z-50">
                <i data-lucide="moon" class="w-3 h-3 text-white/40"></i>
                <input type="range" id="opacity-range" min="10" max="100" value="90" class="w-24 accent-telegram">
                <i data-lucide="sun" class="w-3 h-3 text-white"></i>
            </div>
        </div>
        
        <!-- MAIN WORKSPACE -->
        <div class="flex-1 relative overflow-hidden flex flex-col">
            
            <!-- PERMANENT HISTORY VAULT -->
            <div id="calc-history-view" class="absolute inset-0 bg-[#09090b]/95 backdrop-blur-lg z-30 flex flex-col transition-transform duration-300 translate-y-full">
                <div class="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                    <span class="text-[11px] font-black uppercase tracking-widest text-white/50">Calculation Audit Log</span>
                    <button id="calc-clear-history" class="text-[10px] font-bold text-rose-400 uppercase tracking-widest active-scale hover:text-rose-300">Clear Vault</button>
                </div>
                <div id="calc-history-list" class="flex-1 overflow-y-auto p-4 space-y-4 disable-scrollbars"></div>
            </div>

            <!-- CALCULATOR MATRICES -->
            <div class="p-4 flex flex-col h-full">
                
                <!-- SMART DISPLAY ZONE (Native Caret Splicing enabled) -->
                <div class="text-right mb-4 shrink-0 flex-1 flex flex-col justify-end relative">
                    <input type="text" id="calc-expr" inputmode="none" class="w-full bg-transparent text-right text-[16px] font-bold tracking-widest text-white/50 outline-none mb-1 font-mono transition-colors" placeholder="0">
                    <div id="calc-result" class="text-4xl font-black tracking-tighter truncate text-white max-w-full overflow-hidden transition-all">0</div>
                </div>

                <!-- ERGONOMIC NUMPAD -->
                <div class="grid grid-cols-4 gap-2 shrink-0 h-[70%]">
                    ${KEYS.map(key => {
                        const isOp = ['/', '*', '-', '+', '='].includes(key);
                        const isAction = ['C', 'DEL', '()', '%'].includes(key);
                        
                        let classes = "calc-key rounded-[14px] text-[22px] font-black active-scale transition-colors flex items-center justify-center ";
                        if (key === '=') classes += "bg-telegram text-white shadow-lg shadow-telegram/20";
                        else if (isOp) classes += "bg-white/5 text-telegram border border-white/5 hover:bg-white/10";
                        else if (isAction) classes += "bg-transparent text-white/40 border border-white/5 hover:bg-white/5";
                        else classes += "bg-white/5 text-white border border-white/5 hover:bg-white/10";
                        
                        let content = key;
                        if (key === 'DEL') content = '<i data-lucide="delete" class="w-5 h-5 pointer-events-none"></i>';
                        if (key === '/') content = '&divide;';
                        if (key === '*') content = '&times;';
                        
                        return `<button class="${classes}" data-key="${key}">${content}</button>`;
                    }).join('')}
                </div>
            </div>
        </div>

        <!-- DUAL-AXIS RESIZE HANDLES -->
        <div id="calc-resize-sw" class="absolute bottom-0 left-0 w-10 h-10 cursor-sw-resize touch-none flex items-end justify-start p-2 opacity-30 hover:opacity-100 transition-opacity z-40 transform scale-x-[-1]">
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M9 1L9 9L1 9" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div id="calc-resize-se" class="absolute bottom-0 right-0 w-10 h-10 cursor-se-resize touch-none flex items-end justify-end p-2 opacity-30 hover:opacity-100 transition-opacity z-40">
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M9 1L9 9L1 9" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
    `;
    
    document.body.appendChild(widget);
    refreshIcons();

    requestAnimationFrame(() => {
        widget.style.opacity = '1';
        document.getElementById('calc-expr').focus();
    });

    attachCalcLogic(widget);
    attachPiPPhysics(widget);
}

function closeWidget(widget) {
    triggerHaptic('light');
    widget.style.opacity = '0';
    widget.style.transform = 'scale(0.95)';
    setTimeout(() => widget.remove(), 200);
}

function attachCalcLogic(widget) {
    let calcHistory = JSON.parse(localStorage.getItem('mm_calc_history') || '[]');
    
    const inputExpr = document.getElementById('calc-expr');
    const displayResult = document.getElementById('calc-result');
    const historyView = document.getElementById('calc-history-view');
    const historyList = document.getElementById('calc-history-list');

    document.getElementById('calc-btn-close').addEventListener('click', () => closeWidget(widget));

    // --- DUAL-BINDING OPACITY ENGINE ---
    const opBtn = document.getElementById('calc-btn-opacity');
    const opSlider = document.getElementById('calc-opacity-slider');
    const opInput = document.getElementById('opacity-range');

    opBtn.addEventListener('click', () => {
        triggerHaptic('light');
        opSlider.classList.toggle('opacity-0');
        opSlider.classList.toggle('pointer-events-none');
        opSlider.classList.toggle('scale-95');
    });

    opInput.addEventListener('input', (e) => {
        const val = e.target.value / 100;
        widget.style.backgroundColor = `rgba(9, 9, 11, ${val})`;
        widget.style.backdropFilter = `blur(${24 * val}px)`;
        widget.style.webkitBackdropFilter = `blur(${24 * val}px)`;
    });

    // --- HISTORY VAULT ---
    const renderHistory = () => {
        if (calcHistory.length === 0) {
            historyList.innerHTML = `<div class="flex flex-col items-center justify-center py-10 opacity-30"><i data-lucide="clock" class="w-8 h-8 mb-2"></i><div class="font-bold text-[11px]">Vault is empty</div></div>`;
            refreshIcons();
            return;
        }
        historyList.innerHTML = calcHistory.map(h => `
            <div class="text-right border-b border-white/[0.04] pb-3 cursor-pointer history-item active-scale" data-res="${h.res}">
                <div class="text-[12px] font-bold text-white/40 mb-0.5 tracking-wider font-mono">${h.expr} =</div>
                <div class="text-[20px] font-black text-white font-mono tracking-tight">${h.res}</div>
                <div class="text-[9px] text-telegram uppercase font-bold tracking-widest mt-1">${h.time}</div>
            </div>
        `).join('');

        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                triggerHaptic('light');
                const val = e.currentTarget.getAttribute('data-res');
                inputExpr.value = val;
                inputExpr.focus();
                updateResultMatrix();
                historyView.classList.add('translate-y-full');
            });
        });
    };

    document.getElementById('calc-btn-history').addEventListener('click', () => {
        triggerHaptic('light');
        const isClosed = historyView.classList.contains('translate-y-full');
        if (isClosed) {
            renderHistory();
            historyView.classList.remove('translate-y-full');
        } else {
            historyView.classList.add('translate-y-full');
            inputExpr.focus();
        }
    });

    document.getElementById('calc-clear-history').addEventListener('click', () => {
        triggerHaptic('heavy');
        calcHistory = [];
        localStorage.removeItem('mm_calc_history');
        renderHistory();
    });

    // --- CORE ALGORITHM: EVALUATION & PERCENTAGE MATH ---
    const updateResultMatrix = () => {
        let mathStr = inputExpr.value;
        if (!mathStr) {
            displayResult.innerText = '0';
            return;
        }

        try {
            // Replace visual logic operators with actual JS operators
            mathStr = mathStr.replace(/×/g, '*').replace(/÷/g, '/');

            // Business Logic % Engine: 500 + 5% -> 500 + (500 * 0.05)
            mathStr = mathStr.replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)%/g, '($1 $2 ($1 * $3 / 100))');
            
            // Standard Percentage: * 5% -> * (5 / 100)
            mathStr = mathStr.replace(/(\d+(?:\.\d+)?)%/g, '($1 / 100)');

            if (!/[+\-*/.(]$/.test(mathStr)) {
              // Ensure balanced brackets before eval
              const openCount = (mathStr.match(/\(/g) ?? []).length;
              const closeCount = (mathStr.match(/\)/g) ?? []).length;

              if (openCount === closeCount) {
                    const result = new Function("return " + mathStr)();
                    if (isFinite(result)) {
                        displayResult.innerText = Number(result).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                        displayResult.classList.remove('text-rose-400');
                        displayResult.classList.add('text-white');
                    }
                }
            }
        } catch (e) {
            // Soft failure while typing incomplete formulas
        }
    };

    // --- NATIVE CARET SPLICING ENGINE ---
    const spliceInput = (char) => {
        const start = inputExpr.selectionStart;
        const end = inputExpr.selectionEnd;
        const val = inputExpr.value;
        
        inputExpr.value = val.substring(0, start) + char + val.substring(end);
        inputExpr.setSelectionRange(start + char.length, start + char.length);
        inputExpr.focus();
        updateResultMatrix();
    };

    widget.querySelectorAll('.calc-key').forEach(btn => {
        btn.addEventListener('click', (e) => {
            triggerHaptic('light');
            inputExpr.focus(); 

            const key = e.currentTarget.getAttribute('data-key');
            
            if (key === 'C') {
                inputExpr.value = '';
                displayResult.innerText = '0';
                displayResult.classList.remove('text-telegram');
            } 
            else if (key === 'DEL') {
                const start = inputExpr.selectionStart;
                const end = inputExpr.selectionEnd;
                
                if (start === end && start > 0) {
                    const val = inputExpr.value;
                    inputExpr.value = val.substring(0, start - 1) + val.substring(end);
                    inputExpr.setSelectionRange(start - 1, start - 1);
                    updateResultMatrix();
                } else if (start !== end) {
                    const val = inputExpr.value;
                    inputExpr.value = val.substring(0, start) + val.substring(end);
                    inputExpr.setSelectionRange(start, start);
                    updateResultMatrix();
                }
            } 
            else if (key === '=') {
                if (displayResult.innerText !== '0' && displayResult.innerText !== 'Error') {
                    const rawResult = displayResult.innerText.replace(/,/g, '');
                    const eq = inputExpr.value;
                    
                    if (eq !== rawResult) {
                        calcHistory.unshift({ expr: eq, res: rawResult, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) });
                        if (calcHistory.length > 30) calcHistory.pop(); 
                        localStorage.setItem('mm_calc_history', JSON.stringify(calcHistory));
                    }

                    inputExpr.value = rawResult;
                    displayResult.classList.add('text-telegram'); 
                    triggerHaptic('modal');
                }
            }
            else if (key === '()') {
              const pos = inputExpr.selectionStart;
              const beforeCursor = inputExpr.value.slice(0, pos);
              const openCount = (beforeCursor.match(/\(/g) ?? []).length;
              const closeCount = (beforeCursor.match(/\)/g) ?? []).length;
              const lastChar = beforeCursor.slice(-1);
              
              if (openCount > closeCount && /[0-9)]/.test(lastChar)) spliceInput(')');
              else spliceInput('(');
            }

            else {
                displayResult.classList.remove('text-telegram');
                spliceInput(key);
            }
        });
    });

    inputExpr.addEventListener('input', updateResultMatrix);
}

// 🧠 Smart Algorithm: Dual-Axis Screen-Bounded Physics
function attachPiPPhysics(widget) {
    const dragHandle = document.getElementById('calc-drag-handle');
    const resizeSE = document.getElementById('calc-resize-se');
    const resizeSW = document.getElementById('calc-resize-sw');
    
    const minW = Math.max(window.innerWidth * 0.2, 240);
    const maxW = window.innerWidth * 0.95;
    const minH = 350;
    const maxH = window.innerHeight * 0.9;

    // --- DRAG LOGIC ---
    let isDragging = false;
    let dragStartX, dragStartY, initialLeft, initialTop;

    const onDragStart = (e) => {
        if(e.target.closest('button')) return; 
        isDragging = true;
        dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
        dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
        initialLeft = widget.offsetLeft;
        initialTop = widget.offsetTop;
        widget.style.transition = 'none'; 
    };

    const onDragMove = (e) => {
        if (!isDragging) return;
        e.preventDefault(); 
        
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        
        let newX = initialLeft + (currentX - dragStartX);
        let newY = initialTop + (currentY - dragStartY);

        newX = Math.max(0, Math.min(newX, window.innerWidth - widget.offsetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - widget.offsetHeight));

        widget.style.left = `${newX}px`;
        widget.style.top = `${newY}px`;
    };

    const onDragEnd = () => { isDragging = false; };

    dragHandle.addEventListener('touchstart', onDragStart, { passive: false });
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
    dragHandle.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    // --- RESIZE LOGIC (Dual Axes) ---
    let isResizing = false;
    let resizeStartX, resizeStartY, initialWidth, initialHeight, activeHandle;

    const onResizeStart = (e, handleType) => {
        isResizing = true;
        activeHandle = handleType; 
        resizeStartX = e.touches ? e.touches[0].clientX : e.clientX;
        resizeStartY = e.touches ? e.touches[0].clientY : e.clientY;
        initialWidth = widget.offsetWidth;
        initialHeight = widget.offsetHeight;
        initialLeft = widget.offsetLeft;
        widget.style.transition = 'none';
        e.stopPropagation();
    };

    const onResizeMove = (e) => {
        if (!isResizing) return;
        e.preventDefault();
        
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaX = currentX - resizeStartX;
        const deltaY = currentY - resizeStartY;
        
        let newW, newH, newL = initialLeft;

        newH = Math.max(minH, Math.min(initialHeight + deltaY, maxH));
        if (widget.offsetTop + newH > window.innerHeight) newH = window.innerHeight - widget.offsetTop;

        if (activeHandle === 'SE') {
            newW = Math.max(minW, Math.min(initialWidth + deltaX, maxW));
            if (widget.offsetLeft + newW > window.innerWidth) newW = window.innerWidth - widget.offsetLeft;
        } else {
            // Southwest inverse scale engine
            newW = Math.max(minW, Math.min(initialWidth - deltaX, maxW));
            newL = initialLeft + deltaX;
            
            if (newL < 0) {
                newW = newW + newL; 
                newL = 0;
            }
            if (newW === maxW) {
                newL = initialLeft + (initialWidth - maxW);
            }
            widget.style.left = `${newL}px`;
        }

        widget.style.width = `${newW}px`;
        widget.style.height = `${newH}px`;
    };

    const onResizeEnd = () => { isResizing = false; };

    resizeSW.addEventListener('touchstart', (e) => onResizeStart(e, 'SW'), { passive: false });
    resizeSW.addEventListener('mousedown', (e) => onResizeStart(e, 'SW'));
    resizeSE.addEventListener('touchstart', (e) => onResizeStart(e, 'SE'), { passive: false });
    resizeSE.addEventListener('mousedown', (e) => onResizeStart(e, 'SE'));

    document.addEventListener('touchmove', onResizeMove, { passive: false });
    document.addEventListener('touchend', onResizeEnd);
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
}
