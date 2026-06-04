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

// === Smooth scroll to top ===
window.scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

// === Sticky navbar scroll detection ===
window.initNavScroll = (dotNetRef) => {
    let lastState = false;
    const handler = () => {
        const scrolled = window.scrollY > 20;
        if (scrolled !== lastState) {
            lastState = scrolled;
            // If the component/circuit is gone the invoke rejects — self-clean
            // the listener so it doesn't leak for the life of the page.
            dotNetRef.invokeMethodAsync('OnScrollStateChanged', scrolled)
                .catch(() => window.removeEventListener('scroll', handler));
        }
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
};

// === Highlight a single code element by id ===
window.highlightById = (id) => {
    const el = document.getElementById(id);
    if (el && window.Prism) {
        Prism.highlightElement(el);
    }
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

    // Coalesce re-scans: the body-wide observer can fire on unrelated mutations
    // (e.g. every CodeMirror keystroke), so collapse work into one per frame.
    let observeScheduled = false;
    const scheduleObserve = () => {
        if (observeScheduled) return;
        observeScheduled = true;
        requestAnimationFrame(() => { observeScheduled = false; observeAll(); });
    };

    // Watch for Blazor dynamically adding elements
    // When Blazor reconciles prerendered DOM, newly-observed .reveal elements
    // that are already in the viewport get .visible immediately (no transition)
    // to prevent a visible flash.
    const mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                const reveals = node.matches && node.matches('.reveal:not(.visible)')
                    ? [node]
                    : (node.querySelectorAll ? Array.from(node.querySelectorAll('.reveal:not(.visible)')) : []);
                for (const el of reveals) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top < window.innerHeight && rect.bottom > 0) {
                        el.style.transition = 'none';
                        el.classList.add('visible');
                        // Re-enable transitions after paint
                        requestAnimationFrame(() => {
                            el.style.transition = '';
                        });
                    }
                }
            }
        }
        scheduleObserve();
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

    // Respect reduced-motion: skip the perpetual canvas animation entirely.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        canvas.style.display = 'none';
        return;
    }

    const ctx = canvas.getContext('2d');
    let animId = null;
    let running = false;
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
        if (!running) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        drawConnections();
        animId = requestAnimationFrame(animate);
    };

    const start = () => {
        if (running) return;
        running = true;
        animId = requestAnimationFrame(animate);
    };

    const stop = () => {
        running = false;
        if (animId) { cancelAnimationFrame(animId); animId = null; }
    };

    init();
    start();

    // Pause when the hero scrolls out of view (no point animating off-screen).
    const visibility = new IntersectionObserver((entries) => {
        entries.forEach(e => e.isIntersecting ? start() : stop());
    }, { threshold: 0 });
    visibility.observe(canvas);

    // Pause when the tab is backgrounded.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stop();
        } else if (canvas.getBoundingClientRect().top < window.innerHeight) {
            start();
        }
    });

    // Debounced resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(init, 200);
    });
};

// === Microsoft Clarity analytics ===
window.initClarity = (tagId) => {
    if (!tagId || window.clarity) return;
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", tagId);
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
