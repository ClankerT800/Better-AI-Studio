document.addEventListener('DOMContentLoaded', () => {
    const ui = {
        tempSlider: document.getElementById('temperature'),
        tempValue: document.getElementById('temperature-value'),
        topPSlider: document.getElementById('topP'),
        topPValue: document.getElementById('topP-value'),
        codeExecutionToggle: document.getElementById('code-execution-tool'),
        searchToggle: document.getElementById('search-tool'),
        instructionsInput: document.getElementById('system-instructions'),
        presetsList: document.getElementById('presets-list'),
        savePresetBtn: document.getElementById('save-preset-button'),
        modalOverlay: document.getElementById('modal-overlay'),
        modalSaveBtn: document.getElementById('modal-save'),
        modalCancelBtn: document.getElementById('modal-cancel'),
        presetNameInput: document.getElementById('preset-name'),
        noPresetsMessage: document.getElementById('no-presets-message'),
    };

    const updateSliderValue = (slider, valueDisplay) => {
        valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
    };

    ui.tempSlider.addEventListener('input', () => updateSliderValue(ui.tempSlider, ui.tempValue));
    ui.topPSlider.addEventListener('input', () => updateSliderValue(ui.topPSlider, ui.topPValue));

    const loadPresets = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            ui.presetsList.innerHTML = '';
            const presets = result.presets || [];
            const activeIndex = result.activePresetIndex;

            ui.noPresetsMessage.style.display = presets.length === 0 ? 'block' : 'none';

            presets.forEach((preset, index) => {
                const li = document.createElement('li');
                li.className = 'preset-item';
                li.innerHTML = `<span class="preset-name">${preset.name}</span><button class="delete-preset">&times;</button>`;
                if (index === activeIndex) li.classList.add('selected');

                li.querySelector('.delete-preset').addEventListener('click', (e) => {
                    e.stopPropagation();
                    presets.splice(index, 1);
                    const newActiveIndex = (activeIndex === index) ? -1 : (activeIndex > index ? activeIndex - 1 : activeIndex);
                    chrome.storage.local.set({ presets, activePresetIndex: newActiveIndex }, loadPresets);
                });

                li.addEventListener('click', () => {
                    chrome.storage.local.set({ activePresetIndex: index }, () => {
                        applyPresetToPopup(preset);
                        loadPresets();
                    });
                });
                ui.presetsList.appendChild(li);
            });
        });
    };

    const applyPresetToPopup = (preset) => {
        ui.tempSlider.value = preset.temperature;
        ui.topPSlider.value = preset.topP;
        updateSliderValue(ui.tempSlider, ui.tempValue);
        updateSliderValue(ui.topPSlider, ui.topPValue);
        ui.codeExecutionToggle.checked = preset.tools.codeExecution;
        ui.searchToggle.checked = preset.tools.search;
        ui.instructionsInput.value = preset.systemInstructions;
    };

    ui.savePresetBtn.addEventListener('click', () => {
        ui.presetNameInput.value = '';
        ui.modalOverlay.style.display = 'flex';
        ui.presetNameInput.focus();
    });

    const closeModal = () => { ui.modalOverlay.style.display = 'none'; };
    ui.modalCancelBtn.addEventListener('click', closeModal);
    ui.modalOverlay.addEventListener('click', (e) => { if (e.target === ui.modalOverlay) closeModal(); });

    ui.modalSaveBtn.addEventListener('click', () => {
        const presetName = ui.presetNameInput.value.trim();
        if (!presetName) return;

        const preset = {
            name: presetName,
            temperature: parseFloat(ui.tempSlider.value),
            topP: parseFloat(ui.topPSlider.value),
            tools: { codeExecution: ui.codeExecutionToggle.checked, search: ui.searchToggle.checked },
            systemInstructions: ui.instructionsInput.value
        };

        chrome.storage.local.get(['presets'], (result) => {
            const presets = result.presets || [];
            presets.push(preset);
            chrome.storage.local.set({ presets, activePresetIndex: presets.length - 1 }, () => {
                loadPresets();
                closeModal();
            });
        });
    });
    
    loadPresets();
});