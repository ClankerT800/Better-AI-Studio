(() => {     if (window.geminiWorkerRunning) return;
    window.geminiWorkerRunning = true;

    const SELECTORS = {
        modelTitle: 'ms-model-selector-v3 .title',
        tempSlider: 'div[data-test-id="temperatureSliderContainer"] mat-slider input[type="range"]',
        topPSlider: 'div[data-test-id="topPSliderContainer"] input[type="range"], .advanced-settings input[type="range"][step="0.05"][max="1"], .settings-item-column input[type="range"][step="0.05"][max="1"]',
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
        modalContentBtn: 'ms-model-carousel-row .content-button',
        accountSwitcher: '.account-switcher-text',
        userName: '.name',
        accountDropdown: '[class*="account"], [class*="profile"], [class*="user"]',
        dropdownTrigger: 'button[aria-expanded], [role="button"]:has(.account-switcher-text), button[class*="account"], button[aria-label*="Account"], button[aria-label*="Profile"]'
    };

    if (!window.$BAS) {
        window.$BAS = {
            cache: new Map(),
            rafs: new Set(),
            obs: new Set(),
            applying: false,
            preset: null
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

        const expandSections = () => {
            const headers = document.querySelectorAll('.settings-group-header');
            const toolsHeader = Array.from(headers).find(h => 
                h.querySelector('.group-title')?.textContent.includes('Tools'));
            const advancedHeader = Array.from(headers).find(h => 
                h.querySelector('.group-title')?.textContent.includes('Advanced'));
            
            if (toolsHeader && !document.querySelector(SELECTORS.codeToggle)) {
                toolsHeader.click();
            }
            if (advancedHeader && !document.querySelector(SELECTORS.topPSlider)) {
                advancedHeader.click();
            }
        };

        expandSections();
        
        setTimeout(() => {
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
        }, 100);

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
                    observeAccountSwitcher();
                     queueApply();
                }, 200);
            }
        });

        const titleElement = document.querySelector('title') || document.head;
        urlObs.observe(titleElement, { childList: true, subtree: true });
        $.obs.add(urlObs);

        const setupNavigation = () => {
            const handleNavigation = () => {
                setTimeout(() => {
                    observeModel();
                    observeModal();
                    observeAccountSwitcher();
                    queueApply();
                }, 200);
            };

            document.querySelectorAll('a').forEach(link => {
                if (!link.dataset.bas &&
                    (link.href.includes('/prompts/') ||
                     link.href.includes('/library') ||
                     link.href.includes('aistudio.google.com'))) {
                    link.dataset.bas = '1';
                    link.addEventListener('click', handleNavigation);
                }
            });

            document.querySelectorAll('button').forEach(btn => {
                if (!btn.dataset.bas &&
                    (btn.textContent.includes('Back') ||
                     btn.textContent.includes('Previous') ||
                     btn.getAttribute('aria-label')?.includes('back'))) {
                    btn.dataset.bas = '1';
                    btn.addEventListener('click', handleNavigation);
                }
            });
        };

        setupNavigation();
        setInterval(setupNavigation, 200);

        const origPush = history.pushState;
        const origReplace = history.replaceState;
        const origBack = history.back;
        const origForward = history.forward;
        const origGo = history.go;

        const handleNavigation = () => {
            setTimeout(() => {
                observeModel();
                observeModal();
                observeAccountSwitcher();
               queueApply();
            }, 200);
        };

        history.pushState = function() {
            origPush.apply(this, arguments);
            handleNavigation();
        };

        history.replaceState = function() {
            origReplace.apply(this, arguments);
            handleNavigation();
        };

        history.back = function() {
            origBack.apply(this, arguments);
            handleNavigation();
        };

        history.forward = function() {
            origForward.apply(this, arguments);
            handleNavigation();
        };

        history.go = function() {
            origGo.apply(this, arguments);
            handleNavigation();
        };

        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('beforeunload', handleNavigation);
    };

    const observeAccountSwitcher = () => {
        const accountObs = new MutationObserver(() => {
            // INSTANT replacement - no delays whatsoever
            replaceAccountEmailWithName();
        });

        // Observe the entire document for INSTANT changes to account switcher and name elements
        accountObs.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'data-testid', 'aria-label'],
            characterData: true
        });
        $.obs.add(accountObs);

        // INSTANT check - happens immediately with zero delay
        replaceAccountEmailWithName();
    };

    const replaceAccountEmailWithName = () => {
        // INSTANT DOM queries - no caching delays
        const accountSwitcher = document.querySelector(SELECTORS.accountSwitcher);
        const userName = document.querySelector(SELECTORS.userName);

        if (accountSwitcher && userName) {
            // Only replace if it contains an email (has @ symbol) and we have a name
            if (accountSwitcher.textContent.includes('@') && userName.textContent.trim()) {
                accountSwitcher.textContent = userName.textContent.trim();
                return;
            }
        }

        // If we don't have both elements or the account switcher doesn't have email,
        // try to automatically trigger the dropdown to reveal the name
        const currentAccountSwitcher = document.querySelector(SELECTORS.accountSwitcher);
        if (currentAccountSwitcher && currentAccountSwitcher.textContent.includes('@')) {
            triggerAccountDropdown();
        }
    };

    const recordOverlayState = (container) => ({
        container,
        style: container.getAttribute('style') ?? ''
    });

    const maskOverlayContainer = () => {
        const container = document.querySelector('.cdk-overlay-container');
        if (!container) return null;
        const snapshot = recordOverlayState(container);
        container.style.visibility = 'hidden';
        container.style.opacity = '0';
        container.style.pointerEvents = 'none';
        container.style.transform = 'translate3d(-9999px, -9999px, 0)';
        container.style.transition = 'none';
        return snapshot;
    };

    const restoreOverlayContainer = (snapshot) => {
        if (!snapshot) return;
        const { container, style } = snapshot;
        requestAnimationFrame(() => {
            if (!container) return;
            if (style) container.setAttribute('style', style);
            else container.removeAttribute('style');
        });
    };

    const triggerAccountDropdown = () => {
        // INSTANT DOM query - no caching
        const accountSwitcher = document.querySelector(SELECTORS.accountSwitcher);
        if (!accountSwitcher) return;

        // Look for dropdown triggers in order of specificity
        const triggers = [
            // Most specific: account switcher container with button
            accountSwitcher.closest('[class*="account-switcher"]')?.querySelector('button'),
            accountSwitcher.closest('[class*="profile"]')?.querySelector('button'),
            // Parent elements that might be clickable
            accountSwitcher.closest('button'),
            accountSwitcher.closest('[role="button"]'),
            // Common account dropdown selectors
            document.querySelector('button[aria-label*="Account"]'),
            document.querySelector('button[aria-label*="Profile"]'),
            document.querySelector('button[class*="account"]'),
            document.querySelector('button[class*="profile"]'),
            document.querySelector('[class*="account-dropdown"] button'),
            document.querySelector('[class*="profile-dropdown"] button'),
            // Look for any button in the same container as the account switcher
            accountSwitcher.closest('[class*="header"], [class*="nav"], [class*="toolbar"]')?.querySelector('button')
        ].filter(Boolean);

        // Try to find the name first before clicking - INSTANT check
        let nameElement = findNameInDropdown();
        if (nameElement && nameElement.textContent.trim()) {
            accountSwitcher.textContent = nameElement.textContent.trim();
            return;
        }

        // Also check if name is already visible without dropdown interaction
        const immediateNameCheck = [
            document.querySelector('.name'),
            document.querySelector('[class*="user"] [class*="name"]'),
            document.querySelector('[class*="profile"] [class*="name"]'),
            document.querySelector('[class*="account"] [class*="name"]')
        ].find(el => el?.textContent.trim());

        if (immediateNameCheck) {
            accountSwitcher.textContent = immediateNameCheck.textContent.trim();
            return;
        }

        // If no name found, try clicking triggers to reveal it - INSTANT
        for (const trigger of triggers) {
            if (trigger && trigger !== accountSwitcher) {
                const overlaySnapshot = maskOverlayContainer();
                trigger.click();

                const attemptNameExtraction = (attempt = 0) => {
                    const nameElement = findNameInDropdown();
                    if (nameElement && nameElement.textContent.trim()) {
                        accountSwitcher.textContent = nameElement.textContent.trim();
                        closeAccountDropdown(trigger);
                        restoreOverlayContainer(overlaySnapshot);
                        return;
                    }
                    if (attempt >= 2) {
                        closeAccountDropdown(trigger);
                        restoreOverlayContainer(overlaySnapshot);
                        return;
                    }
                    requestAnimationFrame(() => attemptNameExtraction(attempt + 1));
                };

                requestAnimationFrame(() => attemptNameExtraction(0));
                break;
            }
        }
    };

    const findNameInDropdown = () => {
        // INSTANT search - look for name in various possible locations within dropdowns
        const possibleLocations = [
            document.querySelector(SELECTORS.userName),
            document.querySelector('.name'),
            document.querySelector('[class*="name"]'),
            document.querySelector('[class*="user-name"]'),
            document.querySelector('[class*="display-name"]'),
            document.querySelector('.dropdown .name'),
            document.querySelector('[role="menu"] .name'),
            document.querySelector('[role="listbox"] .name'),
            document.querySelector('[class*="account"] .name'),
            document.querySelector('[class*="profile"] .name'),
            document.querySelector('[class*="user"] .name'),
            // More specific selectors for common UI patterns
            document.querySelector('[data-testid*="name"]'),
            document.querySelector('[aria-label*="name"]'),
            document.querySelector('.mat-mdc-menu-item .name'),
            document.querySelector('.mdc-menu-surface .name')
        ].filter(Boolean);

        for (const element of possibleLocations) {
            if (element.textContent.trim()) {
                return element;
            }
        }
        return null;
    };

    const closeAccountDropdown = (trigger) => {
        // INSTANT close - try various methods with ZERO delays
        const closeMethods = [
            () => trigger.click(), // Click the same trigger to close
            () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
            () => document.dispatchEvent(new MouseEvent('click', { bubbles: true })),
            () => {
                const closeButtons = document.querySelectorAll('button[aria-label*="Close"], button[class*="close"]');
                for (const btn of closeButtons) {
                    if (btn && btn !== trigger) {
                        btn.click();
                        break;
                    }
                }
            }
        ];

        // Try each method INSTANTLY
        for (const method of closeMethods) {
            try {
                method();
                break;
            } catch (e) {
                // Continue to next method if one fails
            }
        }
    };

    class SmartThemeEngine {
        constructor() {
            this.styleEl = null;
            this.currentThemeId = null;
            this.config = null;
        }

        async init() {
            await this.loadConfig();
            await this.loadTheme();
        }

        async loadConfig() {
            try {
                const response = await fetch(chrome.runtime.getURL('themes/theme-config.json'));
                this.config = await response.json();
            } catch (e) {
                console.log('Config load failed');
                this.config = this.getDefaultConfig();
            }
        }

        getDefaultConfig() {
            return {
                version: "3.0.0",
                themes: {},
                css: {
                    baseVariables: "",
                    websiteOverrides: "",
                    selectors: {}
                }
            };
        }

        async loadTheme() {
            try {
                const data = await chrome.storage.sync.get('settings');
                const settings = data.settings || {};
                const themeId = settings.currentTheme || 'monochrome';

                const theme = this.config.themes[themeId] || this.config.themes.monochrome;
                await this.applyTheme(theme);
                this.currentThemeId = themeId;
            } catch (e) {
                console.log('Theme load error');
            }
        }

        async applyTheme(theme) {
            const css = await this.generateSmartCSS(theme);
            if (!this.styleEl) {
                this.styleEl = document.createElement('style');
                this.styleEl.id = 'better-aistudio-theme';
                document.head.appendChild(this.styleEl);
            }
            this.styleEl.textContent = css;
        }

        async generateSmartCSS(theme) {
            const { primary, background, surface, text } = theme.base;
            const radius = theme.radius || '8px';
            const borderWidth = theme.borderWidth || '1px';

            // Load CSS from theme-config.json
            const response = await fetch(chrome.runtime.getURL('themes/theme-config.json'));
            const config = await response.json();
            const cssConfig = config.css;

            // Replace placeholders in base variables
            let baseVariables = cssConfig.baseVariables
                .replace('${primary}', primary)
                .replace('${background}', background)
                .replace('${surface}', surface)
                .replace('${text}', text)
                .replace('${radius}', radius)
                .replace('${borderWidth}', borderWidth);

            // Combine all CSS selectors including the new accountSwitcher
            const allSelectors = Object.values(cssConfig.selectors).join('\n\n');
            const accountSwitcherCSS = cssConfig.selectors.accountSwitcher || '.account-switcher-text { color: var(--bas-text) !important; font-weight: 500 !important; transition: none !important; animation: none !important; opacity: 1 !important; transform: none !important; pointer-events: auto !important; }';

            return `${baseVariables}\n\n${cssConfig.websiteOverrides}\n\n${allSelectors}\n\n${accountSwitcherCSS}`;
        }
    }

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

         if (window.location.href.includes('/prompts/')) {
            observeModel();
            observeModal();
            observeUrl();
           setTimeout(() => { if ($.preset) raf(() => apply($.preset)); }, 200);
        }

        // INSTANT execution - start immediately with zero delays
        observeAccountSwitcher();

        // INSTANT multiple checks to catch the element as soon as it appears
        replaceAccountEmailWithName();
        // Use requestAnimationFrame for next tick - still instant but allows DOM to settle
        requestAnimationFrame(replaceAccountEmailWithName);
        requestAnimationFrame(() => requestAnimationFrame(replaceAccountEmailWithName));

        const themeEngine = new SmartThemeEngine();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => themeEngine.init());
        } else {
            themeEngine.init();
        }

        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'THEME_CHANGED') {
                themeEngine.loadTheme();
                // Re-run account switcher observer to apply new theme styles
                observeAccountSwitcher();
            }
        });
    };

    window.addEventListener('beforeunload', () => {
        $.rafs.forEach(cancelAnimationFrame);
        $.rafs.clear();
        $.obs.forEach(o => o.disconnect());
        $.obs.clear();
        $.cache.clear();
    }, { once: true, passive: true });

    init();
})()
