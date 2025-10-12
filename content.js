(() => {
    if (window.geminiWorkerRunning) return;
    window.geminiWorkerRunning = true;

    const SELECTORS = {
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
        chatContainer: '.chat-view-container',
        messageTurn: 'ms-turn',
    };

    let modelChangeObserver = null;
    let isApplyingSettings = false;
    let lastModelName = '';

    const debounce = (func, delay) => {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    };

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
        }, 100);
    };

    const setSlider = (selector, value) => {
        const el = document.querySelector(selector);
        if (el && parseFloat(el.value) !== value) {
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
        const openButton = document.querySelector(SELECTORS.systemInstructionsOpenButton);
        if (!openButton) {
            if (callback) callback();
            return;
        }
        openButton.click();

        waitForElement(`${SELECTORS.slidingPanel} ${SELECTORS.systemInstructionsTextarea}`, (textarea) => {
            if (textarea.value !== instructions) {
                textarea.value = instructions;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const closeButton = textarea.closest(SELECTORS.slidingPanel)?.querySelector(SELECTORS.systemInstructionsCloseButton);
            if (closeButton) closeButton.click();
            
            const checkPanelClosed = setInterval(() => {
                if (!document.querySelector(SELECTORS.slidingPanel)) {
                    clearInterval(checkPanelClosed);
                    if (callback) callback();
                }
            }, 100);
        });
    };

    const applyPreset = (preset) => {
        isApplyingSettings = true;
        setSlider(SELECTORS.tempSlider, preset.temperature);
        setSlider(SELECTORS.topPSlider, preset.topP);
        setToggle(SELECTORS.codeExecutionToggle, preset.tools.codeExecution);
        setToggle(SELECTORS.searchToggle, preset.tools.search);
        setToggle(SELECTORS.urlContextToggle, preset.tools.urlContext || false);
        setSystemInstructions(preset.systemInstructions, () => {
            const promptInput = document.querySelector(SELECTORS.promptInput);
            if (promptInput) promptInput.focus();
            isApplyingSettings = false;
        });
    };

    const evaluateAndApplySettings = debounce(() => {
        if (isApplyingSettings) return;

        const modelTitleEl = document.querySelector(SELECTORS.modelTitle);
        if (!modelTitleEl) return;
        
        const modelName = modelTitleEl.textContent.trim().toLowerCase();
        if (modelName === lastModelName) return;

        lastModelName = modelName;

        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            if (result.presets && result.activePresetIndex !== undefined && result.activePresetIndex >= 0) {
                const preset = result.presets[result.activePresetIndex];
                if (preset) applyPreset(preset);
            }
        });
    }, 300);

    const initVirtualization = (container) => {
        const VIRTUALIZATION_MAP = new WeakMap();
        const BUFFER_PX = 1000;

        const intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const target = entry.target;
                const state = VIRTUALIZATION_MAP.get(target);
                if (!state) return;

                if (entry.isIntersecting) {
                    if (!state.isRealized) {
                        window.requestAnimationFrame(() => {
                            if (state.content) target.appendChild(state.content);
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
                                while (target.firstChild) contentFragment.appendChild(target.firstChild);
                                state.content = contentFragment;
                                target.style.height = `${state.height}px`;
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
            if (node.matches && node.matches(SELECTORS.messageTurn)) {
                VIRTUALIZATION_MAP.set(node, { isRealized: true, content: null, height: 0 });
                intersectionObserver.observe(node);
            }
        };

        const mutationObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type !== 'childList') continue;
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    processNode(node);
                    node.querySelectorAll(SELECTORS.messageTurn).forEach(processNode);
                });
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === 1 && VIRTUALIZATION_MAP.has(node)) {
                        intersectionObserver.unobserve(node);
                        VIRTUALIZATION_MAP.delete(node);
                    }
                });
            }
        });

        container.querySelectorAll(SELECTORS.messageTurn).forEach(processNode);
        mutationObserver.observe(container, { childList: true, subtree: true });

        window.addEventListener('beforeunload', () => {
            mutationObserver.disconnect();
            intersectionObserver.disconnect();
        }, { once: true });
    };

    const init = () => {
        if (!window.location.href.includes('/prompts/')) return;

        waitForElement(SELECTORS.modelTitle, (modelTitleEl) => {
            evaluateAndApplySettings();
            if (modelChangeObserver) modelChangeObserver.disconnect();
            modelChangeObserver = new MutationObserver(evaluateAndApplySettings);
            modelChangeObserver.observe(modelTitleEl, { characterData: true, childList: true, subtree: true });
        });

        waitForElement(SELECTORS.chatContainer, initVirtualization);
    };

    init();
    window.geminiWorkerRunning = false;
})();
