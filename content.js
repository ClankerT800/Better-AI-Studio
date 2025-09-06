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
            systemInstructionsButton: 'button[data-test-id="system-instructions-button"]',
            systemInstructionsTextarea: 'textarea[aria-label="System instructions"]'
        };

        const applySettings = () => {
            const tempSlider = document.querySelector(selectors.tempSlider);
            if (tempSlider) {
                tempSlider.value = preset.temperature;
                tempSlider.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const topPSlider = document.querySelector(selectors.topPSlider);
            if (topPSlider) {
                topPSlider.value = preset.topP;
                topPSlider.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const codeToggle = document.querySelector(selectors.codeExecutionToggle);
            if (codeToggle && codeToggle.getAttribute('aria-checked') !== String(preset.tools.codeExecution)) {
                codeToggle.click();
            }

            const searchToggle = document.querySelector(selectors.searchToggle);
            if (searchToggle && searchToggle.getAttribute('aria-checked') !== String(preset.tools.search)) {
                searchToggle.click();
            }

            if (preset.systemInstructions) {
                const siButton = document.querySelector(selectors.systemInstructionsButton);
                if (siButton) {
                    siButton.click();
                    // Use a short delay to allow the textarea to become visible
                    setTimeout(() => {
                        const siTextarea = document.querySelector(selectors.systemInstructionsTextarea);
                        if (siTextarea) {
                            siTextarea.value = preset.systemInstructions;
                            siTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                            siButton.click(); // Close the dialog
                        }
                    }, 100);
                }
            }
        };

        const observer = new MutationObserver((mutations, obs) => {
            const settingsContainer = document.querySelector('div[data-test-id="temperatureSliderContainer"]');
            if (settingsContainer) {
                applySettings();
                removeHidingStyle();
                obs.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            removeHidingStyle();
            observer.disconnect();
        }, 3000);
    });
})();