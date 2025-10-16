(() => {
    if (window.geminiWorkerRunning) return;
    window.geminiWorkerRunning = true;

    const SELECTORS = {
        modelTitle: 'ms-model-selector-v3 .title',
        tempSlider: 'div[data-test-id="temperatureSliderContainer"] mat-slider input[type="range"]',
        topPSlider: 'input[type="range"][aria-label*="Top P"], input[type="range"][title*="Top P"], ms-slider[title*="Top P"] input[type="range"], .slider-container input[type="range"]:nth-of-type(2)',
        codeToggle: 'mat-slide-toggle.code-execution-toggle button',
        searchToggle: 'mat-slide-toggle.search-as-a-tool-toggle button',
        urlToggle: 'div[data-test-id="browseAsAToolTooltip"] button[role="switch"]',
        sysBtn: 'button[data-test-system-instructions-card]',
        sysClose: 'button[aria-label="Close panel"]',
        sysText: 'textarea[aria-label="System instructions"]',
        prompt: 'textarea[aria-label*="Type something"]',
        panel: '.ms-sliding-right-panel-dialog',
        chat: '.chat-view-container',
        turn: 'ms-turn',
        modalDialog: 'mat-mdc-dialog-container',
        modalRow: 'ms-model-carousel-row',
        modalContentBtn: 'ms-model-carousel-row .content-button'
    };

    if (!window.$BAS) {
        window.$BAS = {
            cache: new Map(),
            rafs: new Set(),
            obs: new Set(),
            applying: false,
            preset: null,
            applyQueue: []
        };
    }

    const $ = window.$BAS;

    const raf = (fn) => {
        const id = requestAnimationFrame(() => {
            $.rafs.delete(id);
            fn();
        });
        $.rafs.add(id);
        return id;
    };

    const getEl = (sel) => {
        if ($.cache.has(sel)) {
            const el = $.cache.get(sel);
            if (document.contains(el)) return el;
        }
        const el = document.querySelector(sel);
        if (el) $.cache.set(sel, el);
        return el;
    };

    const wait = (sel, cb, ms = 5000) => {
        const el = document.querySelector(sel);
        if (el) return cb(el);
        const obs = new MutationObserver(() => {
            const e = document.querySelector(sel);
            if (e) {
                obs.disconnect();
                $.obs.delete(obs);
                cb(e);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        $.obs.add(obs);
        setTimeout(() => {
            obs.disconnect();
            $.obs.delete(obs);
        }, ms);
    };

    const apply = (p) => {
        if (!p || $.applying) return;
        $.applying = true;
        $.cache.clear();

        const temp = getEl(SELECTORS.tempSlider);
        const topP = getEl(SELECTORS.topPSlider);
        const code = getEl(SELECTORS.codeToggle);
        const search = getEl(SELECTORS.searchToggle);
        const url = getEl(SELECTORS.urlToggle);

        if (temp && Math.abs(parseFloat(temp.value) - p.temperature) > 0.001) {
            temp.value = p.temperature;
            temp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (topP && Math.abs(parseFloat(topP.value) - p.topP) > 0.001) {
            topP.value = p.topP;
            topP.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (code && (code.getAttribute('aria-checked') === 'true') !== p.tools.codeExecution) {
            code.click();
        }
        if (search && (search.getAttribute('aria-checked') === 'true') !== p.tools.search) {
            search.click();
        }
        if (url && (url.getAttribute('aria-checked') === 'true') !== (p.tools.urlContext || false)) {
            url.click();
        }

        const btn = getEl(SELECTORS.sysBtn);
        if (btn) {
            btn.click();
            wait(`${SELECTORS.panel} ${SELECTORS.sysText}`, (area) => {
                if (area.value !== p.systemInstructions) {
                    area.value = p.systemInstructions;
                    area.dispatchEvent(new Event('input', { bubbles: true }));
                }
                const close = area.closest(SELECTORS.panel)?.querySelector(SELECTORS.sysClose);
                if (close) {
                    setTimeout(() => {
                        close.click();
                        const o = new MutationObserver(() => {
                            if (!document.querySelector(SELECTORS.panel)) {
                                o.disconnect();
                                $.applying = false;
                            }
                        });
                        o.observe(document.body, { childList: true, subtree: true });
                        setTimeout(() => {
                            o.disconnect();
                            $.applying = false;
                        }, 1000);
                    }, 50);
                } else {
                    $.applying = false;
                }
            });
        } else {
            $.applying = false;
        }
    };

    const queueApply = () => {
        if ($.preset) {
            clearTimeout($.applyTimer);
            $.applyTimer = setTimeout(() => {
                if (!$.applying) {
                    raf(() => apply($.preset));
                }
            }, 100);
        }
    };

    const observeModal = () => {
        const obs = new MutationObserver(() => {
            const modal = getEl(SELECTORS.modalDialog);
            if (modal && !modal.dataset.bas) {
                modal.dataset.bas = '1';

                const rows = modal.querySelectorAll(SELECTORS.modalRow);
                rows.forEach(row => {
                    const rowObs = new MutationObserver(() => {
                        if (row.classList.contains('selected')) {
                            queueApply();
                        }
                    });
                    rowObs.observe(row, { attributes: true, attributeFilter: ['class'] });
                    $.obs.add(rowObs);
                });

                const btns = modal.querySelectorAll(SELECTORS.modalContentBtn);
                btns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        setTimeout(queueApply, 100);
                    }, { once: true });
                });

                const close = modal.querySelector('[data-test-close-button]');
                if (close) {
                    close.addEventListener('click', () => {
                        setTimeout(queueApply, 100);
                    }, { once: true });
                }

                const removalObs = new MutationObserver((muts) => {
                    muts.forEach((mut) => {
                        mut.removedNodes.forEach((node) => {
                            if (node === modal || (node.contains && node.contains(modal))) {
                                removalObs.disconnect();
                                $.obs.delete(removalObs);
                                setTimeout(queueApply, 100);
                            }
                        });
                    });
                });
                removalObs.observe(document.body, { childList: true, subtree: true });
                $.obs.add(removalObs);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        $.obs.add(obs);
    };

    const observeModel = () => {
        wait(SELECTORS.modelTitle, (el) => {
            let last = '';
            const obs = new MutationObserver(() => {
                const m = el.textContent.trim().toLowerCase();
                if (m !== last) {
                    last = m;
                    queueApply();
                }
            });
            obs.observe(el, { characterData: true, childList: true, subtree: true });
            $.obs.add(obs);
        });
    };

    const observeUrl = () => {
        let lastUrl = location.href;
        let lastTitle = document.title;
        
        const urlObs = new MutationObserver(() => {
            if (location.href !== lastUrl || document.title !== lastTitle) {
                lastUrl = location.href;
                lastTitle = document.title;
                setTimeout(() => {
                    observeModel();
                    observeModal();
                    queueApply();
                }, 200);
            }
        });
        urlObs.observe(document.querySelector('title') || document.head, { childList: true, subtree: true });
        $.obs.add(urlObs);

        const setupAllLinks = () => {
            const allLinks = document.querySelectorAll('a');
            allLinks.forEach(link => {
                if (!link.dataset.bas && (link.href.includes('/prompts/') || link.href.includes('/library') || link.href.includes('aistudio.google.com'))) {
                    link.dataset.bas = '1';
                    link.addEventListener('click', () => {
                        setTimeout(() => {
                            observeModel();
                            observeModal();
                            queueApply();
                        }, 200);
                    });
                }
            });
        };

        const setupAllButtons = () => {
            const allButtons = document.querySelectorAll('button');
            allButtons.forEach(btn => {
                if (!btn.dataset.bas && (btn.textContent.includes('Back') || btn.textContent.includes('Previous') || btn.getAttribute('aria-label')?.includes('back'))) {
                    btn.dataset.bas = '1';
                    btn.addEventListener('click', () => {
                        setTimeout(() => {
                            observeModel();
                            observeModal();
                            queueApply();
                        }, 200);
                    });
                }
            });
        };

        const setupNavigation = () => {
            setupAllLinks();
            setupAllButtons();
        };

        setupNavigation();
        setInterval(setupNavigation, 200);

        const origPush = history.pushState;
        const origReplace = history.replaceState;
        const origBack = history.back;
        const origForward = history.forward;
        const origGo = history.go;

        history.pushState = function() {
            origPush.apply(this, arguments);
            setTimeout(() => {
                observeModel();
                observeModal();
                queueApply();
            }, 200);
        };

        history.replaceState = function() {
            origReplace.apply(this, arguments);
            setTimeout(() => {
                observeModel();
                observeModal();
                queueApply();
            }, 200);
        };

        history.back = function() {
            origBack.apply(this, arguments);
            setTimeout(() => {
                observeModel();
                observeModal();
                queueApply();
            }, 200);
        };

        history.forward = function() {
            origForward.apply(this, arguments);
            setTimeout(() => {
                observeModel();
                observeModal();
                queueApply();
            }, 200);
        };

        history.go = function() {
            origGo.apply(this, arguments);
            setTimeout(() => {
                observeModel();
                observeModal();
                queueApply();
            }, 200);
        };

        window.addEventListener('popstate', () => {
            setTimeout(() => {
                observeModel();
                observeModal();
                queueApply();
            }, 200);
        });

        window.addEventListener('beforeunload', () => {
            setTimeout(() => {
                observeModel();
                observeModal();
                queueApply();
            }, 200);
        });
    };

    const virtualizeChat = (container) => {
        const elementMap = new WeakMap();
        let pendingOperations = [];
        let rafId = null;

        const processOperations = () => {
            if (!pendingOperations.length) return;
            const batch = pendingOperations.splice(0);
            batch.forEach(({ target, state, action }) => {
                if (action === 'on' && state.content) {
                    target.appendChild(state.content);
                    state.rendered = true;
                } else if (action === 'off') {
                    const height = target.offsetHeight;
                    if (height > 0) {
                        state.height = height;
                        const fragment = document.createDocumentFragment();
                        while (target.firstChild) fragment.appendChild(target.firstChild);
                        state.content = fragment;
                        target.style.height = `${height}px`;
                        state.rendered = false;
                    }
                }
            });
            rafId = null;
        };

        const scheduleOperation = (target, state, action) => {
            pendingOperations.push({ target, state, action });
            if (!rafId) rafId = raf(processOperations);
        };

        const intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(({ target, isIntersecting }) => {
                const state = elementMap.get(target);
                if (!state) return;
                if (isIntersecting && !state.rendered) scheduleOperation(target, state, 'on');
                else if (!isIntersecting && state.rendered) scheduleOperation(target, state, 'off');
            });
        }, { root: container, rootMargin: '1500px' });

        const processNode = (node) => {
            if (node.matches?.(SELECTORS.turn)) {
                elementMap.set(node, { rendered: true, content: null, height: 0 });
                intersectionObserver.observe(node);
            }
        };

        let mutationBatch = [];
        let mutationRaf = null;

        const processMutations = () => {
            mutationBatch.forEach((mutation) => {
                if (mutation.type !== 'childList') return;
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    processNode(node);
                    node.querySelectorAll?.(SELECTORS.turn).forEach(processNode);
                });
                mutation.removedNodes.forEach((node) => {
                    if (node.nodeType === 1 && elementMap.has(node)) {
                        intersectionObserver.unobserve(node);
                        elementMap.delete(node);
                    }
                });
            });
            mutationBatch = [];
            mutationRaf = null;
        };

        const mutationObserver = new MutationObserver((mutations) => {
            mutationBatch.push(...mutations);
            if (!mutationRaf) mutationRaf = raf(processMutations);
        });

        container.querySelectorAll(SELECTORS.turn).forEach(processNode);
        mutationObserver.observe(container, { childList: true, subtree: true });
        $.obs.add(mutationObserver);
        $.obs.add(intersectionObserver);

        window.addEventListener('beforeunload', () => {
            mutationObserver.disconnect();
            intersectionObserver.disconnect();
            $.obs.delete(mutationObserver);
            $.obs.delete(intersectionObserver);
        }, { once: true, passive: true });
    };

    const init = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
            if (r.presets?.[r.activePresetIndex]) {
                $.preset = r.presets[r.activePresetIndex];
            }
        });

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.activePresetIndex || changes.presets) {
                chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
                    if (r.presets?.[r.activePresetIndex]) {
                        $.preset = r.presets[r.activePresetIndex];
                        queueApply();
                    }
                });
            }
        });

        if (!window.location.href.includes('/prompts/')) return;

        observeModel();
        observeModal();
        observeUrl();
        wait(SELECTORS.chat, virtualizeChat);

        setTimeout(() => {
            if ($.preset) {
                raf(() => apply($.preset));
            }
        }, 200);
    };

    window.addEventListener('beforeunload', () => {
        $.rafs.forEach(cancelAnimationFrame);
        $.rafs.clear();
        $.obs.forEach(o => o.disconnect());
        $.obs.clear();
        $.cache.clear();
    }, { once: true, passive: true });

    init();
})();
