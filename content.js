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
            tempNumberInput: 'div[data-test-id="temperatureSliderContainer"] input[type="number"]',
            topPSlider: 'ms-slider[title*="Top P"] input[type="range"]',
            topPNumberInput: 'ms-slider[title*="Top P"] input[type="number"]',
            codeExecutionToggle: 'mat-slide-toggle.code-execution-toggle button',
            searchToggle: 'mat-slide-toggle.search-as-a-tool-toggle button',
            systemInstructionsButton: 'button[data-test-si]',
            systemInstructionsTextarea: 'textarea[aria-label="System instructions"]'
        };

        const applied = new Set();
        const allTasks = new Set(Object.keys(selectors));

        const setSliderValue = (el, value) => {
            if (el && el.value !== String(value)) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        const setInputValue = (el, value) => {
            if (el && el.value !== String(value)) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        
        const setToggleValue = (el, shouldBeChecked) => {
            if (el && el.getAttribute('aria-checked') !== String(shouldBeChecked)) {
                el.click();
            }
        };

        const observer = new MutationObserver(() => {
            if (applied.size === allTasks.size) {
                observer.disconnect();
                removeHidingStyle();
                return;
            }

            for (const task of allTasks) {
                if (applied.has(task)) continue;
                
                const el = document.querySelector(selectors[task]);
                if (el) {
                    switch (task) {
                        case 'tempSlider': setSliderValue(el, preset.temperature); break;
                        case 'tempNumberInput': setInputValue(el, preset.temperature); break;
                        case 'topPSlider': setSliderValue(el, preset.topP); break;
                        case 'topPNumberInput': setInputValue(el, preset.topP); break;
                        case 'codeExecutionToggle': setToggleValue(el, preset.tools.codeExecution); break;
                        case 'searchToggle': setToggleValue(el, preset.tools.search); break;
                        case 'systemInstructionsButton': 
                            if (preset.systemInstructions) { el.click(); }
                            break;
                        case 'systemInstructionsTextarea':
                            setInputValue(el, preset.systemInstructions);
                            document.querySelector(selectors.systemInstructionsButton)?.click();
                            break;
                    }
                    applied.add(task);
                } else if (task === 'systemInstructionsTextarea' && !preset.systemInstructions) {
                    applied.add(task);
                }
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
        
        setTimeout(() => {
            if (applied.size < allTasks.size) {
                observer.disconnect();
                removeHidingStyle();
            }
        }, 5000);
    });
})();