(() => {
    if (!window.location.href.includes('/prompts/')) {
        return;
    }

    const styleId = 'ai-studio-settings-hider';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = 'body { visibility: hidden !important; }';
    document.documentElement.appendChild(style);

    const removeHidingStyle = () => {
        const styleElement = document.getElementById(styleId);
        if (styleElement) styleElement.remove();
    };

    chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
        const { presets, activePresetIndex } = result;
        if (!presets || presets.length === 0 || activePresetIndex === undefined || activePresetIndex < 0) {
            removeHidingStyle();
            return;
        }

        const preset = presets[activePresetIndex];
        if (!preset) {
            removeHidingStyle();
            return;
        }

        const selectors = {
            modelTitle: 'ms-model-selector-v3 .title',
            tempSlider: 'div[data-test-id="temperatureSliderContainer"] mat-slider input[type="range"]',
            topPSlider: 'ms-slider[title*="Top P"] input[type="range"]',
            codeExecutionToggle: 'mat-slide-toggle.code-execution-toggle button',
            searchToggle: 'mat-slide-toggle.search-as-a-tool-toggle button',
            urlContextToggle: 'div[data-test-id="browseAsAToolTooltip"] button[role="switch"]',
            systemInstructionsOpenButton: 'button[data-test-si]',
            systemInstructionsCloseButton: 'button[aria-label="Close system instructions"]',
            systemInstructionsTextarea: 'textarea[aria-label="System instructions"]'
        };

        const setSliderValue = (selector, value) => {
            const el = document.querySelector(selector);
            if (el && el.value !== String(value)) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };

        const setToggleValue = (selector, shouldBeChecked) => {
            const el = document.querySelector(selector);
            if (!el) return;
            const isChecked = el.getAttribute('aria-checked') === 'true';
            if (isChecked !== shouldBeChecked) {
                el.click();
            }
        };

        const setSystemInstructions = (instructions) => {
            const openButton = document.querySelector(selectors.systemInstructionsOpenButton);
            if (!openButton) return;

            openButton.click();
            const observer = new MutationObserver((_, obs) => {
                const textarea = document.querySelector(selectors.systemInstructionsTextarea);
                const closeButton = document.querySelector(selectors.systemInstructionsCloseButton);
                if (textarea && closeButton) {
                    textarea.value = instructions;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    closeButton.click();
                    obs.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), 2000);
        };

        const applyPresetSettings = () => {
            setSliderValue(selectors.tempSlider, preset.temperature);
            setSliderValue(selectors.topPSlider, preset.topP);
            setToggleValue(selectors.codeExecutionToggle, preset.tools.codeExecution);
            setToggleValue(selectors.searchToggle, preset.tools.search);
            setToggleValue(selectors.urlContextToggle, preset.tools.urlContext || false);
            if (preset.systemInstructions !== undefined) {
                setSystemInstructions(preset.systemInstructions);
            }
        };

        const resetToDefaults = () => {
            setSliderValue(selectors.tempSlider, 1.0);
            setSliderValue(selectors.topPSlider, 0.95);
            setToggleValue(selectors.codeExecutionToggle, false);
            setToggleValue(selectors.searchToggle, true);
            setToggleValue(selectors.urlContextToggle, false);
            setSystemInstructions('');
        };

        const mainObserver = new MutationObserver((mutations, obs) => {
            const tempSlider = document.querySelector(selectors.tempSlider);
            const modelTitleElement = document.querySelector(selectors.modelTitle);

            if (tempSlider && modelTitleElement && modelTitleElement.textContent.trim() !== '') {
                if (modelTitleElement.textContent.trim().toLowerCase().includes('nano banana')) {
                    resetToDefaults();
                } else {
                    applyPresetSettings();
                }
                removeHidingStyle();
                obs.disconnect();
            }
        });

        mainObserver.observe(document.body, { childList: true, subtree: true });
        
        setTimeout(() => {
            removeHidingStyle();
            mainObserver.disconnect();
        }, 5000);
    });
})();