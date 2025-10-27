(async () => {
    if (window.geminiWorkerRunning) return;

    // Check if extension is disabled
    const { extensionDisabled = false } = await chrome.storage.sync.get('extensionDisabled');
    if (extensionDisabled) {
        console.log('Better AI Studio: Extension is disabled');
        return;
    }

    window.geminiWorkerRunning = true;

    const SELECTORS = {
        modelTitle: 'ms-model-selector-v3 .title',
        tempSlider: 'div[data-test-id="temperatureSliderContainer"] mat-slider input[type="range"]',
        topPSlider: 'div[data-test-id="topPSliderContainer"] input[type="range"]',
        codeToggle: 'mat-slide-toggle.code-execution-toggle button',
        searchToggle: 'mat-slide-toggle.search-as-a-tool-toggle button',
        urlToggle: 'div[data-test-id="browseAsAToolTooltip"] button[role="switch"]',
        sysBtn: 'button[data-test-system-instructions-card]',
        sysClose: 'button[aria-label="Close panel"]',
        sysText: 'textarea[aria-label="System instructions"]',
        prompt: 'textarea[aria-label*="Type something"]',
        panel: '.ms-sliding-right-panel-dialog',
        chat: '.chat-view-container',
        turn: '.chat-turn-container',
        modalDialog: 'mat-mdc-dialog-container',
        modalRow: 'ms-model-carousel-row',
        modalContentBtn: 'ms-model-carousel-row .content-button',
        accountSwitcher: '.account-switcher-text',
        userName: '.name',
        accountDropdown: '[class*="account"], [class*="profile"], [class*="user"]',
        dropdownTrigger: 'button[aria-expanded], [role="button"]:has(.account-switcher-text), button[class*="account"], button[aria-label*="Account"], button[aria-label*="Profile"], .account-switcher-button'
    };

    const forceReinitializeAccountSwitcher = () => {
        // Clean up existing listeners
        document.querySelectorAll('[data-basAccountListener]').forEach(trigger => {
            if (trigger.basAccountClickHandler) {
                trigger.removeEventListener('click', trigger.basAccountClickHandler);
                delete trigger.basAccountClickHandler;
            }
            trigger.removeAttribute('data-basAccountListener');
        });

        // Reset state
        $.accountNameInFlight = false;
        $.accountNameFetched = false;

        // Reinitialize
        observeAccountSwitcher();
        ensureAccountDisplayName();
        setTimeout(() => {
            if (!$.accountNameFetched) {
                raf(() => autoFetchAccountName());
            }
        }, 100);
    };

    const SLIDER_QUERIES = {
        temperature: [
            'div[data-test-id="temperatureSliderContainer"] input[type="range"]',
            'input[type="range"][aria-label*="temperature" i]',
            'input[type="range"][aria-labelledby*="temperature" i]'
        ],
        topP: [
            'div[data-test-id="topPSliderContainer"] input[type="range"]',
            'input[type="range"][aria-label*="top p" i]',
            'input[type="range"][aria-labelledby*="top-p" i]',
            'input[type="range"][aria-labelledby*="topp" i]'
        ]
    };

    if (!window.$BAS) {
        window.$BAS = {
            cache: new Map(),
            rafs: new Set(),
            obs: new Set(),
            applying: false,
            preset: null,
            accountNameInFlight: false,
            userClickingAccount: false,
            accountNameFetched: false,
            elementSettings: {
            }
        };
    }

    const $ = window.$BAS;

    const LEGACY_ICON_LINK_ID = 'bas-material-symbols-font';
    const LEGACY_ICON_STYLE_ID = 'bas-material-symbols-style';
    const RUN_BUTTON_STYLE_ID = 'bas-run-button-style';
    const RUN_BUTTON_UPGRADED_ATTR = 'data-bas-run-upgraded';
    const runButtonObservers = new WeakMap();
    const RUN_BUTTON_ICON_ATTR = 'data-bas-run-icon';
    const RUN_BUTTON_ICON_MARKUP = {
        send: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
  <path d="M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z" fill="currentColor"></path>
</svg>`,
        stop: `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
  <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z" fill="currentColor"></path>
</svg>`
    };

    const ensureRunButtonStyles = () => {
        const head = document.head || document.documentElement;
        if (!head) return;

        const legacyLink = document.getElementById(LEGACY_ICON_LINK_ID);
        legacyLink?.remove();
        const legacyStyle = document.getElementById(LEGACY_ICON_STYLE_ID);
        legacyStyle?.remove();

        if (!head.querySelector(`#${RUN_BUTTON_STYLE_ID}`)) {
            const styleEl = document.createElement('style');
            styleEl.id = RUN_BUTTON_STYLE_ID;
            styleEl.textContent = `
.bas-run-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border-radius: 999px;
  border: none !important;
  background: var(--bas-primary, #1a73e8) !important;
  color: var(--bas-bg) !important;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.bas-run-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--bas-primary) 25%, transparent) !important;
  box-shadow: 0 6px 18px rgba(17, 17, 17, 0.25) !important;
}
.bas-run-button:active:not(:disabled) {
  background: var(--bas-primary) !important;
  transform: translateY(1px);
}
.bas-run-button:disabled {
  background: var(--bas-border, rgba(255, 255, 255, 0.2)) !important;
  color: var(--bas-text-disabled, rgba(255, 255, 255, 0.45)) !important;
  cursor: not-allowed;
  box-shadow: none !important;
}
.bas-run-button--active {
  background: var(--bas-primary) !important;
}
.bas-run-button:focus-visible {
  outline: 2px solid var(--bas-primary, #1a73e8);
  outline-offset: 3px;
}
.bas-run-button__content {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.bas-run-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.bas-run-button__icon svg {
  width: 1.35rem;
  height: 1.35rem;
  fill: currentColor !important;
  color: inherit !important;
}
.bas-run-button__spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bas-run-button__native-icon {
  display: none !important;
}
ms-prompt-feedback .blocked-content-container {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 12px !important;
  max-width: 100% !important;
}
ms-prompt-feedback .blocked-text,
span.blocked-text {
  display: block !important;
  text-align: center !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--color-v3-text-var, rgba(255, 255, 255, 0.65)) !important;
  padding: 8px 16px !important;
  background: var(--color-v3-surface-container, rgba(255, 255, 255, 0.05)) !important;
  border-radius: 8px !important;
  border: 1px solid var(--color-v3-outline-var, rgba(255, 255, 255, 0.1)) !important;
  margin: 0 !important;
}
ms-prompt-feedback img.loaded-image {
  cursor: pointer !important;
  max-height: min(30vh, 358px) !important;
  max-width: 100% !important;
  object-fit: cover !important;
  display: block !important;
  border-radius: 8px !important;
}
`;
            head.appendChild(styleEl);
        }
    };

    const parseRgbString = (value) => {
        if (!value) return null;
        const matches = value.match(/[\d.]+/g);
        if (!matches || matches.length < 3) return null;
        const [r, g, b] = matches.slice(0, 3).map((num) => {
            const parsed = Number.parseFloat(num);
            if (Number.isNaN(parsed)) return 0;
            return Math.max(0, Math.min(parsed, 255));
        });
        return { r, g, b };
    };

    const computeLuminance = ({ r, g, b }) => {
        const toLinear = (channel) => {
            const normalized = channel / 255;
            if (normalized <= 0.03928) {
                return normalized / 12.92;
            }
            return Math.pow((normalized + 0.055) / 1.055, 2.4);
        };
        const rLinear = toLinear(r);
        const gLinear = toLinear(g);
        const bLinear = toLinear(b);
        return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
    };

    const contrastRatio = (lumA, lumB) => {
        const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
        return (lighter + 0.05) / (darker + 0.05);
    };

    const chooseIconColor = (backgroundRgb) => {
        if (!backgroundRgb) {
            return '#ffffff';
        }

        const backgroundLum = computeLuminance(backgroundRgb);

        // More reliable contrast calculation - prefer white for dark backgrounds, black for light backgrounds
        // Blue colors like #1a73e8 should use white text for better contrast
        const whiteRatio = contrastRatio(backgroundLum, 1);
        const blackRatio = contrastRatio(backgroundLum, 0);

        // Use a threshold to ensure we pick high contrast colors
        // If background is dark (luminance < 0.5), use white
        // If background is light (luminance >= 0.5), use black
        // Also fallback to white if contrast ratios are too low (less than 3:1)
        const chosenColor = backgroundLum < 0.5 ? '#ffffff' : '#000000';

        // Double-check contrast ratio and prefer white for very low contrast
        const chosenRatio = chosenColor === '#ffffff' ? whiteRatio : blackRatio;
        if (chosenRatio < 3) {
            return '#ffffff'; // Always prefer white if contrast is poor
        }

        return chosenColor;
    };

    const setRunButtonIconColor = (button) => {
        const color = 'var(--bas-bg)';
        button.style.setProperty('color', color, 'important');
        button.dataset.basRunIconColor = color;

        // Also ensure the SVG inside inherits the correct color
        const svg = button.querySelector('.bas-run-button__icon svg');
        if (svg) {
            svg.style.setProperty('fill', color, 'important');
        }
    };

    const scheduleRunButtonIconColorUpdate = (button, attempts = 3) => {
        const update = () => {
            setRunButtonIconColor(button);
            if (attempts > 1) {
                scheduleRunButtonIconColorUpdate(button, attempts - 1);
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(update);
        } else {
            setTimeout(update, 16);
        }
    };

    const setRunButtonIconMarkup = (iconEl, type) => {
        if (!iconEl) return;
        const iconType = RUN_BUTTON_ICON_MARKUP[type] ? type : 'send';
        if (iconEl.getAttribute(RUN_BUTTON_ICON_ATTR) === iconType) return;
        iconEl.setAttribute(RUN_BUTTON_ICON_ATTR, iconType);
        iconEl.innerHTML = RUN_BUTTON_ICON_MARKUP[iconType];
    };

    const hideNativeRunButtonIndicators = (button) => {
        if (!button) return;
        button
            .querySelectorAll('svg:not(.bas-run-button__native-icon)')
            .forEach((svg) => {
                if (
                    svg.querySelector('.stoppable-stop') ||
                    svg.querySelector('.stoppable-spinner')
                ) {
                    svg.classList.add('bas-run-button__native-icon');
                    svg.setAttribute('aria-hidden', 'true');
                    svg.setAttribute('focusable', 'false');
                    svg.style.setProperty('display', 'none', 'important');
                }
            });
    };

    const syncRunButtonIcon = (button, isActive) => {
        const iconEl = button?.querySelector?.('.bas-run-button__icon');
        if (!iconEl) return;
        setRunButtonIconMarkup(iconEl, isActive ? 'stop' : 'send');
    };

    const refreshRunButtonContrast = () => {
        document
            .querySelectorAll('.bas-run-button')
            .forEach((btn) => {
                // Force immediate update for better reliability
                setRunButtonIconColor(btn);
                scheduleRunButtonIconColorUpdate(btn, 1);
            });
    };

    const applyRunButtonBaseInlineStyles = (button) => {
        button.style.setProperty('background-color', 'var(--bas-primary, #1a73e8)', 'important');
        button.style.setProperty('border-radius', '999px', 'important');
        button.style.setProperty('border', 'none', 'important');
        button.style.setProperty('width', '2.75rem', 'important');
        button.style.setProperty('height', '2.75rem', 'important');
        button.style.setProperty('padding', '0', 'important');
        button.style.setProperty('display', 'inline-flex', 'important');
        button.style.setProperty('align-items', 'center', 'important');
        button.style.setProperty('justify-content', 'center', 'important');
        button.style.setProperty('min-width', '0', 'important');
        scheduleRunButtonIconColorUpdate(button);
    };

    const setRunButtonActiveState = (button, isActive) => {
        if (isActive) {
            button.style.setProperty('background-color', 'var(--bas-primary)', 'important');
        } else {
            button.style.setProperty('background-color', 'var(--bas-primary, #1a73e8)', 'important');
        }
        scheduleRunButtonIconColorUpdate(button);
        button.classList.toggle('bas-run-button--active', isActive);
    };

    const upgradeRunButtonContent = (content) => {
        if (!content || content.getAttribute(RUN_BUTTON_UPGRADED_ATTR) === '1') return;
        const button = content.closest('button, [role="button"]');
        if (!button) return;

        ensureRunButtonStyles();

        if (button.tagName === 'BUTTON' && !button.getAttribute('type')) {
            button.type = 'button';
        }
        button.classList.add('bas-run-button');
        button.setAttribute('data-bas-run-button', '1');
        applyRunButtonBaseInlineStyles(button);

        // Ensure proper contrast immediately after upgrade
        setRunButtonIconColor(button);

        const originalLabel =
            button.getAttribute('aria-label') || button.textContent || 'Run';
        const baseLabel = originalLabel.replace(/\s*\(.*\)\s*/u, '').trim() || 'Run';
        const shortcutLabel = 'Ctrl + Enter';

        content.classList.add('bas-run-button__content');
        content.setAttribute(RUN_BUTTON_UPGRADED_ATTR, '1');

        const preserved = Array.from(content.childNodes).filter(
            (node) =>
                node.nodeType === Node.ELEMENT_NODE &&
                (node.matches?.('[role="progressbar"]') || node.matches?.('mat-progress-spinner'))
        );

        while (content.firstChild) {
            content.removeChild(content.firstChild);
        }

        const icon = document.createElement('span');
        icon.className = 'bas-run-button__icon';
        icon.setAttribute('aria-hidden', 'true');
        setRunButtonIconMarkup(icon, 'send');

        content.append(icon);
        preserved.forEach((node) => {
            if (node instanceof HTMLElement) {
                node.classList.add('bas-run-button__spinner');
            }
            content.append(node);
        });

        const descriptiveLabel = `${baseLabel} (${shortcutLabel})`;
        button.setAttribute('aria-label', descriptiveLabel);
        button.setAttribute('title', descriptiveLabel);

        const updateActiveState = () => {
            const nativeIndicator = button.querySelector(
                'svg:not(.bas-run-button__native-icon) .stoppable-stop, svg:not(.bas-run-button__native-icon) .stoppable-spinner'
            );
            const hasNewNativeIndicator = Boolean(nativeIndicator);
            const hasAnyNativeIndicator = Boolean(
                button.querySelector('.stoppable-stop, .stoppable-spinner')
            );
            const hasSpinner = Boolean(
                button.querySelector('[role="progressbar"], mat-progress-spinner')
            );
            const isActive = hasSpinner || hasAnyNativeIndicator;
            setRunButtonActiveState(button, isActive);
            syncRunButtonIcon(button, isActive);
            if (hasNewNativeIndicator) {
                hideNativeRunButtonIndicators(button);
            }
        };

        updateActiveState();

        const existingObserver = runButtonObservers.get(button);
        if (existingObserver) {
            existingObserver.disconnect();
            $.obs.delete(existingObserver);
        }

        const runObserver = new MutationObserver(updateActiveState);
        runObserver.observe(button, { childList: true, subtree: true });
        $.obs.add(runObserver);
        runButtonObservers.set(button, runObserver);
    };

    const observeRunButton = () => {
        const processRoot = (root = document.body) => {
            if (!root?.querySelectorAll) return;
            root.querySelectorAll('.run-button-content').forEach((node) => {
                upgradeRunButtonContent(node);
            });
        };

        if (!document.body) {
            requestAnimationFrame(observeRunButton);
            return;
        }

        processRoot(document.body);

        const observer = new MutationObserver((mutations) => {
            for (const { addedNodes } of mutations) {
                addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    if (node.matches('.run-button-content')) {
                        upgradeRunButtonContent(node);
                    } else {
                        processRoot(node);
                    }
                });
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(observer);
    };

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

    const wait = (sel, cb, ms = 5000, onTimeout) => {
        const el = document.querySelector(sel);
        if (el) return cb(el);
        let timeoutId;
        const obs = new MutationObserver(() => {
            const e = document.querySelector(sel);
            if (e) {
                obs.disconnect();
                $.obs.delete(obs);
                clearTimeout(timeoutId);
                cb(e);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        $.obs.add(obs);
        timeoutId = setTimeout(() => {
            obs.disconnect();
            $.obs.delete(obs);
            onTimeout?.();
        }, ms);
    };

    const getSliderContextText = (input) => {
        if (!input) return '';
        const pieces = [];
        const ariaLabel = input.getAttribute('aria-label');
        if (ariaLabel) pieces.push(ariaLabel);
        const labelledBy = input.getAttribute('aria-labelledby');
        if (labelledBy) {
            labelledBy.split(/\s+/).forEach((id) => {
                const labelEl = document.getElementById(id);
                if (labelEl?.textContent) {
                    pieces.push(labelEl.textContent);
                }
            });
        }
        const container = input.closest('.settings-item, .settings-item-column, .settings-item-row, [data-test-id], label, mat-form-field, .mat-mdc-form-field, .slider-container');
        if (container?.textContent) {
            pieces.push(container.textContent);
        }
        return pieces.join(' ').toLowerCase();
    };

    const sliderTypeFromElement = (input) => {
        if (!input) return null;
        const container = input.closest('[data-test-id]');
        const testId = container?.dataset?.testId?.toLowerCase();
        if (testId) {
            if (testId.includes('temperature')) return 'temperature';
            if (testId.includes('toppslider') || testId.includes('toppslidercontainer') || testId.includes('top-p')) {
                return 'topP';
            }
        }
        const context = getSliderContextText(input);
        if (context.includes('temperature')) return 'temperature';
        if (context.includes('top p') || context.includes('top-p')) return 'topP';
        return null;
    };

    const findSliderByType = (type) => {
        const selectors = SLIDER_QUERIES[type] ?? [];
        for (const selector of selectors) {
            const input = document.querySelector(selector);
            if (input && sliderTypeFromElement(input) === type) {
                return input;
            }
        }
        const candidates = Array.from(
            document.querySelectorAll(
                'div[data-test-id] input[type="range"], input[type="range"][aria-label], input[type="range"][aria-labelledby]'
            )
        );
        return candidates.find((input) => sliderTypeFromElement(input) === type) ?? null;
    };

    const sectionController = (() => {
        const getToggle = (header) =>
            header?.matches('button, [role="button"]')
                ? header
                : header?.querySelector('button, [role="button"]');

        const getContent = (header) => {
            const group = header?.closest('.settings-group');
            return (
                group?.querySelector('.settings-group-content') ??
                header?.nextElementSibling ??
                group?.querySelector('.settings-group-content') ??
                null
            );
        };

        const isExpanded = (header) => {
            const toggle = getToggle(header);
            if (!toggle) return false;
            const attr = toggle.getAttribute('aria-expanded');
            if (attr === 'true') return true;
            if (attr === 'false') return false;
            const group = header?.closest('.settings-group');
            if (group?.classList.contains('expanded')) return true;
            const content = getContent(header);
            if (!content) return false;
            if (content.hidden) return false;
            const style = window.getComputedStyle(content);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.height !== '0px';
        };

        const expand = (header) => {
            const toggle = getToggle(header);
            if (!toggle || isExpanded(header)) return false;
            let toggled = false;
            const attempt = (tries = 0) => {
                if (isExpanded(header) || tries > 4) return;
                toggle.click();
                toggled = true;
                requestAnimationFrame(() => {
                    if (!isExpanded(header)) {
                        attempt(tries + 1);
                    }
                });
            };
            attempt(0);
            return toggled;
        };

        const collapse = (header) => {
            const toggle = getToggle(header);
            if (!toggle || !isExpanded(header)) return false;
            let toggled = false;
            const attempt = (tries = 0) => {
                if (!isExpanded(header) || tries > 4) return;
                toggle.click();
                toggled = true;
                requestAnimationFrame(() => {
                    if (isExpanded(header)) {
                        attempt(tries + 1);
                    }
                });
            };
            attempt(0);
            return toggled;
        };

        return { isExpanded, expand, collapse };
    })();

    const prepareSectionsForPreset = (preset) => {
        const headers = Array.from(document.querySelectorAll('.settings-group-header'));
        const matchHeader = (label) =>
            headers.find((h) =>
                h.querySelector('.group-title')?.textContent?.toLowerCase().includes(label)
            );
        const toolsHeader = matchHeader('tools');
        const advancedHeader = matchHeader('advanced');

        const sectionsOpened = new Set();

        const ensureExpanded = (header) => {
            if (!header || sectionController.isExpanded(header)) return;
            sectionController.expand(header);
            sectionsOpened.add(header);
        };

        const expectsTopP = typeof preset?.topP === 'number' && !Number.isNaN(preset.topP);
        const topPContainerExists = Boolean(
            document.querySelector('div[data-test-id="topPSliderContainer"]')
        );
        if (
            advancedHeader &&
            !sectionController.isExpanded(advancedHeader) &&
            (expectsTopP || topPContainerExists)
        ) {
            ensureExpanded(advancedHeader);
        }

        const toolsConfig = preset?.tools ?? {};
        const wantsToolChanges =
            Object.prototype.hasOwnProperty.call(toolsConfig, 'codeExecution') ||
            Object.prototype.hasOwnProperty.call(toolsConfig, 'search') ||
            Object.prototype.hasOwnProperty.call(toolsConfig, 'urlContext');
        if (toolsHeader && wantsToolChanges && !sectionController.isExpanded(toolsHeader)) {
            ensureExpanded(toolsHeader);
        }

        return Array.from(sectionsOpened);
    };

    const resetToDefaults = () => {
        // Reset website to default values (from ui-config.json)
        const defaults = {
            temperature: 1,
            topP: 0.95,
            systemInstructions: '',
            tools: {
                codeExecution: false,
                search: true,
                urlContext: false
            }
        };
        
        // Apply the default preset
        if (!$.applying) {
            raf(() => apply(defaults));
        }
    };

    const apply = (p) => {
        if (!p || $.applying) return;
        $.applying = true;
        $.cache.clear();

        const inPresetContext = window.location.href.includes('/prompts/');
        let needsRetry = false;
        let finished = false;
        let pendingTasks = 1;
        let retryDelay = 120;

        const requestRetry = (delay = 150) => {
            if (!inPresetContext) return;
            needsRetry = true;
            retryDelay = Math.max(retryDelay, delay);
        };

        const complete = () => {
            if (finished) return;
            finished = true;
            $.applying = false;
            if (needsRetry) {
                setTimeout(() => {
                    if (!$.applying) {
                        queueApply();
                    }
                }, retryDelay);
            }
        };

        const taskDone = () => {
            pendingTasks -= 1;
            if (pendingTasks <= 0) {
                complete();
            }
        };

        const addTask = () => {
            pendingTasks += 1;
        };

        addTask();
        setTimeout(() => {
            const sectionsToRestore = prepareSectionsForPreset(p);
            raf(() => {
                const temperatureSlider = findSliderByType('temperature');
                const topPSlider = findSliderByType('topP');
                const code = getEl(SELECTORS.codeToggle);
                const search = getEl(SELECTORS.searchToggle);
                const url = getEl(SELECTORS.urlToggle);

                if (!temperatureSlider) {
                    requestRetry(220);
                    wait(
                        'div[data-test-id="temperatureSliderContainer"] input[type="range"]',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                if (!topPSlider) {
                    const topPContainerSelector = 'div[data-test-id="topPSliderContainer"]';
                    const topPContainer = document.querySelector(topPContainerSelector);
                    if (topPContainer) {
                        wait(
                            `${topPContainerSelector} input[type="range"]`,
                            () => {
                                if (!$.applying) {
                                    queueApply();
                                }
                            },
                            4000
                        );
                    } else {
                        wait(
                            topPContainerSelector,
                            () => {
                                if (!$.applying) {
                                    queueApply();
                                }
                            },
                            4000
                        );
                    }
                }

                const expectCodeToggle = Boolean(
                    document.querySelector('mat-slide-toggle.code-execution-toggle')
                );
                if (!code && expectCodeToggle) {
                    requestRetry(200);
                    wait(
                        'mat-slide-toggle.code-execution-toggle button',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                } else if (!code) {
                    wait(
                        'mat-slide-toggle.code-execution-toggle',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                const expectSearchToggle = Boolean(
                    document.querySelector('mat-slide-toggle.search-as-a-tool-toggle')
                );
                if (!search && expectSearchToggle) {
                    requestRetry(200);
                    wait(
                        'mat-slide-toggle.search-as-a-tool-toggle button',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                } else if (!search) {
                    wait(
                        'mat-slide-toggle.search-as-a-tool-toggle',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                const expectUrlToggle = Boolean(document.querySelector('div[data-test-id="browseAsAToolTooltip"]'));
                if (!url && expectUrlToggle) {
                    requestRetry(200);
                    wait(
                        SELECTORS.urlToggle,
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                } else if (!url) {
                    wait(
                        'div[data-test-id="browseAsAToolTooltip"]',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                if (temperatureSlider && Math.abs(parseFloat(temperatureSlider.value) - p.temperature) > 0.001) {
                    temperatureSlider.value = p.temperature;
                    temperatureSlider.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (topPSlider && Math.abs(parseFloat(topPSlider.value) - p.topP) > 0.001) {
                    topPSlider.value = p.topP;
                    topPSlider.dispatchEvent(new Event('input', { bubbles: true }));
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

                if (sectionsToRestore.length > 0) {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            sectionsToRestore.forEach((header) => {
                                if (sectionController.isExpanded(header)) {
                                    sectionController.collapse(header);
                                }
                            });
                        });
                    });
                }

                taskDone();
            });
        }, 80);

        const systemInstructions = (p.systemInstructions ?? '').trim();
        const sysBtn = getEl(SELECTORS.sysBtn);

        if (sysBtn && systemInstructions) {
            addTask();
            sysBtn.click();
            let sysTaskCompleted = false;
            const finishSystemTask = () => {
                if (sysTaskCompleted) return;
                sysTaskCompleted = true;
                taskDone();
            };
            wait(
                `${SELECTORS.panel} ${SELECTORS.sysText}`,
                (area) => {
                    if (sysTaskCompleted) return;
                    if (area.value !== systemInstructions) {
                        area.value = systemInstructions;
                        area.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    const close = area.closest(SELECTORS.panel)?.querySelector(SELECTORS.sysClose);
                    if (close) {
                        setTimeout(() => {
                            if (sysTaskCompleted) return;
                            close.click();
                            const observer = new MutationObserver(() => {
                                if (!document.querySelector(SELECTORS.panel)) {
                                    observer.disconnect();
                                    finishSystemTask();
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                            setTimeout(() => {
                                observer.disconnect();
                                finishSystemTask();
                            }, 800);
                        }, 40);
                    } else {
                        finishSystemTask();
                    }
                },
                2500,
                () => {
                    requestRetry(220);
                    finishSystemTask();
                }
            );
        } else {
            if (systemInstructions) {
                requestRetry(220);
            }
            if (!sysBtn && systemInstructions) {
                wait(
                    SELECTORS.sysBtn,
                    () => {
                        if (!$.applying) {
                            queueApply();
                        }
                    },
                    4000
                );
            }
        }

        taskDone();
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
                
                // Force close any leftover account overlay
                const overlayRoot = document.querySelector('#account-switcher');
                if (overlayRoot) {
                    const pane = overlayRoot.closest('.cdk-overlay-pane');
                    if (pane) {
                        removeOverlayNodes(pane);
                    }
                }
                
                setTimeout(() => {
                    observeModel();
                    observeModal();
                    forceReinitializeAccountSwitcher();
                      queueApply();
                }, 200);
            }
        });

        const titleElement = document.querySelector('title') || document.head;
        urlObs.observe(titleElement, { childList: true, subtree: true });
        $.obs.add(urlObs);

        const setupNavigation = () => {
            const handleNavigation = () => {
                // Force close any leftover account overlay
                const overlayRoot = document.querySelector('#account-switcher');
                if (overlayRoot) {
                    const pane = overlayRoot.closest('.cdk-overlay-pane');
                    if (pane) {
                        removeOverlayNodes(pane);
                    }
                }
                
                setTimeout(() => {
                    observeModel();
                    observeModal();
                    forceReinitializeAccountSwitcher();
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
            // Force close any leftover account overlay
            const overlayRoot = document.querySelector('#account-switcher');
            if (overlayRoot) {
                const pane = overlayRoot.closest('.cdk-overlay-pane');
                if (pane) {
                    removeOverlayNodes(pane);
                }
            }
            
            setTimeout(() => {
                observeModel();
                observeModal();
                forceReinitializeAccountSwitcher();
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

    const recordOverlayState = (container) => ({
        container,
        style: container.getAttribute('style') ?? ''
    });

    const maskOverlayContainer = () => {
        const container = document.querySelector('.cdk-overlay-container');
        if (!container) return null;
        const snapshot = recordOverlayState(container);
        // Hide visually but DON'T block pointer events - this was blocking user clicks!
        container.style.opacity = '0';
        container.style.transform = 'translate3d(-9999px, -9999px, 0)';
        container.style.transition = 'none';
        // DO NOT set pointerEvents to 'none' - that blocks user clicks on the account button!
        return snapshot;
    };

    const restoreOverlayContainer = (snapshot) => {
        if (!snapshot) return;
        const { container, style } = snapshot;
        requestAnimationFrame(() => {
            if (!container) return;
            if (style) {
                container.setAttribute('style', style);
            } else {
                container.removeAttribute('style');
            }
            // Extra safety: ensure pointer events are never blocked
            container.style.pointerEvents = '';
        });
    };

    const removeOverlayNodes = (pane) => {
        if (!pane || !pane.isConnected) return;
        const boundingBox = pane.parentElement;
        const container = boundingBox?.parentElement;
        if (boundingBox?.classList?.contains('cdk-overlay-connected-position-bounding-box')) {
            boundingBox.remove();
        } else {
            pane.remove();
        }
        if (container?.classList?.contains('cdk-overlay-container')) {
            const orphanBackdrops = Array.from(container.querySelectorAll('.cdk-overlay-backdrop')).filter(
                (backdrop) => !backdrop.previousElementSibling
            );
            orphanBackdrops.forEach((backdrop) => backdrop.remove());
        }
    };

    const closeAccountOverlay = (trigger, overlayPane, done, allowForceClose = false) => {
        const pane = overlayPane?.closest?.('.cdk-overlay-pane') ?? overlayPane;
        const container = document.querySelector('.cdk-overlay-container');
        let completed = false;
        let observer;

        const finish = () => {
            if (completed) return;
            completed = true;
            observer?.disconnect();
            // Ensure overlay container is clickable after closing
            if (container && container.style.pointerEvents === 'none') {
                container.style.pointerEvents = '';
            }
            done?.();
        };

        if (!pane || !pane.isConnected) {
            finish();
            return;
        }

        observer = container
            ? new MutationObserver(() => {
                  if (!pane.isConnected) {
                      finish();
                  }
              })
            : null;

        observer?.observe(container, { childList: true });

        let attempt = 0;
        const maxAttempts = 6;
        const step = () => {
            if (!pane.isConnected) {
                finish();
                return;
            }

            const actions =
                attempt === 0
                    ? [
                          () => {
                              // Don't click trigger if user is actively clicking
                              if (!$.userClickingAccount) {
                                  trigger?.click();
                              }
                          },
                          () =>
                              document.dispatchEvent(
                                  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
                              ),
                          () => {
                              const closeBtn = pane.querySelector(
                                  'button[aria-label*="Close"], button[class*="close"]'
                              );
                              closeBtn?.click();
                          }
                      ]
                    : [
                          () =>
                              document.dispatchEvent(
                                  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
                              )
                      ];

            actions.forEach((action) => {
                try {
                    action();
                } catch (e) {
                    // ignore and continue
                }
            });

            attempt += 1;
            requestAnimationFrame(() => {
                if (!pane.isConnected) {
                    finish();
                } else if (attempt < maxAttempts) {
                    step();
                } else {
                    if (allowForceClose) {
                        removeOverlayNodes(pane);
                    }
                    finish();
                }
            });
        };

        step();
    };

    const ensureAccountDisplayName = () => {
        const label = document.querySelector(SELECTORS.accountSwitcher);
        if (!label) return;

        const labelText = label.textContent?.trim() ?? '';

        // If it's already showing a name (not email), we're done
        if (!labelText.includes('@')) return;

        // Check if overlay is already open (user opened it)
        const existingOverlayRoot = document.querySelector('#account-switcher');
        if (existingOverlayRoot) {
            // Overlay is open, just read the name passively
            const nameEl = existingOverlayRoot.querySelector('.name') ||
                           existingOverlayRoot.querySelector('[class*="name"]') ||
                           document.querySelector(ACCOUNT_NAME_SELECTOR);
            if (nameEl && nameEl.textContent?.trim()) {
                const name = nameEl.textContent.trim();
                if (name) {
                    // Find the current label (in case DOM changed)
                    const currentLabel = document.querySelector(SELECTORS.accountSwitcher);
                    if (currentLabel) {
                        currentLabel.textContent = name;
                        $.accountNameFetched = true;
                    }
                }
            }
        }
    };

    const setupAccountButtonListeners = () => {
        const label = document.querySelector(SELECTORS.accountSwitcher);
        if (!label) return;

        const trigger =
            label.closest('button') ||
            label.closest('[role="button"]') ||
            document.querySelector(SELECTORS.dropdownTrigger);

        if (!trigger) return;

        // Remove existing listener if present to avoid duplicates
        if (trigger.dataset.basAccountListener) {
            trigger.removeEventListener('click', trigger.basAccountClickHandler);
        }

        // Mark as having listener
        trigger.dataset.basAccountListener = '1';

        // When user clicks, wait for overlay to open and capture the name
        const handleClick = () => {
            // Wait for overlay to appear
            setTimeout(() => {
                const overlayRoot = document.querySelector('#account-switcher');
                if (overlayRoot) {
                    const nameEl = overlayRoot.querySelector('.name') ||
                                   overlayRoot.querySelector('[class*="name"]') ||
                                   document.querySelector(ACCOUNT_NAME_SELECTOR);
                    if (nameEl && nameEl.textContent?.trim()) {
                        const name = nameEl.textContent.trim();
                        if (name && label) {
                            label.textContent = name;
                            $.accountNameFetched = true;
                        }
                    }
                }
            }, 300);
        };

        // Store handler reference for cleanup
        trigger.basAccountClickHandler = handleClick;

        // Listen for click to capture name when overlay opens
        trigger.addEventListener('click', handleClick);
    };

    const ensureOverlayContainerClickable = () => {
        // Safety mechanism: ensure overlay container never blocks clicks
        const container = document.querySelector('.cdk-overlay-container');
        if (container) {
            // Remove any pointer-events blocking
            if (container.style.pointerEvents === 'none') {
                container.style.pointerEvents = '';
            }
        }
    };

    const observeAccountSwitcher = () => {
        const accountObs = new MutationObserver(() => {
            // Always keep button listeners updated
            setupAccountButtonListeners();

            // If overlay opens naturally (user clicked), try to grab the name
            raf(ensureAccountDisplayName);
        });

        accountObs.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(accountObs);

        // Initial setup
        setupAccountButtonListeners();
        ensureAccountDisplayName();

        // Force re-setup on specific account switcher changes
        const specificObserver = new MutationObserver((mutations) => {
            let shouldReattach = false;
            mutations.forEach((mutation) => {
                // Check if account switcher elements were added, removed, or modified
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (node.matches(SELECTORS.accountSwitcher) ||
                                node.querySelector && node.querySelector(SELECTORS.accountSwitcher))) {
                                shouldReattach = true;
                            }
                        }
                    });
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (node.matches(SELECTORS.accountSwitcher) ||
                                node.querySelector && node.querySelector(SELECTORS.accountSwitcher))) {
                                shouldReattach = true;
                            }
                        }
                    });
                }
                // Check for attribute changes on account switcher elements
                if (mutation.type === 'attributes' && mutation.target) {
                    if (mutation.target.matches && (mutation.target.matches(SELECTORS.accountSwitcher) ||
                        mutation.target.closest && mutation.target.closest(SELECTORS.dropdownTrigger))) {
                        shouldReattach = true;
                    }
                }
            });

            if (shouldReattach) {
                // Small delay to ensure DOM is stable
                setTimeout(() => {
                    setupAccountButtonListeners();
                    ensureAccountDisplayName();
                }, 50);
            }
        });

        specificObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'role', 'aria-expanded', 'data-basAccountListener']
        });
        $.obs.add(specificObserver);

        // Automatically fetch name IMMEDIATELY - no delay
        raf(() => autoFetchAccountName());
    };

    const autoFetchAccountName = () => {
        const label = document.querySelector(SELECTORS.accountSwitcher);
        if (!label) {
            // Retry if not found yet
            wait(SELECTORS.accountSwitcher, () => {
                raf(() => autoFetchAccountName());
            }, 2500);
            return;
        }

        const labelText = label.textContent?.trim() ?? '';
        if (!labelText.includes('@')) return; // Already has name

        const trigger =
            label.closest('button') ||
            label.closest('[role="button"]') ||
            document.querySelector(SELECTORS.dropdownTrigger);

        if (!trigger) return;
        if ($.accountNameInFlight) return;

        $.accountNameInFlight = true;

        // Hide overlay container BEFORE clicking - instant and seamless
        const container = document.querySelector('.cdk-overlay-container');
        let originalStyle = '';
        if (container) {
            originalStyle = container.getAttribute('style') || '';
            container.style.opacity = '0';
            container.style.visibility = 'hidden';
            container.style.position = 'fixed';
            container.style.zIndex = '-9999';
        }

        // Click to open
        trigger.click();

        // Use wait() for the overlay to appear, just like preset system
        wait('#account-switcher', (overlayRoot) => {
            const nameEl = overlayRoot.querySelector('.name') ||
                           overlayRoot.querySelector('[class*="name"]') ||
                           document.querySelector(ACCOUNT_NAME_SELECTOR);

            if (nameEl && nameEl.textContent?.trim()) {
                const name = nameEl.textContent.trim();
                if (name) {
                    // Find the current label (in case DOM changed)
                    const currentLabel = document.querySelector(SELECTORS.accountSwitcher);
                    if (currentLabel) {
                        currentLabel.textContent = name;
                        $.accountNameFetched = true;
                    }
                }
            }

            // Close immediately - try multiple methods to ensure it closes
            raf(() => {
                // Method 1: Click trigger to toggle
                trigger.click();

                // Method 2: Press Escape key
                setTimeout(() => {
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Escape',
                        code: 'Escape',
                        keyCode: 27,
                        bubbles: true,
                        cancelable: true
                    }));
                }, 50);

                // Method 3: Force remove if still present
                setTimeout(() => {
                    const stillOpen = document.querySelector('#account-switcher');
                    if (stillOpen) {
                        const pane = stillOpen.closest('.cdk-overlay-pane');
                        if (pane) {
                            removeOverlayNodes(pane);
                        }
                    }
                }, 150);

                // Restore container after all close attempts
                setTimeout(() => {
                    if (container) {
                        if (originalStyle) {
                            container.setAttribute('style', originalStyle);
                        } else {
                            container.removeAttribute('style');
                        }
                    }
                    $.accountNameInFlight = false;
                }, 200);
            });
        }, 2500, () => {
            // Timeout: force close overlay and restore
            const stillOpen = document.querySelector('#account-switcher');
            if (stillOpen) {
                const pane = stillOpen.closest('.cdk-overlay-pane');
                if (pane) {
                    removeOverlayNodes(pane);
                }
            }

            if (container) {
                if (originalStyle) {
                    container.setAttribute('style', originalStyle);
                } else {
                    container.removeAttribute('style');
                }
            }
            $.accountNameInFlight = false;
        });
    };

    class SmartThemeEngine {
        constructor() {
            this.styleEl = null;
            this.currentThemeId = null;
            this.currentOverrides = null;
            this.config = null;
            this.fallbackTheme = {
                base: {
                    primary: "#A1A1AA",
                    background: "#18181B",
                    surface: "#09090B",
                    text: "#FAFAFA"
                },
                radius: "6px",
                borderWidth: "1px",
                outlineOpacity: "1"
            };
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
                themes: { monochrome: this.fallbackTheme },
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
                const overrides = settings.themeOverrides || null;

                const themes = this.config.themes || {};
                const fallbackTheme = themes.monochrome || Object.values(themes)[0] || this.fallbackTheme;
                const theme = themes[themeId] || fallbackTheme;

                await this.applyTheme(theme, overrides);
                this.currentThemeId = themeId;
                this.currentOverrides = overrides;
            } catch (e) {
                console.log('Theme load error');
            }
        }

        async applyTheme(theme, overrides) {
            const css = await this.generateSmartCSS(theme, overrides);
            if (!this.styleEl) {
                this.styleEl = document.createElement('style');
                this.styleEl.id = 'better-aistudio-theme';
                document.head.appendChild(this.styleEl);
            }
            this.styleEl.textContent = css;
            this.adjustPaddingForWebsite(theme, overrides);
            refreshRunButtonContrast();
        }

        adjustPaddingForWebsite(theme, overrides) {
            try {
                const root = document.documentElement;
                if (!root) return;

                // Parse radius and border values
                const parsePx = (value, fallback = 0) => {
                    if (typeof value === 'number') return value;
                    if (typeof value !== 'string') return fallback;
                    const numeric = parseFloat(value.replace(/px$/i, ''));
                    return isFinite(numeric) ? numeric : fallback;
                };

                const radiusStr = (overrides && overrides.radius) || theme.radius || this.fallbackTheme.radius;
                const borderStr = (overrides && overrides.borderWidth) || theme.borderWidth || this.fallbackTheme.borderWidth;
                
                const radius = parsePx(radiusStr, 6);
                const border = parsePx(borderStr, 1);
                
                // Calculate optimal padding based on border radius and width
                // Formula: base padding + (radius * factor) + (border * factor)
                const basePadding = 8; // Base padding in px
                const radiusFactor = 0.15; // 15% of radius
                const borderFactor = 1.5; // 150% of border width
                
                const calculatedPadding = basePadding + (radius * radiusFactor) + (border * borderFactor);
                const finalPadding = Math.max(basePadding, Math.round(calculatedPadding * 10) / 10);
                
                // Apply calculated padding
                root.style.setProperty('--bas-padding', `${finalPadding}px`);
                root.style.setProperty('--bas-padding-sm', `${finalPadding * 0.5}px`);
                root.style.setProperty('--bas-padding-lg', `${finalPadding * 1.5}px`);
            } catch (error) {
                console.error('Error adjusting website padding:', error);
            }
        }

        async generateSmartCSS(theme, overrides) {
            const base = theme?.base || {};
            const fallbackBase = this.fallbackTheme.base;
            const tokens = {
                primary: base.primary || fallbackBase.primary,
                background: base.background || fallbackBase.background,
                surface: base.surface || fallbackBase.surface,
                text: base.text || fallbackBase.text,
                radius: (overrides && overrides.radius) || theme.radius || this.fallbackTheme.radius,
                borderWidth: (overrides && overrides.borderWidth) || theme.borderWidth || this.fallbackTheme.borderWidth,
                outlineOpacity: (overrides && overrides.outlineOpacity) || theme.outlineOpacity || "1"
            };

            const cssConfig = this.config.css || {};
            const applyTokens = (template) => {
                if (typeof template !== "string") return "";
                return template.replace(/\$\{(\w+)\}/g, (match, token) => {
                    return Object.prototype.hasOwnProperty.call(tokens, token) ? tokens[token] : match;
                });
            };

            const sections = [
                applyTokens(cssConfig.baseVariables),
                applyTokens(cssConfig.websiteOverrides),
                ...Object.values(cssConfig.selectors || {}).map(applyTokens)
            ].filter(Boolean);

            if (!(cssConfig.selectors && cssConfig.selectors.accountSwitcher)) {
                sections.push('.account-switcher-text { color: var(--bas-text) !important; font-weight: 500 !important; transition: none !important; animation: none !important; opacity: 1 !important; transform: none !important; pointer-events: auto !important; }');
            }

            // Hide number input spin buttons globally
            sections.push(`
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none !important;
  appearance: none !important;
  margin: 0 !important;
}
input[type="number"] {
  appearance: textfield !important;
  -moz-appearance: textfield !important;
}
            `.trim());

            // Override hardcoded icon gradients with theme colors
            sections.push(`
.app-card .icon-container .material-symbols-outlined {
  background: var(--bas-primary) !important;
  background-clip: text !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}
            `.trim());

            // Override svg-icon and model-icon styles with Angular-specific attributes
            sections.push(`
.svg-icon[_ngcontent-ng-c2105409530] {
  width: 20px !important;
  aspect-ratio: 1 / 1 !important;
}
.model-icon[_ngcontent-ng-c2105409530] {
  color: initial !important;
  background-color: initial !important;
  border-radius: initial !important;
  padding: initial !important;
  font-size: initial !important;
  border: none !important;
  background: none !important;
}
            `.trim());

            return sections.join('\n\n');
        }
    }

    const replaceGoogleLogos = () => {
        const svgLogos = document.querySelectorAll('.lockup-logo');
        svgLogos.forEach((svg) => {
            if (svg.dataset.basReplaced) return; // Already replaced

            const parent = svg.parentElement;
            if (!parent || !svg.isConnected) return;

            try {
                // Create replacement text element with split styling
                const textElement = document.createElement('span');
                textElement.className = 'bas-logo-text';
                textElement.setAttribute('aria-label', 'Better AI Studio logo');
                textElement.dataset.basReplaced = '1';

                // Split "Better" and "AI Studio" with different styling
                const betterText = document.createElement('span');
                betterText.textContent = 'Better';
                betterText.className = 'bas-logo-text__better';

                const aiStudioText = document.createElement('span');
                aiStudioText.textContent = ' AI Studio';
                aiStudioText.className = 'bas-logo-text__ai-studio';

                textElement.appendChild(betterText);
                textElement.appendChild(aiStudioText);

                // Ensure the parent can accept the replacement
                if (parent && parent.replaceChild) {
                    parent.replaceChild(textElement, svg);
                }
            } catch (error) {
                console.warn('Failed to replace Google logo:', error);
            }
        });
    };

    const replaceSparkleWithRestart = () => {
        // Find all SVG elements that match the sparkle icon pattern
        const svgs = document.querySelectorAll('svg[width="20"][height="20"]');
        
        svgs.forEach((svg) => {
            // Skip if already replaced
            if (svg.dataset.basRestartReplaced) return;
            
            // Check if this is the sparkle icon by looking for the characteristic paths
            const path = svg.querySelector('path[d*="M10 17.5833"]');
            if (!path) return;
            
            // Mark as replaced
            svg.dataset.basRestartReplaced = '1';
            svg.classList.add('bas-restart-icon');
            
            // Replace with restart icon using theme colors
            svg.innerHTML = `
                <path d="M16.25 10C16.25 13.4518 13.4518 16.25 10 16.25C6.54822 16.25 3.75 13.4518 3.75 10C3.75 6.54822 6.54822 3.75 10 3.75C11.9632 3.75 13.7036 4.66839 14.7943 6.09375M14.7943 6.09375V3.125M14.7943 6.09375H11.875" stroke="color-mix(in srgb, var(--bas-text) 90%, transparent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            `;
        });
    };

    const replaceAddCircleIcons = () => {
        // Find all material-symbols-outlined spans with add_circle text
        // Be more specific to avoid conflicts with other functions
        const addCircleSpans = document.querySelectorAll('.material-symbols-outlined:not(.model-icon)');

        console.log('[BAS] Looking for add_circle icons, found:', addCircleSpans.length);

        addCircleSpans.forEach((span) => {
            // Skip if already replaced
            if (span.dataset.basAddReplaced) return;

            // Check if this is the add_circle icon
            if (span.textContent.trim() !== 'add_circle') return;

            console.log('[BAS] Replacing add_circle icon:', span);

            // Mark as replaced
            span.dataset.basAddReplaced = '1';

            // Create SVG element with proper classes
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.setAttribute('height', '24');
            svg.setAttribute('viewBox', '0 96 960 960');
            svg.setAttribute('width', '24');

            // Copy classes from original span to maintain styling
            svg.className = span.className + ' bas-svg-icon';

            // Set SVG attributes to inherit color properly
            svg.setAttribute('fill', 'currentColor');

            // Copy inline styles from original span
            if (span.style.cssText) {
                svg.style.cssText = span.style.cssText;
            }

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M480 856q-17 0-28.5-11.5T440 816v-240H200q-17 0-28.5-11.5T160 536q0-17 11.5-28.5T200 496h240V256q0-17 11.5-28.5T480 216q17 0 28.5 11.5T520 256v240h240q17 0 28.5 11.5T800 536q0 17-11.5 28.5T760 576H520v240q0 17-11.5 28.5T480 856Z');

            svg.appendChild(path);

            // Replace the span with the SVG
            span.parentNode.replaceChild(svg, span);
        });
    };

    const replaceSparkWithExperiment = () => {
        // Find all material-symbols-outlined spans with spark text
        // Target specifically model-icon spans for spark icons
        const sparkSpans = document.querySelectorAll('.material-symbols-outlined.model-icon');

        console.log('[BAS] Looking for spark icons, found:', sparkSpans.length);

        sparkSpans.forEach((span) => {
            // Skip if already replaced
            if (span.dataset.basSparkReplaced) return;

            // Check if this is the spark icon
            if (span.textContent.trim() !== 'spark') return;

            console.log('[BAS] Replacing spark icon:', span);

            // Mark as replaced
            span.dataset.basSparkReplaced = '1';

            // Create SVG element with proper classes
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.setAttribute('height', '20');
            svg.setAttribute('viewBox', '0 -960 960 960');
            svg.setAttribute('width', '20');

            // Copy classes from original span to maintain styling
            svg.className = span.className + ' bas-svg-icon';

            // Set SVG attributes to inherit color properly
            svg.setAttribute('fill', 'currentColor');

            // Copy inline styles from original span
            if (span.style.cssText) {
                svg.style.cssText = span.style.cssText;
            }

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M200-120q-51 0-72.5-45.5T138-250l222-270v-240h-40q-17 0-28.5-11.5T280-800q0-17 11.5-28.5T320-840h320q17 0 28.5 11.5T680-800q0 17-11.5 28.5T640-760h-40v240l222 270q32 39 10.5 84.5T760-120H200Zm80-120h400L544-400H416L280-240Zm-80 40h560L520-492v-268h-80v268L200-200Zm280-280Z');

            svg.appendChild(path);

            // Replace the span with the SVG
            span.parentNode.replaceChild(svg, span);
        });
    };

    const observeSparkleIcons = () => {
        // Replace existing icons immediately
        // Note: replaceSparkleWithRestart function doesn't exist, skipping

        // Set up observer for new icons
        const iconObserver = new MutationObserver(() => {
            // Note: replaceSparkleWithRestart function doesn't exist, skipping
        });

        iconObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(iconObserver);
    };

    const observeAddCircleIcons = () => {
        // Replace existing icons immediately
        replaceAddCircleIcons();

        // Run multiple times to ensure all icons are replaced
        setTimeout(replaceAddCircleIcons, 100);
        setTimeout(replaceAddCircleIcons, 500);
        setTimeout(replaceAddCircleIcons, 1000);

        // Set up observer for new icons
        const iconObserver = new MutationObserver(() => {
            replaceAddCircleIcons();
        });

        iconObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(iconObserver);
    };

    const observeSparkIcons = () => {
        // Replace existing icons immediately
        replaceSparkWithExperiment();

        // Run multiple times to ensure all icons are replaced
        setTimeout(replaceSparkWithExperiment, 100);
        setTimeout(replaceSparkWithExperiment, 500);
        setTimeout(replaceSparkWithExperiment, 1000);

        // Set up observer for new icons
        const iconObserver = new MutationObserver(() => {
            replaceSparkWithExperiment();
        });

        iconObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(iconObserver);
    };

    const setupRecentlyViewedDropdown = () => {
        const processRecentlyViewed = () => {
            const containers = document.querySelectorAll('.recently-viewed-applets-container');
            
            containers.forEach((container) => {
                // Skip if already processed
                if (container.dataset.basDropdownAdded) return;
                container.dataset.basDropdownAdded = '1';
                
                const header = container.querySelector('.pinned-applets-header');
                const list = container.querySelector('.applets-list');
                
                if (!header || !list) return;
                
                // Style the header to be clickable and flex
                header.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                    user-select: none;
                    transition: opacity 0.2s ease;
                    padding-right: 8px;
                `;
                
                // Create chevron icon
                const chevron = document.createElement('span');
                chevron.className = 'bas-recently-viewed-chevron';
                chevron.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="color-mix(in srgb, var(--bas-text-secondary, rgba(255, 255, 255, 0.6)) 90%, transparent)" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;
                chevron.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--bas-text-secondary, rgba(255, 255, 255, 0.6));
                    transition: transform 0.2s ease, color 0.2s ease;
                    flex-shrink: 0;
                    margin-left: 12px;
                `;
                
                // Append chevron to header
                header.appendChild(chevron);
                
                // Load saved state
                const savedState = localStorage.getItem('bas-recently-viewed-collapsed');
                const isCollapsed = savedState === 'true';
                
                if (isCollapsed) {
                    list.style.display = 'none';
                    chevron.style.transform = 'rotate(-90deg)';
                }
                
                // Toggle functionality - entire header is clickable
                header.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const isCurrentlyCollapsed = list.style.display === 'none';
                    
                    if (isCurrentlyCollapsed) {
                        list.style.display = '';
                        chevron.style.transform = 'rotate(0deg)';
                        localStorage.setItem('bas-recently-viewed-collapsed', 'false');
                    } else {
                        list.style.display = 'none';
                        chevron.style.transform = 'rotate(-90deg)';
                        localStorage.setItem('bas-recently-viewed-collapsed', 'true');
                    }
                });
                
                // Hover effect on entire header
                header.addEventListener('mouseenter', () => {
                    header.style.opacity = '0.8';
                    chevron.style.color = 'color-mix(in srgb, var(--bas-text, rgba(255, 255, 255, 1)) 90%, transparent)';
                });
                header.addEventListener('mouseleave', () => {
                    header.style.opacity = '1';
                    chevron.style.color = 'color-mix(in srgb, var(--bas-text-secondary, rgba(255, 255, 255, 0.6)) 90%, transparent)';
                });
            });
        };
        
        // Process immediately
        processRecentlyViewed();
        
        // Set up observer for dynamically added recently viewed sections
        const observer = new MutationObserver(() => {
            processRecentlyViewed();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(observer);
    };

    const observeLogos = () => {
        // Replace existing logos immediately
        replaceGoogleLogos();

        // Set up observer for new logos
        const logoObserver = new MutationObserver((mutations) => {
            let shouldReplace = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the new node or its children contain lockup logos
                        if (node.classList?.contains('lockup-logo') ||
                            node.querySelector?.('.lockup-logo') ||
                            node.querySelector?.('svg[aria-label*="Google AI Studio"]')) {
                            shouldReplace = true;
                        }
                    }
                });
            });
            if (shouldReplace) {
                // Use requestAnimationFrame to ensure DOM is ready
                requestAnimationFrame(() => {
                    // Small delay to ensure DOM is fully ready
                    setTimeout(replaceGoogleLogos, 10);
                });
            }
        });

        logoObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(logoObserver);

        // Also listen for any changes to elements that might contain logos
        const attributeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' &&
                    mutation.attributeName === 'class' &&
                    mutation.target.classList?.contains('lockup-logo')) {
                    requestAnimationFrame(() => setTimeout(replaceGoogleLogos, 10));
                }
            });
        });

        attributeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true
        });
        $.obs.add(attributeObserver);
    };

    // Immediately restore any hidden messages from old virtualization
    const restoreHiddenMessages = () => {
        const hiddenMessages = document.querySelectorAll('.chat-turn-container[data-bas-hidden]');
        if (hiddenMessages.length > 0) {
            console.log('[BAS] Restoring', hiddenMessages.length, 'hidden messages');
            hiddenMessages.forEach(msg => {
                msg.style.removeProperty('display');
                msg.removeAttribute('data-bas-hidden');
            });
        }
    };

    // Load element settings from storage - per theme
    const loadElementSettings = async () => {
        try {
            const [elementData, settingsData] = await Promise.all([
                chrome.storage.sync.get('elementSettings'),
                chrome.storage.sync.get('settings')
            ]);
            
            const elementSettings = elementData.elementSettings || {};
            const settings = settingsData.settings || {};
            
            // Get current theme
            const currentThemeId = settings.currentTheme || 'monochrome';
            
            // Load theme config to get defaults
            let themeDefaults = {
                borderRadius: 30,
                showBorder: false,
                backgroundColor: '#18181B',
                textColor: '#FAFAFA',
                borderColor: '#A1A1AA',
                borderWidth: 1,
                borderOpacity: 1,
                showGlow: false,
                glowColor: '#4A9FF5',
                glowIntensity: 20,
                glowOpacity: 1,
                maxWidth: 1000,
                bottomPosition: 0
            };
            
            try {
                const response = await fetch(chrome.runtime.getURL('themes/theme-config.json'));
                const themeConfig = await response.json();
                const currentTheme = themeConfig?.themes?.[currentThemeId];
                if (currentTheme?.base) {
                    themeDefaults = {
                        borderRadius: 30,
                        showBorder: false,
                        backgroundColor: currentTheme.base.background || '#18181B',
                        textColor: currentTheme.base.text || '#FAFAFA',
                        borderColor: currentTheme.base.primary || '#A1A1AA',
                        borderWidth: 1,
                        borderOpacity: 1,
                        showGlow: false,
                        glowColor: currentTheme.base.primary || '#4A9FF5',
                        glowIntensity: 20,
                        glowOpacity: 1,
                        maxWidth: 1000,
                        bottomPosition: 0
                    };
                }
            } catch (e) {
                // Use fallback defaults
            }
            
            // Get per-theme settings or use theme defaults
            $.elementSettings.textInput = 
                elementSettings.textInputByTheme?.[currentThemeId] || themeDefaults;
            $.elementSettings.currentThemeId = currentThemeId;
        } catch (error) {
            console.error('Failed to load element settings:', error);
        }
    };

    // Apply text input styling
    const applyTextInputStyling = (settings) => {
        if (!settings) {
            settings = $.elementSettings.textInput || {
                borderRadius: 30,
                showBorder: false,
                backgroundColor: '#18181B',
                textColor: '#FAFAFA',
                borderColor: '#A1A1AA',
                borderWidth: 1,
                borderOpacity: 1,
                showGlow: false,
                glowColor: '#4A9FF5',
                glowIntensity: 20,
                glowOpacity: 1,
                maxWidth: 1000,
                bottomPosition: 0
            };
        }

        // Remove existing style tag if present
        const existingStyle = document.getElementById('bas-text-input-styles');
        if (existingStyle) {
            existingStyle.remove();
        }

        // Create new style tag with CSS rules
        const styleTag = document.createElement('style');
        styleTag.id = 'bas-text-input-styles';
        
        // Convert hex to rgba for border with opacity
        const hexToRgba = (hex, opacity) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        };
        
        const borderWidth = settings.borderWidth !== undefined ? settings.borderWidth : 1;
        const borderOpacity = settings.borderOpacity !== undefined ? settings.borderOpacity : 1;
        const borderRule = settings.showBorder 
            ? `border: ${borderWidth}px solid ${hexToRgba(settings.borderColor, borderOpacity)} !important;` 
            : `border: none !important;`;
        
        const glowIntensity = settings.glowIntensity !== undefined ? settings.glowIntensity : 20;
        const glowOpacity = settings.glowOpacity !== undefined ? settings.glowOpacity : 1;
        const glowRule = settings.showGlow
            ? `box-shadow: 0 0 ${glowIntensity}px ${hexToRgba(settings.glowColor, glowOpacity)} !important;`
            : `box-shadow: none !important;`;
        
        const maxWidth = settings.maxWidth !== undefined ? settings.maxWidth : 1000;
        const bottomPosition = settings.bottomPosition !== undefined ? settings.bottomPosition : 0;
        const borderRadius = settings.borderRadius !== undefined ? settings.borderRadius : 30;
        
        styleTag.textContent = `
            .prompt-input-wrapper,
            .prompt-input-wrapper[class*="_ngcontent"],
            .prompt-input-wrapper[msfiledragdrop] {
                background: ${settings.backgroundColor} !important;
                color: ${settings.textColor} !important;
                border-radius: ${borderRadius}px !important;
                padding: 12px !important;
                padding-left: 12px !important;
                ${borderRule}
                ${glowRule}
                max-width: ${maxWidth}px !important;
                margin-bottom: ${bottomPosition}px !important;
            }

            /* Override for app generator - higher specificity */
            .prompt-input-wrapper.row.column.v3,
            .prompt-input-wrapper.row.column.v3[class*="_ngcontent"],
            .prompt-input-wrapper.row.column.v3[msfiledragdrop] {
                background: ${settings.backgroundColor} !important;
                color: ${settings.textColor} !important;
                border: ${borderWidth}px solid ${hexToRgba(settings.borderColor, borderOpacity)} !important;
                border-radius: 12px !important;
                padding: 16px !important;
                box-shadow: 0 2px 8px ${hexToRgba(settings.glowColor, 0.08)} !important;
                max-width: none !important;
                margin-bottom: 0 !important;
                margin-top: 0 !important;
                margin-left: 0 !important;
                margin-right: 0 !important;
            }
            
            .prompt-input-wrapper textarea,
            .prompt-input-wrapper input[type="text"],
            .prompt-input-wrapper .text-input,
            .prompt-input-wrapper [contenteditable],
            .prompt-input-wrapper .mat-mdc-input-element {
                background: transparent !important;
                color: ${settings.textColor} !important;
                caret-color: ${settings.textColor} !important;
            }
            
            .prompt-input-wrapper textarea::placeholder,
            .prompt-input-wrapper input::placeholder,
            .prompt-input-wrapper .text-input::placeholder {
                color: ${settings.textColor} !important;
                opacity: 0.6 !important;
            }
        `;

        document.head.appendChild(styleTag);
    };

    // Apply text input styling (CSS rules apply to all elements automatically)
    const observeTextInputWrappers = () => {
        applyTextInputStyling($.elementSettings.textInput);
    };

    const openImagePreview = (imageSrc, altText) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'cdk-overlay-container';
        overlay.innerHTML = `
            <div class="cdk-overlay-backdrop dialog-backdrop-blur-overlay cdk-overlay-backdrop-showing"></div>
            <div class="cdk-global-overlay-wrapper" dir="ltr" style="justify-content: center; align-items: center;">
                <div class="cdk-overlay-pane mat-mdc-dialog-panel" style="min-width: min(500px, 90vw); position: static;">
                    <mat-dialog-container tabindex="-1" class="mat-mdc-dialog-container mdc-dialog cdk-dialog-container mdc-dialog--open" style="--mat-dialog-transition-duration: 150ms;">
                        <div class="mat-mdc-dialog-inner-container mdc-dialog__container">
                            <div class="mat-mdc-dialog-surface mdc-dialog__surface">
                                <div class="action-confirmation action-confirmation-wide view-media-dialog">
                                    <header class="mat-mdc-dialog-title mdc-dialog__title shared-dialog-header">
                                        <div class="text">${altText || 'Content blocked'}</div>
                                        <div class="actions">
                                            <button class="close-button ms-button-borderless ms-button-icon" aria-label="Close" title="Close">
                                                <span class="material-symbols-outlined notranslate ms-button-icon-symbol" aria-hidden="true">close</span>
                                            </button>
                                        </div>
                                    </header>
                                    <main>
                                        <div tabindex="0" class="image-container">
                                            <img class="main-media-item main-image" src="${imageSrc}" alt="${altText || 'Content blocked'}">
                                        </div>
                                    </main>
                                </div>
                            </div>
                        </div>
                    </mat-dialog-container>
                </div>
            </div>
        `;

        // Add to body
        document.body.appendChild(overlay);

        // Close handlers
        const closeModal = () => {
            overlay.remove();
        };

        overlay.querySelector('.close-button').addEventListener('click', closeModal);
        overlay.querySelector('.cdk-overlay-backdrop').addEventListener('click', closeModal);
        
        // ESC key handler
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
    };

    const processContentBlockedElement = (feedbackElement) => {
        if (!feedbackElement) return;
        
        // Check if this element has blocked content (either original text or already processed)
        const hasBlockedText = feedbackElement.textContent.includes('Content blocked');
        const hasBlockedContainer = feedbackElement.querySelector('.blocked-content-container');
        
        if (!hasBlockedText && !hasBlockedContainer) return;
        
        // Store complete original HTML before any processing
        const originalHTML = hasBlockedContainer ? 
            (feedbackElement.dataset.originalHTML || feedbackElement.innerHTML) :
            feedbackElement.innerHTML;
        
        console.log('[BAS] Processing blocked content element');
        
        Promise.all([
            chrome.storage.sync.get(['contentBlockedFeatureEnabled', 'contentBlockedImageUrl']),
            chrome.storage.local.get(['contentBlockedImageUrl'])
        ]).then(([syncData, localData]) => {
            console.log('[BAS] Storage data:', { syncData, localData });
            const isEnabled = syncData.contentBlockedFeatureEnabled !== false;
            
            // If feature is disabled, restore complete original HTML
            if (!isEnabled) {
                console.log('[BAS] Feature disabled, restoring original HTML');
                if (hasBlockedContainer) {
                    feedbackElement.innerHTML = originalHTML;
                    delete feedbackElement.dataset.originalHTML;
                }
                return;
            }
            
            const imageUrl = localData.contentBlockedImageUrl || syncData.contentBlockedImageUrl || 'https://media1.tenor.com/m/h75s9-F1i0MAAAAC/james-doakes.gif';
            console.log('[BAS] Using image URL:', imageUrl);
            const blockedText = hasBlockedContainer ? feedbackElement.querySelector('.blocked-text')?.textContent || 'Content blocked' : feedbackElement.textContent.trim();

            const container = document.createElement('div');
            container.className = 'blocked-content-container';

            const image = document.createElement('img');
            image.src = imageUrl;
            image.className = 'loaded-image';
            image.alt = 'Content blocked';
            
            // Add click handler for image preview
            image.addEventListener('click', () => {
                openImagePreview(imageUrl, 'Content blocked');
            });

            const textNode = document.createElement('span');
            textNode.textContent = blockedText;
            textNode.className = 'blocked-text';

            container.appendChild(image);
            container.appendChild(textNode);

            // Store complete original HTML to restore later
            feedbackElement.dataset.originalHTML = originalHTML;
            
            feedbackElement.innerHTML = '';
            feedbackElement.appendChild(container);
        });
    };

    const observeContentBlockedMessages = () => {
        const processAll = () => {
            const elements = document.querySelectorAll('ms-prompt-feedback');
            console.log('[BAS] Processing blocked content, found', elements.length, 'elements');
            elements.forEach(processContentBlockedElement);
        };
        
        // Immediate processing
        processAll();
        
        // Keep checking for new elements
        setTimeout(processAll, 50);
        setTimeout(processAll, 100);
        setTimeout(processAll, 200);
        setTimeout(processAll, 500);
        setTimeout(processAll, 1000);
        setTimeout(processAll, 2000);
        setTimeout(processAll, 3000);
        setTimeout(processAll, 5000);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && node.matches('ms-prompt-feedback')) {
                            processContentBlockedElement(node);
                        }
                        const feedbackElements = node.querySelectorAll ? node.querySelectorAll('ms-prompt-feedback') : [];
                        feedbackElements.forEach(processContentBlockedElement);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        $.obs.add(observer);
    };

    const init = async () => {
        console.log('[BAS] Content script initializing...');
        
        // Restore any hidden messages immediately
        restoreHiddenMessages();
        
        // Also check again after a delay in case messages load later
        setTimeout(restoreHiddenMessages, 1000);
        setTimeout(restoreHiddenMessages, 2000);
        chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
            const preset = r.presets?.[r.activePresetIndex] ?? null;
            $.preset = preset;
            if (preset) {
                queueApply();
            } else {
                // No preset active, reset to defaults
                resetToDefaults();
            }
        });

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.activePresetIndex || changes.presets) {
                chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
                    const preset = r.presets?.[r.activePresetIndex] ?? null;
                    const wasReset = $.preset && !preset;
                    $.preset = preset;
                    if (preset) {
                        queueApply();
                    } else if (wasReset) {
                        // Reset to defaults when preset is cleared
                        resetToDefaults();
                    }
                });
            }
        });

        observeModel();
        observeModal();
        observeUrl();
        observeRunButton();
        observeLogos();
        observeSparkleIcons();
        observeAddCircleIcons();
        observeSparkIcons();
        setupRecentlyViewedDropdown();
        observeContentBlockedMessages();
        setTimeout(() => { if ($.preset) raf(() => apply($.preset)); }, 200);

        // INSTANT execution - start immediately with zero delays
        forceReinitializeAccountSwitcher();
        requestAnimationFrame(ensureAccountDisplayName);
        requestAnimationFrame(() => requestAnimationFrame(ensureAccountDisplayName));

        // Run autoFetchAccountName multiple times to ensure it catches quickly
        setTimeout(() => { if (!$.accountNameFetched) raf(() => autoFetchAccountName()); }, 100);
        setTimeout(() => { if (!$.accountNameFetched) raf(() => autoFetchAccountName()); }, 300);
        setTimeout(() => { if (!$.accountNameFetched) raf(() => autoFetchAccountName()); }, 600);

        // Periodic check to ensure account switcher is still working
        setInterval(() => {
            const label = document.querySelector(SELECTORS.accountSwitcher);
            if (label && label.textContent?.trim().includes('@') && !$.accountNameInFlight) {
                // Still showing email instead of name, try to refetch
                raf(() => autoFetchAccountName());
            }
        }, 10000);

        const themeEngine = new SmartThemeEngine();
        const initTheme = async () => {
            await themeEngine.init();
            // After theme is loaded, load element settings and apply text input styling
            await loadElementSettings();
            observeTextInputWrappers();
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => initTheme());
        } else {
            initTheme();
        }

        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'THEME_CHANGED') {
                themeEngine.loadTheme();
                // Re-run account switcher observer to apply new theme styles
                forceReinitializeAccountSwitcher();
                // Refresh run button contrast with new theme colors
                setTimeout(refreshRunButtonContrast, 100);
                // Re-run logo replacement to apply new theme colors
                replaceGoogleLogos();
                // Re-run sparkle icon replacement
                // Note: replaceSparkleWithRestart function doesn't exist, skipping
                // Re-run add_circle icon replacement
                replaceAddCircleIcons();
                // Re-run spark icon replacement
                replaceSparkWithExperiment();
                // Reload element settings for new theme
                loadElementSettings().then(() => {
                    applyTextInputStyling($.elementSettings.textInput);
                });
            } else if (message.type === 'UPDATE_TEXT_INPUT_STYLING') {
                // INSTANT apply - but only if theme matches current page theme
                chrome.storage.sync.get('settings', (data) => {
                    const currentPageTheme = data.settings?.currentTheme || 'monochrome';
                    if (message.themeId === currentPageTheme) {
                        $.elementSettings.textInput = message.settings;
                        applyTextInputStyling(message.settings);
                    }
                });
            } else if (message.type === 'CONTENT_BLOCKED_FEATURE_CHANGED') {
                console.log('[BAS] Feature toggle changed:', message.enabled);
                // Re-process all blocked content when feature is toggled - INSTANT
                document.querySelectorAll('ms-prompt-feedback').forEach(processContentBlockedElement);
            } else if (message.type === 'CONTENT_BLOCKED_IMAGE_CHANGED') {
                console.log('[BAS] Image changed:', message.imageUrl);
                // Re-process all blocked content when image is changed - INSTANT
                document.querySelectorAll('ms-prompt-feedback').forEach(processContentBlockedElement);
            }
        });
    };

    window.addEventListener('beforeunload', () => {
        $.rafs.forEach(cancelAnimationFrame);
        $.rafs.clear();
        $.obs.forEach(o => o.disconnect());
        $.obs.clear();
        $.cache.clear();

        // Clean up account switcher listeners
        document.querySelectorAll('[data-basAccountListener]').forEach(trigger => {
            if (trigger.basAccountClickHandler) {
                trigger.removeEventListener('click', trigger.basAccountClickHandler);
                delete trigger.basAccountClickHandler;
            }
            trigger.removeAttribute('data-basAccountListener');
        });
    }, { once: true, passive: true });

    init();
})();
