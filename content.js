(() => {     if (window.geminiWorkerRunning) return;
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
        turn: 'ms-turn',
        modalDialog: 'mat-mdc-dialog-container',
        modalRow: 'ms-model-carousel-row',
        modalContentBtn: 'ms-model-carousel-row .content-button',
        accountSwitcher: '.account-switcher-text',
        userName: '.name',
        accountDropdown: '[class*="account"], [class*="profile"], [class*="user"]',
        dropdownTrigger: 'button[aria-expanded], [role="button"]:has(.account-switcher-text), button[class*="account"], button[aria-label*="Account"], button[aria-label*="Profile"]'
    };

    const ACCOUNT_NAME_SELECTOR = '#account-switcher .name, [id*="account-switcher"] .name, .account-switcher .name';

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
            accountNameInFlight: false
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
  <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z" fill="currentColor"></path>
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
  color: var(--bas-bg, #ffffff) !important;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.bas-run-button:hover:not(:disabled) {
  background: var(--bas-primary-hover, #155ac9) !important;
  box-shadow: 0 6px 18px rgba(17, 17, 17, 0.25) !important;
}
.bas-run-button:active:not(:disabled) {
  background: var(--bas-primary-active, #0f47a1) !important;
  transform: translateY(1px);
}
.bas-run-button:disabled {
  background: var(--bas-border, rgba(255, 255, 255, 0.2)) !important;
  color: var(--bas-text-disabled, rgba(255, 255, 255, 0.45)) !important;
  cursor: not-allowed;
  box-shadow: none !important;
}
.bas-run-button--active {
  background: var(--bas-primary-active, #0f47a1) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--bas-primary) 40%, transparent) !important;
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
        const background = getComputedStyle(button).backgroundColor;
        const rgb = parseRgbString(background);
        const color = chooseIconColor(rgb);
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
            button.style.setProperty('background-color', 'var(--bas-primary-active, #0f47a1)', 'important');
            button.style.setProperty(
                'box-shadow',
                '0 0 0 3px color-mix(in srgb, var(--bas-primary) 40%, transparent)',
                'important'
            );
        } else {
            button.style.setProperty('background-color', 'var(--bas-primary, #1a73e8)', 'important');
            button.style.removeProperty('box-shadow');
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
                          () => trigger.click(),
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
        if (!labelText.includes('@')) return;

        if ($.accountNameInFlight) return;

        const trigger =
            label.closest('button') ||
            label.closest('[role="button"]') ||
            document.querySelector(SELECTORS.dropdownTrigger);

        if (!trigger) return;

        $.accountNameInFlight = true;
        let finished = false;
        let nameObserver = null;
        let removalObserver = null;

        const existingOverlayRoot = document.querySelector('#account-switcher');
        const overlayAlreadyOpen = Boolean(existingOverlayRoot);
        const overlaySnapshot = overlayAlreadyOpen ? null : maskOverlayContainer();

        const cleanupObservers = () => {
            nameObserver?.disconnect();
            removalObserver?.disconnect();
            nameObserver = null;
            removalObserver = null;
        };

        const finalize = (overlayPane) => {
            if (finished) return;
            finished = true;
            cleanupObservers();
            const pane =
                overlayPane ||
                document.querySelector('#account-switcher')?.closest('.cdk-overlay-pane') ||
                document.querySelector(ACCOUNT_NAME_SELECTOR)?.closest('.cdk-overlay-pane') ||
                null;

            const onClosed = () => {
                restoreOverlayContainer(overlaySnapshot);
                $.accountNameInFlight = false;
            };

            if (!overlayAlreadyOpen) {
                closeAccountOverlay(trigger, pane, onClosed, true);
            } else {
                onClosed();
            }
        };

        const applyName = (nameEl) => {
            if (finished) return;
            if (nameEl) {
                const name = nameEl.textContent?.trim();
                if (name) {
                    label.textContent = name;
                }
            }
            const pane =
                nameEl?.closest?.('.cdk-overlay-pane') ||
                document.querySelector('#account-switcher')?.closest('.cdk-overlay-pane') ||
                null;
            finalize(pane);
        };

        const observeOverlay = (overlayRoot) => {
            if (finished) return;
            if (!overlayRoot) {
                finalize(null);
                return;
            }

            const pane = overlayRoot.closest('.cdk-overlay-pane');
            const findName = () => {
                if (finished) return;
                const candidate =
                    overlayRoot.querySelector('.name') ||
                    overlayRoot.querySelector('[class*="name"]') ||
                    document.querySelector(ACCOUNT_NAME_SELECTOR);
                if (candidate && candidate.textContent?.trim()) {
                    applyName(candidate);
                }
            };

            findName();
            if (finished) return;

            nameObserver = new MutationObserver(findName);
            nameObserver.observe(overlayRoot, {
                childList: true,
                subtree: true,
                characterData: true
            });

            if (pane) {
                removalObserver = new MutationObserver(() => {
                    if (!pane.isConnected) {
                        finalize(pane);
                    }
                });
                const target = pane.parentElement ?? document.body;
                removalObserver.observe(target, { childList: true, subtree: true });
            } else {
                removalObserver = new MutationObserver(() => {
                    if (!overlayRoot.isConnected) {
                        finalize(null);
                    }
                });
                removalObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        if (!overlayAlreadyOpen) {
            try {
                trigger.click();
            } catch (error) {
                restoreOverlayContainer(overlaySnapshot);
                $.accountNameInFlight = false;
                return;
            }
        }

        if (existingOverlayRoot) {
            observeOverlay(existingOverlayRoot);
            return;
        }

        const immediateOverlay = document.querySelector('#account-switcher');
        if (immediateOverlay) {
            observeOverlay(immediateOverlay);
            return;
        }

        wait(
            '#account-switcher',
            (overlayRoot) => observeOverlay(overlayRoot),
            4000,
            () => finalize(null)
        );
    };

    const observeAccountSwitcher = () => {
        const accountObs = new MutationObserver(() => {
            raf(ensureAccountDisplayName);
        });

        accountObs.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'data-testid', 'aria-label'],
            characterData: true
        });
        $.obs.add(accountObs);

        ensureAccountDisplayName();
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
                borderWidth: "1px"
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
            refreshRunButtonContrast();
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
                borderWidth: (overrides && overrides.borderWidth) || theme.borderWidth || this.fallbackTheme.borderWidth
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

    const init = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
            const preset = r.presets?.[r.activePresetIndex] ?? null;
            $.preset = preset;
            if (preset) {
                queueApply();
            }
        });

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.activePresetIndex || changes.presets) {
                chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
                    const preset = r.presets?.[r.activePresetIndex] ?? null;
                    $.preset = preset;
                    if (preset) {
                        queueApply();
                    }
                });
            }
        });

        observeModel();
        observeModal();
        observeUrl();
        observeRunButton();
        observeLogos();
        setTimeout(() => { if ($.preset) raf(() => apply($.preset)); }, 200);

        // INSTANT execution - start immediately with zero delays
        observeAccountSwitcher();
        ensureAccountDisplayName();
        requestAnimationFrame(ensureAccountDisplayName);
        requestAnimationFrame(() => requestAnimationFrame(ensureAccountDisplayName));

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
                // Refresh run button contrast with new theme colors
                setTimeout(refreshRunButtonContrast, 100);
                // Re-run logo replacement to apply new theme colors
                replaceGoogleLogos();
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
