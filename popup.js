document.addEventListener('DOMContentLoaded', () => {
    const ui = {
        tempSlider: document.getElementById('temperature'),
        tempValue: document.getElementById('temperature-value'),
        topPSlider: document.getElementById('topP'),
        topPValue: document.getElementById('topP-value'),
        instructionsInput: document.getElementById('system-instructions'),
        presetsList: document.getElementById('presets-list'),
        savePresetBtn: document.getElementById('save-preset-button'),
        addNewPresetBtn: document.getElementById('add-new-preset-button'),
        noPresetsMessage: document.getElementById('no-presets-message'),
        
        toolToggles: {
            codeExecution: document.getElementById('code-execution-tool'),
            search: document.getElementById('search-tool'),
            urlContext: document.getElementById('url-context-tool'),
        },
        toolCards: document.querySelectorAll('.tool-card'),

        saveModal: {
            overlay: document.getElementById('save-modal-overlay'),
            title: document.getElementById('save-modal-title'),
            saveButton: document.getElementById('modal-save-button'),
            cancelButton: document.getElementById('modal-cancel-button'),
            nameInput: document.getElementById('preset-name-input'),
        },

        confirmModal: {
            overlay: document.getElementById('confirmation-modal-overlay'),
            confirmButton: document.getElementById('confirmation-confirm-button'),
            cancelButton: document.getElementById('confirmation-cancel-button'),
        },
    };

    let state = {
        presets: [],
        activeIndex: -1,
        editingIndex: -1,
        deleteIndex: -1,
        activePresetSnapshot: '',
    };

    const getUIStateSnapshot = () => {
        const data = {
            temperature: ui.tempSlider.value,
            topP: ui.topPSlider.value,
            systemInstructions: ui.instructionsInput.value,
            tools: {
                codeExecution: ui.toolToggles.codeExecution.checked,
                search: ui.toolToggles.search.checked,
                urlContext: ui.toolToggles.urlContext.checked,
            },
        };
        return JSON.stringify(data);
    };

    const updateSaveButtonState = () => {
        if (state.activeIndex === -1) {
            ui.savePresetBtn.textContent = 'Save as New Preset';
            ui.savePresetBtn.disabled = false;
        } else {
            ui.savePresetBtn.textContent = 'Save';
            const currentState = getUIStateSnapshot();
            ui.savePresetBtn.disabled = currentState === state.activePresetSnapshot;
        }
    };

    const render = () => {
        ui.presetsList.innerHTML = '';
        ui.noPresetsMessage.style.display = state.presets.length === 0 ? 'block' : 'none';
        ui.addNewPresetBtn.style.display = state.presets.length > 0 ? 'block' : 'none';

        state.presets.forEach((preset, index) => {
            const li = document.createElement('li');
            li.className = `preset-item ${index === state.activeIndex ? 'selected' : ''}`;
            li.dataset.index = index;

            li.innerHTML = `
                <span class="preset-name">${preset.name}</span>
                <div class="preset-item-buttons">
                    <button class="preset-action-btn edit-preset" title="Rename Preset">&#9998;</button>
                    <button class="preset-action-btn delete-preset" title="Delete Preset">&times;</button>
                </div>
            `;
            ui.presetsList.appendChild(li);
        });
        updateSaveButtonState();
    };

    const syncUIToPreset = (preset) => {
        ui.tempSlider.value = preset.temperature;
        ui.topPSlider.value = preset.topP;
        ui.tempValue.value = parseFloat(preset.temperature).toFixed(2);
        ui.topPValue.value = parseFloat(preset.topP).toFixed(2);
        ui.instructionsInput.value = preset.systemInstructions;
        ui.toolToggles.codeExecution.checked = preset.tools.codeExecution;
        ui.toolToggles.search.checked = preset.tools.search;
        ui.toolToggles.urlContext.checked = preset.tools.urlContext || false;
        
        ui.toolCards.forEach(card => {
            const checkbox = document.getElementById(card.dataset.tool);
            if (checkbox && checkbox.checked) card.classList.add('active');
            else card.classList.remove('active');
        });
        state.activePresetSnapshot = getUIStateSnapshot();
        updateSaveButtonState();
    };

    const loadState = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            state.presets = result.presets || [];
            let activeIndex = result.activePresetIndex === undefined ? -1 : result.activePresetIndex;

            if (activeIndex >= state.presets.length) {
                activeIndex = -1;
            }
            state.activeIndex = activeIndex;

            if (state.activeIndex !== -1) {
                syncUIToPreset(state.presets[state.activeIndex]);
            }
            render();
        });
    };

    const saveState = (callback) => {
        chrome.storage.local.set({ presets: state.presets, activeIndex: state.activeIndex }, () => {
            render();
            if (callback) callback();
        });
    };

    const handleSliderValueInput = (input, slider) => {
        let value = parseFloat(input.value);
        if (isNaN(value)) return;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        if (value < min) value = min;
        if (value > max) value = max;
        slider.value = value;
        if (document.activeElement !== input) {
            input.value = value.toFixed(2);
        }
        updateSaveButtonState();
    };
    
    const openSaveModal = (isEditing = false, index = -1) => {
        state.editingIndex = isEditing ? index : -1;
        if (isEditing) {
            ui.saveModal.title.textContent = 'Rename Preset';
            ui.saveModal.nameInput.value = state.presets[index].name;
        } else {
            ui.saveModal.title.textContent = 'Add New Preset';
            ui.saveModal.nameInput.value = '';
        }
        ui.saveModal.overlay.style.display = 'flex';
        ui.saveModal.nameInput.focus();
    };

    const closeSaveModal = () => {
        ui.saveModal.overlay.style.display = 'none';
        state.editingIndex = -1;
    };

    const getPresetDataFromUI = () => ({
        temperature: parseFloat(ui.tempSlider.value),
        topP: parseFloat(ui.topPSlider.value),
        systemInstructions: ui.instructionsInput.value,
        tools: {
            codeExecution: ui.toolToggles.codeExecution.checked,
            search: ui.toolToggles.search.checked,
            urlContext: ui.toolToggles.urlContext.checked,
        },
    });

    const saveFromModal = () => {
        const presetName = ui.saveModal.nameInput.value.trim();
        if (!presetName) return;

        if (state.editingIndex !== -1) {
            state.presets[state.editingIndex].name = presetName;
            saveState(closeSaveModal);
        } else {
            const newPreset = { ...getPresetDataFromUI(), name: presetName };
            state.presets.push(newPreset);
            state.activeIndex = state.presets.length - 1;
            state.activePresetSnapshot = getUIStateSnapshot();
            saveState(closeSaveModal);
        }
    };

    const saveMainButtonAction = () => {
        if (state.activeIndex === -1) {
            openSaveModal(false);
        } else {
            const updatedData = getPresetDataFromUI();
            state.presets[state.activeIndex] = { ...state.presets[state.activeIndex], ...updatedData };
            state.activePresetSnapshot = getUIStateSnapshot();
            saveState();
        }
    };

    const deletePreset = () => {
        if (state.deleteIndex === -1) return;
        state.presets.splice(state.deleteIndex, 1);
        if (state.deleteIndex === state.activeIndex) {
            state.activeIndex = -1;
            state.activePresetSnapshot = '';
        } else if (state.deleteIndex < state.activeIndex) {
            state.activeIndex -= 1;
        }
        saveState(closeConfirmModal);
    };

    const openConfirmModal = (index) => {
        state.deleteIndex = index;
        ui.confirmModal.overlay.style.display = 'flex';
    };

    const closeConfirmModal = () => {
        ui.confirmModal.overlay.style.display = 'none';
        state.deleteIndex = -1;
    };

    const setupEventListeners = () => {
        ui.presetsList.addEventListener('click', (e) => {
            const presetItem = e.target.closest('.preset-item');
            if (!presetItem) return;
            const index = parseInt(presetItem.dataset.index, 10);

            if (e.target.closest('.delete-preset')) {
                openConfirmModal(index);
            } else if (e.target.closest('.edit-preset')) {
                openSaveModal(true, index);
            } else {
                state.activeIndex = index;
                syncUIToPreset(state.presets[index]);
                saveState();
            }
        });

        ui.toolCards.forEach(card => {
            card.addEventListener('click', () => {
                const checkbox = document.getElementById(card.dataset.tool);
                if(checkbox) {
                    checkbox.checked = !checkbox.checked;
                    card.classList.toggle('active');
                    updateSaveButtonState();
                }
            });
        });

        const setupSliderListener = (slider, textValue) => {
            slider.addEventListener('input', () => {
                textValue.value = parseFloat(slider.value).toFixed(2);
                updateSaveButtonState();
            });
            textValue.addEventListener('change', () => handleSliderValueInput(textValue, slider));
        };

        setupSliderListener(ui.tempSlider, ui.tempValue);
        setupSliderListener(ui.topPSlider, ui.topPValue);
        ui.instructionsInput.addEventListener('input', updateSaveButtonState);
        
        ui.savePresetBtn.addEventListener('click', saveMainButtonAction);
        ui.addNewPresetBtn.addEventListener('click', () => openSaveModal(false));
        ui.saveModal.saveButton.addEventListener('click', saveFromModal);
        ui.saveModal.cancelButton.addEventListener('click', closeSaveModal);
        ui.confirmModal.confirmButton.addEventListener('click', deletePreset);
        ui.confirmModal.cancelButton.addEventListener('click', closeConfirmModal);
    };

    setupEventListeners();
    loadState();
});
