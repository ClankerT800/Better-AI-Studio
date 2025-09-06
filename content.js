(() => {
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
            tempSlider: 'div[data-test-id="temperatureSliderContainer"] mat-slider input[type="range"]',
            topPSlider: 'ms-slider[title*="Top P"] input[type="range"]',
            codeExecutionToggle: 'mat-slide-toggle.code-execution-toggle button',
            searchToggle: 'mat-slide-toggle.search-as-a-tool-toggle button',
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
            if (el && el.getAttribute('aria-checked') !== String(shouldBeChecked)) {
                el.click();
            }
        };

        const applySettings = () => {
            setSliderValue(selectors.tempSlider, preset.temperature);
            setSliderValue(selectors.topPSlider, preset.topP);
            setToggleValue(selectors.codeExecutionToggle, preset.tools.codeExecution);
            setToggleValue(selectors.searchToggle, preset.tools.search);

            if (preset.systemInstructions && preset.systemInstructions.trim() !== '') {
                const siButtonOpen = document.querySelector(selectors.systemInstructionsOpenButton);
                if (siButtonOpen) {
                    siButtonOpen.click();
                    const siObserver = new MutationObserver((mutations, obs) => {
                        const siTextarea = document.querySelector(selectors.systemInstructionsTextarea);
                        const siButtonClose = document.querySelector(selectors.systemInstructionsCloseButton);
                        if (siTextarea && siButtonClose) {
                            siTextarea.value = preset.systemInstructions;
                            siTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                            siButtonClose.click();
                            obs.disconnect();
                        }
                    });
                    siObserver.observe(document.body, { childList: true, subtree: true });
                    setTimeout(() => siObserver.disconnect(), 2000);
                }
            }
        };

        const mainObserver = new MutationObserver((mutations, obs) => {
            if (document.querySelector(selectors.tempSlider)) {
                applySettings();
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