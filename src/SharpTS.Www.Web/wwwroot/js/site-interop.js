// === Clipboard interop ===
window.copyToClipboard = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
    }
};

// === Prism.js re-highlight ===
window.highlightCode = (element) => {
    if (element && window.Prism) {
        Prism.highlightAllUnder(element);
    }
};

window.highlightAll = () => {
    if (window.Prism) {
        Prism.highlightAll();
    }
};

// === Sticky navbar scroll detection ===
window.initNavScroll = (dotNetRef) => {
    let lastState = false;
    const check = () => {
        const scrolled = window.scrollY > 20;
        if (scrolled !== lastState) {
            lastState = scrolled;
            dotNetRef.invokeMethodAsync('OnScrollStateChanged', scrolled);
        }
    };
    window.addEventListener('scroll', check, { passive: true });
    check();
};

// === Scroll reveal animations with stagger ===
(function () {
    const observeAll = () => {
        document.querySelectorAll('.reveal:not(.visible)').forEach(el => {
            observer.observe(el);
        });
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                // Stagger siblings
                const parent = entry.target.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.querySelectorAll('.reveal:not(.visible)'));
                    const idx = siblings.indexOf(entry.target);
                    const delay = Math.max(0, idx) * 80;
                    setTimeout(() => {
                        entry.target.classList.add('visible');
                    }, delay);
                } else {
                    entry.target.classList.add('visible');
                }
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.05,
        rootMargin: '50px 0px -20px 0px'  // generous top margin so above-fold items trigger
    });

    // Watch for Blazor dynamically adding elements
    const mutationObserver = new MutationObserver(() => {
        observeAll();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    // Initial pass
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeAll);
    } else {
        observeAll();
    }
    // Also run after a short delay for Blazor Server render
    setTimeout(observeAll, 100);
    setTimeout(observeAll, 500);
})();

// === Hero floating particles ===
window.initHeroParticles = (canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animId;
    let particles = [];

    const resize = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    };

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.3;
            this.speedY = (Math.random() - 0.5) * 0.3;
            this.opacity = Math.random() * 0.5 + 0.1;
            this.hue = Math.random() > 0.5 ? 215 : 280; // TS blue or C# purple
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                this.reset();
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${this.hue}, 60%, 60%, ${this.opacity})`;
            ctx.fill();
        }
    }

    const init = () => {
        resize();
        const count = Math.min(60, Math.floor(canvas.width * canvas.height / 15000));
        particles = Array.from({ length: count }, () => new Particle());
    };

    const drawConnections = () => {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(88, 166, 255, ${0.06 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    };

    const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        drawConnections();
        animId = requestAnimationFrame(animate);
    };

    init();
    animate();

    // Debounced resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(init, 200);
    });
};

// === Typing effect for hero code ===
window.initTypingEffect = (elementId) => {
    const el = document.getElementById(elementId);
    if (!el) return;

    const fullText = el.textContent || '';
    el.textContent = '';
    el.style.minHeight = '300px';

    let index = 0;
    const speed = 18; // ms per character

    const type = () => {
        if (index < fullText.length) {
            // Add characters in small bursts for speed
            const burst = Math.min(3, fullText.length - index);
            el.textContent += fullText.substring(index, index + burst);
            index += burst;
            setTimeout(type, speed);
        } else {
            // Done typing, apply syntax highlighting
            el.style.minHeight = '';
            if (window.Prism) {
                Prism.highlightElement(el);
            }
        }
    };

    // Start after a small delay to let the page settle
    setTimeout(type, 400);
};

// === CodeMirror interop ===
window.cmInstances = {};

window.createCodeMirror = async (elementId, initialCode) => {
    const { basicSetup } = await import('https://esm.sh/codemirror');
    const { EditorView, keymap } = await import('https://esm.sh/@codemirror/view');
    const { EditorState } = await import('https://esm.sh/@codemirror/state');
    const { javascript } = await import('https://esm.sh/@codemirror/lang-javascript');
    const { oneDark } = await import('https://esm.sh/@codemirror/theme-one-dark');

    const container = document.getElementById(elementId);
    if (!container) return false;
    container.innerHTML = '';

    const state = EditorState.create({
        doc: initialCode || '',
        extensions: [
            basicSetup,
            javascript({ typescript: true }),
            oneDark,
            EditorView.theme({
                '&': { height: '100%', fontSize: '14px' },
                '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace" },
                '.cm-content': { padding: '12px 0' },
                '.cm-gutters': { backgroundColor: '#1e1e2e', border: 'none' }
            }),
            keymap.of([{
                key: 'Ctrl-Enter',
                run: () => {
                    const runBtn = document.getElementById('playground-run-btn');
                    if (runBtn) runBtn.click();
                    return true;
                }
            }, {
                key: 'Cmd-Enter',
                run: () => {
                    const runBtn = document.getElementById('playground-run-btn');
                    if (runBtn) runBtn.click();
                    return true;
                }
            }])
        ]
    });

    const view = new EditorView({ state, parent: container });
    window.cmInstances[elementId] = view;
    return true;
};

window.getCodeMirrorValue = (elementId) => {
    const view = window.cmInstances[elementId];
    return view ? view.state.doc.toString() : '';
};

window.setCodeMirrorValue = (elementId, value) => {
    const view = window.cmInstances[elementId];
    if (view) {
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: value }
        });
    }
};

window.disposeCodeMirror = (elementId) => {
    const view = window.cmInstances[elementId];
    if (view) {
        view.destroy();
        delete window.cmInstances[elementId];
    }
};
