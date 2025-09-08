document.addEventListener('DOMContentLoaded', () => {
    const ui = {
        temperatureSlider: document.getElementById('temperature-slider'),
        temperatureValueInput: document.getElementById('temperature-value-input'),
        topPSlider: document.getElementById('top-p-slider'),
        topPValueInput: document.getElementById('top-p-value-input'),
        codeExecutionToggle: document.getElementById('code-execution-toggle'),
        searchToggle: document.getElementById('search-toggle'),
        urlContextToggle: document.getElementById('url-context-toggle'),
        toolCards: document.querySelectorAll('.tool'),
        systemInstructionsTextarea: document.getElementById('system-instructions-textarea'),
        presetsListContainer: document.getElementById('presets-list-container'),
        savePresetBtn: document.getElementById('save-preset-btn'),
        addNewPresetBtn: document.getElementById('add-new-preset-btn'),
        savePresetModal: document.getElementById('save-preset-modal'),
        savePresetModalSaveBtn: document.getElementById('save-preset-modal-save-btn'),
        savePresetModalCancelBtn: document.getElementById('save-preset-modal-cancel-btn'),
        presetNameModalInput: document.getElementById('preset-name-modal-input'),
        deleteConfirmModal: document.getElementById('delete-confirm-modal'),
        deleteConfirmModalConfirmBtn: document.getElementById('delete-confirm-modal-confirm-btn'),
        deleteConfirmModalCancelBtn: document.getElementById('delete-confirm-modal-cancel-btn'),
        noPresetsMsg: document.getElementById('no-presets-msg'),
    };

    let activePresetState = null;

    function deepEqual(obj1, obj2) {
        if (obj1 === obj2) return true;
        if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
            return false;
        }
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) return false;
        for (const key of keys1) {
            if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
                return false;
            }
        }
        return true;
    }

    const getCurrentUiState = () => ({
        temperature: parseFloat(ui.temperatureSlider.value),
        topP: parseFloat(ui.topPSlider.value),
        tools: {
            codeExecution: ui.codeExecutionToggle.checked,
            search: ui.searchToggle.checked,
            urlContext: ui.urlContextToggle.checked,
        },
        systemInstructions: ui.systemInstructionsTextarea.value,
    });

    const areStatesDifferent = (state1, state2) => {
        if (!state1 || !state2) return false;
        return !deepEqual(state1, state2);
    };

    const updateSaveButtonState = () => {
        chrome.storage.local.get('presets', ({ presets }) => {
            if (!presets || presets.length === 0) {
                ui.savePresetBtn.disabled = false;
                return;
            }
            if (!activePresetState) {
                ui.savePresetBtn.disabled = true;
                return;
            }
            const currentState = getCurrentUiState();
            ui.savePresetBtn.disabled = !areStatesDifferent(activePresetState, currentState);
        });
    };

    const setupChangeListeners = () => {
        const inputs = [ui.temperatureSlider, ui.topPSlider, ui.systemInstructionsTextarea, ui.temperatureValueInput, ui.topPValueInput, ui.codeExecutionToggle, ui.searchToggle, ui.urlContextToggle];
        inputs.forEach(el => {
            el.addEventListener('input', updateSaveButtonState);
            el.addEventListener('change', updateSaveButtonState);
        });
    };

    const updateSliderFromText = (textInput, slider) => {
        let value = parseFloat(textInput.value);
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        if (isNaN(value)) value = min;
        if (value < min) value = min;
        if (value > max) value = max;
        slider.value = value;
        textInput.value = value.toFixed(2);
        updateSliderTrack(slider);
    };

    ui.temperatureValueInput.addEventListener('change', () => updateSliderFromText(ui.temperatureValueInput, ui.temperatureSlider));
    ui.topPValueInput.addEventListener('change', () => updateSliderFromText(ui.topPValueInput, ui.topPSlider));

    const updateTextFromSlider = (slider, textInput) => {
        textInput.value = parseFloat(slider.value).toFixed(2);
    };

    const updateSliderTrack = (slider) => {
        const progress = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.setProperty('--slider-progress', `${progress}%`);
    };

    ui.temperatureSlider.addEventListener('input', () => {
        updateTextFromSlider(ui.temperatureSlider, ui.temperatureValueInput)
        updateSliderTrack(ui.temperatureSlider);
    });
    ui.topPSlider.addEventListener('input', () => {
        updateTextFromSlider(ui.topPSlider, ui.topPValueInput)
        updateSliderTrack(ui.topPSlider);
    });

    ui.toolCards.forEach(card => {
        const checkbox = document.getElementById(card.dataset.tool);
        if (!checkbox) return;

        const syncCardClass = () => card.classList.toggle('active', checkbox.checked);
        checkbox.addEventListener('change', syncCardClass);

        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });

    const makePresetNameEditable = (span, index) => {
        const originalName = span.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'preset__name-input';

        Object.assign(input.style, {
            width: '100%',
            padding: '0',
            margin: '0',
            border: '1px solid var(--primary-accent)',
            borderRadius: '4px',
            background: 'var(--surface-elevated)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            textAlign: 'left'
        });

        span.replaceWith(input);
        input.focus();
        input.select();

        const saveChanges = () => {
            const newName = input.value.trim();
            if (newName === '' || newName === originalName) {
                loadPresets();
                return;
            }
            chrome.storage.local.get('presets', ({ presets }) => {
                if (presets && presets[index]) {
                    presets[index].name = newName;
                    chrome.storage.local.set({ presets }, loadPresets);
                }
            });
        };

        input.addEventListener('blur', saveChanges);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveChanges();
            else if (e.key === 'Escape') loadPresets();
        });
    };

    ui.presetsListContainer.addEventListener('dblclick', (e) => {
        const span = e.target.closest('.preset__name');
        if (span) {
            const li = e.target.closest('.preset');
            if (li && li.dataset.index) {
                const index = parseInt(li.dataset.index, 10);
                makePresetNameEditable(span, index);
            }
        }
    });

    const handlePresetSelect = (index) => {
        chrome.storage.local.get('presets', ({ presets }) => {
            if (!presets || !presets[index]) return;

            chrome.storage.local.set({ activePresetIndex: index });
            applyPresetToPopup(presets[index]);

            ui.presetsListContainer.querySelector('.selected')?.classList.remove('selected');
            ui.presetsListContainer.querySelector(`[data-index="${index}"]`)?.classList.add('selected');
        });
    };

    const loadPresets = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            const presets = result.presets || [];
            const activeIndex = result.activePresetIndex;

            if (presets.length === 0) {
                ui.savePresetBtn.textContent = 'Save as Preset';
                ui.addNewPresetBtn.style.display = 'none';
            } else {
                ui.savePresetBtn.textContent = 'Save';
                ui.addNewPresetBtn.style.display = 'block';
            }

            ui.presetsListContainer.innerHTML = '';
            ui.noPresetsMsg.style.display = presets.length === 0 ? 'block' : 'none';

            presets.forEach((preset, index) => {
                if (!preset || typeof preset.name !== 'string') {
                    console.error("Skipping invalid preset data at index:", index);
                    return;
                }

                const li = document.createElement('li');
                li.className = 'preset';
                li.dataset.index = index;
                if (index === activeIndex) li.classList.add('selected');
                li.innerHTML = `
                    <span class="preset__name">${preset.name}</span>
                    <div class="preset__actions">
                        <button class="preset__action-button preset__action-button--delete" title="Delete preset">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                `;

                li.addEventListener('click', () => {
                    if (li.querySelector('input.preset__name-input')) return;
                    handlePresetSelect(index);
                });

                li.querySelector('.preset__action-button--delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    ui.deleteConfirmModal.style.display = 'flex';
                    const confirmHandler = () => {
                        const currentPresets = result.presets || [];
                        currentPresets.splice(index, 1);
                        const newActiveIndex = (activeIndex === index) ? -1 : (activeIndex > index ? activeIndex - 1 : activeIndex);
                        chrome.storage.local.set({ presets: currentPresets, activePresetIndex: newActiveIndex }, () => {
                            if (newActiveIndex === -1) {
                                activePresetState = null;
                                resetToDefaults();
                            }
                            loadPresets();
                            closeConfirmModal();
                        });
                    };
                    ui.deleteConfirmModalConfirmBtn.addEventListener('click', confirmHandler, { once: true });
                });

                ui.presetsListContainer.appendChild(li);
            });
            updateSaveButtonState();
        });
    };

    const applyStateToUI = (state) => {
        ui.temperatureSlider.value = state.temperature;
        ui.topPSlider.value = state.topP;
        updateTextFromSlider(ui.temperatureSlider, ui.temperatureValueInput);
        updateTextFromSlider(ui.topPSlider, ui.topPValueInput);
        updateSliderTrack(ui.temperatureSlider);
        updateSliderTrack(ui.topPSlider);
        
        ui.codeExecutionToggle.checked = state.tools?.codeExecution ?? false;
        ui.searchToggle.checked = state.tools?.search ?? true;
        ui.urlContextToggle.checked = state.tools?.urlContext ?? false;

        [ui.codeExecutionToggle, ui.searchToggle, ui.urlContextToggle].forEach(
            check => check.dispatchEvent(new Event('change', { bubbles: true }))
        );

        ui.systemInstructionsTextarea.value = state.systemInstructions || '';
    };

    const applyPresetToPopup = (preset) => {
        applyStateToUI(preset);
        const { name, ...state } = preset;
        activePresetState = state;
        updateSaveButtonState();
    };

    const resetToDefaults = () => {
        const defaultState = {
            temperature: 1.0,
            topP: 0.95,
            tools: { codeExecution: false, search: true, urlContext: false },
            systemInstructions: ''
        };
        applyStateToUI(defaultState);
        activePresetState = null;
        ui.presetsListContainer.querySelector('.selected')?.classList.remove('selected');
        chrome.storage.local.set({ activePresetIndex: -1 });
        updateSaveButtonState();
    };

    const closeSaveModal = () => ui.savePresetModal.style.display = 'none';
    ui.savePresetModalCancelBtn.addEventListener('click', closeSaveModal);
    ui.savePresetModal.addEventListener('click', (e) => { if (e.target === ui.savePresetModal) closeSaveModal(); });

    const closeConfirmModal = () => ui.deleteConfirmModal.style.display = 'none';
    ui.deleteConfirmModalCancelBtn.addEventListener('click', closeConfirmModal);
    ui.deleteConfirmModal.addEventListener('click', (e) => { if (e.target === ui.deleteConfirmModal) closeConfirmModal(); });

    ui.addNewPresetBtn.addEventListener('click', () => {
        resetToDefaults();
        ui.presetNameModalInput.value = '';
        ui.savePresetModal.style.display = 'flex';
        ui.presetNameModalInput.focus();
    });

    ui.savePresetBtn.addEventListener('click', () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            const presets = result.presets || [];
            if (presets.length === 0) {
                ui.savePresetModal.style.display = 'flex';
                ui.presetNameModalInput.focus();
            } else {
                const activeIndex = result.activePresetIndex;
                if (activeIndex !== undefined && activeIndex >= 0) {
                    const currentState = getCurrentUiState();
                    presets[activeIndex] = { ...currentState, name: presets[activeIndex].name };
                    chrome.storage.local.set({ presets }, () => {
                        activePresetState = currentState;
                        const originalText = ui.savePresetBtn.textContent;
                        ui.savePresetBtn.textContent = 'Saved!';
                        updateSaveButtonState();
                        setTimeout(() => {
                            ui.savePresetBtn.textContent = originalText;
                        }, 1500);
                    });
                }
            }
        });
    });

    ui.savePresetModalSaveBtn.addEventListener('click', () => {
        const presetName = ui.presetNameModalInput.value.trim();
        if (!presetName) return;
        const newPreset = { name: presetName, ...getCurrentUiState() };
        chrome.storage.local.get(['presets'], (result) => {
            const presets = result.presets || [];
            presets.push(newPreset);
            chrome.storage.local.set({ presets, activePresetIndex: presets.length - 1 }, () => {
                applyPresetToPopup(newPreset);
                loadPresets();
                closeSaveModal();
            });
        });
    });

    (() => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            const presets = result.presets || [];
            const activeIndex = result.activePresetIndex;
            if (presets.length > 0 && activeIndex >= 0 && activeIndex < presets.length) {
                applyPresetToPopup(presets[activeIndex]);
            }
            else {
                resetToDefaults();
            }
            loadPresets();
            setupChangeListeners();
        });
    })();
});