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
    };

    const waitForElement = (selector, callback, timeout = 3000) => {
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback(element);
            }
        }, 100);
        setTimeout(() => clearInterval(interval), timeout);
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
        const style = document.createElement('style');
        style.id = 'gemini-worker-style';
        style.textContent = `body > .cdk-overlay-container { display: none !important; }`;
        document.head.appendChild(style);

        const openButton = document.querySelector(selectors.systemInstructionsOpenButton);
        if (!openButton) {
            style.remove();
            if (callback) callback();
            return;
        }
        openButton.click();

        setTimeout(() => {
            const panel = document.querySelector('.ms-sliding-right-panel-dialog');
            if (panel) {
                const textarea = panel.querySelector(selectors.systemInstructionsTextarea);
                if (textarea) {
                    textarea.value = instructions;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }
                const closeButton = panel.querySelector(selectors.systemInstructionsCloseButton);
                if (closeButton) {
                    closeButton.click();
                }
            }
            setTimeout(() => {
                style.remove();
                if (callback) callback();
            }, 150);
        }, 200);
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
            window.geminiWorkerRunning = false;
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
            window.geminiWorkerRunning = false;
        });
    };

    const init = () => {
        if (!window.location.href.includes('/prompts/')) {
            window.geminiWorkerRunning = false;
            return;
        }

        waitForElement(selectors.modelTitle, () => {
            chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
                const modelTitleEl = document.querySelector(selectors.modelTitle);
                if (!modelTitleEl) {
                    window.geminiWorkerRunning = false;
                    return;
                }

                const modelName = modelTitleEl.textContent.trim().toLowerCase();

                if (modelName.includes('nano banana')) {
                    resetToDefaults();
                } else {
                    if (result.presets && result.activePresetIndex !== undefined && result.activePresetIndex >= 0) {
                        const preset = result.presets[result.activePresetIndex];
                        if (preset) {
                            applyPreset(preset);
                        }
                    } else {
                         window.geminiWorkerRunning = false;
                    }
                }
            });
        });
    };

    init();

})();