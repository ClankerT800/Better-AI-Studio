(() => {
    if (window.geminiWorkerRunning) return;
    window.geminiWorkerRunning = true;

    const selectors = {
        modelTitle: 'ms-model-selector-v3 .title',
        tempSlider: 'div[data-test-id="temperatureSliderContainer"] mat-slider input[type="range"]',
        topPSlider: 'ms-slider[title*="Top P"] input[type="range"]',
        codeExecutionToggle: 'mat-slide-toggle.code-execution-toggle button',
        searchToggle: 'mat-slide-toggle.search-as-a-tool-toggle button',
        urlContextToggle: 'div[data-test-id="browseAsAToolTooltip"] button[role="switch"]',
        systemInstructionsOpenButton: 'button[data-test-system-instructions-card]',
        systemInstructionsCloseButton: 'button[aria-label="Close panel"]',
        systemInstructionsTextarea: 'textarea[aria-label="System instructions"]',
        promptInput: 'textarea[aria-label*="Type something"]',
        slidingPanel: '.ms-sliding-right-panel-dialog',
    };

    let modelChangeObserver = null;
    let isApplyingSettings = false;
    let lastModelName = '';

    const waitForElement = (selector, callback, timeout = 5000) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
            }
        }, 50);
    };

    const waitForElementToDisappear = (selector, callback, timeout = 5000) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            if (!document.querySelector(selector)) {
                clearInterval(interval);
                callback();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
            }
        }, 50);
    };

    const setSlider = (selector, value) => {
        const el = document.querySelector(selector);
        if (el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    const setToggle = (selector, shouldBeChecked) => {
        const el = document.querySelector(selector);
        if (el && (el.getAttribute('aria-checked') === 'true') !== shouldBeChecked) {
            el.click();
        }
    };

    const setSystemInstructions = (instructions, callback) => {
        const openButton = document.querySelector(selectors.systemInstructionsOpenButton);
        if (!openButton) {
            if (callback) callback();
            return;
        }
        openButton.click();

        waitForElement(`${selectors.slidingPanel} ${selectors.systemInstructionsTextarea}`, (textarea) => {
            const panel = textarea.closest(selectors.slidingPanel);
            if (!panel) {
                if (callback) callback();
                return;
            }

            textarea.value = instructions;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));

            const closeButton = panel.querySelector(selectors.systemInstructionsCloseButton);
            if (closeButton) {
                closeButton.click();
            }

            waitForElementToDisappear(selectors.slidingPanel, () => {
                if (callback) callback();
            });
        });
    };

    const applyPreset = (preset) => {
        setSlider(selectors.tempSlider, preset.temperature);
        setSlider(selectors.topPSlider, preset.topP);
        setToggle(selectors.codeExecutionToggle, preset.tools.codeExecution);
        setToggle(selectors.searchToggle, preset.tools.search);
        setToggle(selectors.urlContextToggle, preset.tools.urlContext || false);
        setSystemInstructions(preset.systemInstructions, () => {
            const promptInput = document.querySelector(selectors.promptInput);
            if (promptInput) promptInput.focus();
            isApplyingSettings = false;
        });
    };

    const resetToDefaults = () => {
        setSlider(selectors.tempSlider, 1.0);
        setSlider(selectors.topPSlider, 0.95);
        setToggle(selectors.codeExecutionToggle, false);
        setToggle(selectors.searchToggle, true);
        setToggle(selectors.urlContextToggle, false);
        setSystemInstructions('', () => {
            const promptInput = document.querySelector(selectors.promptInput);
            if (promptInput) promptInput.focus();
            isApplyingSettings = false;
        });
    };

    const evaluateAndApplySettings = () => {
        if (isApplyingSettings) return;

        const modelTitleEl = document.querySelector(selectors.modelTitle);
        if (!modelTitleEl) return;
        
        const modelName = modelTitleEl.textContent.trim().toLowerCase();
        if (modelName === lastModelName) return;

        isApplyingSettings = true;
        lastModelName = modelName;

        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            if (modelName.includes('nano banana')) {
                resetToDefaults();
            } else {
                if (result.presets && result.activePresetIndex !== undefined && result.activePresetIndex >= 0) {
                    const preset = result.presets[result.activePresetIndex];
                    if (preset) {
                        applyPreset(preset);
                    } else {
                        isApplyingSettings = false;
                    }
                } else {
                    isApplyingSettings = false;
                }
            }
        });
    };

    const initOptimization = (container) => {
        const MESSAGE_TURN_SELECTOR = 'ms-turn';
        const VIRTUALIZATION_MAP = new WeakMap();
        const BUFFER_PX = 500;

        const intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const target = entry.target;
                const state = VIRTUALIZATION_MAP.get(target);
                if (!state) return;

                if (entry.isIntersecting) {
                    if (!state.isRealized) {
                        window.requestAnimationFrame(() => {
                            if (state.content) {
                                target.innerHTML = '';
                                target.appendChild(state.content);
                            }
                            state.isRealized = true;
                        });
                    }
                } else {
                    if (state.isRealized) {
                        window.requestAnimationFrame(() => {
                            const height = target.offsetHeight;
                            if (height > 0) {
                                state.height = height;
                                const contentFragment = document.createDocumentFragment();
                                while (target.firstChild) {
                                    contentFragment.appendChild(target.firstChild);
                                }
                                state.content = contentFragment;

                                const placeholder = document.createElement('div');
                                placeholder.style.height = `${state.height}px`;
                                target.innerHTML = '';
                                target.appendChild(placeholder);
                            }
                            state.isRealized = false;
                        });
                    }
                }
            });
        }, {
            root: container,
            rootMargin: `${BUFFER_PX}px 0px ${BUFFER_PX}px 0px`,
        });

        const processNode = (node) => {
            if (node.matches && node.matches(MESSAGE_TURN_SELECTOR)) {
                VIRTUALIZATION_MAP.set(node, {
                    isRealized: true,
                    content: null,
                    height: 0,
                });
                intersectionObserver.observe(node);
            }
        };

        const mutationObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            processNode(node);
                            node.querySelectorAll(MESSAGE_TURN_SELECTOR).forEach(processNode);
                        }
                    });
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === 1 && VIRTUALIZATION_MAP.has(node)) {
                            intersectionObserver.unobserve(node);
                            VIRTUALIZATION_MAP.delete(node);
                        }
                    });
                }
            }
        });

        container.querySelectorAll(MESSAGE_TURN_SELECTOR).forEach(processNode);

        mutationObserver.observe(container, {
            childList: true,
            subtree: true
        });

        window.addEventListener('beforeunload', () => {
            mutationObserver.disconnect();
            intersectionObserver.disconnect();
            window.geminiOptimizerRunning = false;
        }, { once: true });
    };

    const optimizeChatPerformance = () => {
        if (window.geminiOptimizerRunning) return;
        window.geminiOptimizerRunning = true;

        const CHAT_CONTAINER_SELECTOR = '.chat-view-container';

        waitForElement(CHAT_CONTAINER_SELECTOR, (chatContainer) => {
            initOptimization(chatContainer);
        }, 5000);
    };

    const init = () => {
        if (!window.location.href.includes('/prompts/')) {
            window.geminiWorkerRunning = false;
            return;
        }

        waitForElement(selectors.modelTitle, (modelTitleEl) => {
            evaluateAndApplySettings();

            if (modelChangeObserver) {
                modelChangeObserver.disconnect();
            }

            modelChangeObserver = new MutationObserver(evaluateAndApplySettings);

            modelChangeObserver.observe(modelTitleEl, {
                characterData: true,
                childList: true,
                subtree: true
            });
        });

        optimizeChatPerformance();
        window.geminiWorkerRunning = false;
    };

    window.addEventListener('beforeunload', () => {
        if (modelChangeObserver) {
            modelChangeObserver.disconnect();
        }
    }, { once: true });

    init();
})();