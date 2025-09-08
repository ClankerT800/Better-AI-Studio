document.addEventListener('DOMContentLoaded', () => {
    const ui = {
        tempSlider: document.getElementById('temperature'),
        tempValue: document.getElementById('temperature-value'),
        topPSlider: document.getElementById('topP'),
        topPValue: document.getElementById('topP-value'),
        codeExecutionCheck: document.getElementById('code-execution-tool'),
        searchCheck: document.getElementById('search-tool'),
        urlContextCheck: document.getElementById('url-context-tool'),
        toolCards: document.querySelectorAll('.tool-card'),
        instructionsInput: document.getElementById('system-instructions'),
        presetsList: document.getElementById('presets-list'),
        updatePresetBtn: document.getElementById('save-preset-button'),
        addNewPresetBtn: document.getElementById('add-new-preset-button'),
        saveModalOverlay: document.getElementById('save-modal-overlay'),
        saveModalSaveBtn: document.getElementById('modal-save-button'),
        saveModalCancelBtn: document.getElementById('modal-cancel-button'),
        presetNameInput: document.getElementById('preset-name-input'),
        confirmModalOverlay: document.getElementById('confirmation-modal-overlay'),
        confirmModalDeleteBtn: document.getElementById('confirmation-confirm-button'),
        confirmModalCancelBtn: document.getElementById('confirmation-cancel-button'),
        noPresetsMessage: document.getElementById('no-presets-message'),
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
        temperature: parseFloat(ui.tempSlider.value),
        topP: parseFloat(ui.topPSlider.value),
        tools: {
            codeExecution: ui.codeExecutionCheck.checked,
            search: ui.searchCheck.checked,
            urlContext: ui.urlContextCheck.checked,
        },
        systemInstructions: ui.instructionsInput.value,
    });

    const areStatesDifferent = (state1, state2) => {
        if (!state1 || !state2) return false;
        return !deepEqual(state1, state2);
    };

    const updateSaveButtonState = () => {
        chrome.storage.local.get('presets', ({ presets }) => {
            if (!presets || presets.length === 0) {
                ui.updatePresetBtn.disabled = false;
                return;
            }
            if (!activePresetState) {
                ui.updatePresetBtn.disabled = true;
                return;
            }
            const currentState = getCurrentUiState();
            ui.updatePresetBtn.disabled = !areStatesDifferent(activePresetState, currentState);
        });
    };

    const setupChangeListeners = () => {
        const inputs = [ui.tempSlider, ui.topPSlider, ui.instructionsInput, ui.tempValue, ui.topPValue, ui.codeExecutionCheck, ui.searchCheck, ui.urlContextCheck];
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
    };

    ui.tempValue.addEventListener('change', () => updateSliderFromText(ui.tempValue, ui.tempSlider));
    ui.topPValue.addEventListener('change', () => updateSliderFromText(ui.topPValue, ui.topPSlider));

    const updateTextFromSlider = (slider, textInput) => {
        textInput.value = parseFloat(slider.value).toFixed(2);
    };

    ui.tempSlider.addEventListener('input', () => updateTextFromSlider(ui.tempSlider, ui.tempValue));
    ui.topPSlider.addEventListener('input', () => updateTextFromSlider(ui.topPSlider, ui.topPValue));

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
        input.className = 'preset-name-input';

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

    ui.presetsList.addEventListener('dblclick', (e) => {
        const span = e.target.closest('.preset-name');
        if (span) {
            const li = e.target.closest('.preset-item');
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

            ui.presetsList.querySelector('.selected')?.classList.remove('selected');
            ui.presetsList.querySelector(`[data-index="${index}"]`)?.classList.add('selected');
        });
    };

    const loadPresets = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            const presets = result.presets || [];
            const activeIndex = result.activePresetIndex;

            if (presets.length === 0) {
                ui.updatePresetBtn.textContent = 'Save as Preset';
                ui.addNewPresetBtn.style.display = 'none';
            } else {
                ui.updatePresetBtn.textContent = 'Save';
                ui.addNewPresetBtn.style.display = 'block';
            }

            ui.presetsList.innerHTML = '';
            ui.noPresetsMessage.style.display = presets.length === 0 ? 'block' : 'none';

            presets.forEach((preset, index) => {
                if (!preset || typeof preset.name !== 'string') {
                    console.error("Skipping invalid preset data at index:", index);
                    return;
                }

                const li = document.createElement('li');
                li.className = 'preset-item';
                li.dataset.index = index;
                if (index === activeIndex) li.classList.add('selected');
                li.innerHTML = `
                    <span class="preset-name">${preset.name}</span>
                    <div class="preset-item-buttons">
                        <button class="preset-action-btn delete-preset" title="Delete preset">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                `;

                li.addEventListener('click', () => {
                    if (li.querySelector('input.preset-name-input')) return;
                    handlePresetSelect(index);
                });

                li.querySelector('.delete-preset').addEventListener('click', (e) => {
                    e.stopPropagation();
                    ui.confirmModalOverlay.style.display = 'flex';
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
                    ui.confirmModalDeleteBtn.addEventListener('click', confirmHandler, { once: true });
                });

                ui.presetsList.appendChild(li);
            });
            updateSaveButtonState();
        });
    };

    const applyStateToUI = (state) => {
        ui.tempSlider.value = state.temperature;
        ui.topPSlider.value = state.topP;
        updateTextFromSlider(ui.tempSlider, ui.tempValue);
        updateTextFromSlider(ui.topPSlider, ui.topPValue);
        
        ui.codeExecutionCheck.checked = state.tools?.codeExecution ?? false;
        ui.searchCheck.checked = state.tools?.search ?? true;
        ui.urlContextCheck.checked = state.tools?.urlContext ?? false;

        [ui.codeExecutionCheck, ui.searchCheck, ui.urlContextCheck].forEach(
            check => check.dispatchEvent(new Event('change', { bubbles: true }))
        );

        ui.instructionsInput.value = state.systemInstructions || '';
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
        ui.presetsList.querySelector('.selected')?.classList.remove('selected');
        chrome.storage.local.set({ activePresetIndex: -1 });
        updateSaveButtonState();
    };

    const closeSaveModal = () => ui.saveModalOverlay.style.display = 'none';
    ui.saveModalCancelBtn.addEventListener('click', closeSaveModal);
    ui.saveModalOverlay.addEventListener('click', (e) => { if (e.target === ui.saveModalOverlay) closeSaveModal(); });

    const closeConfirmModal = () => ui.confirmModalOverlay.style.display = 'none';
    ui.confirmModalCancelBtn.addEventListener('click', closeConfirmModal);
    ui.confirmModalOverlay.addEventListener('click', (e) => { if (e.target === ui.confirmModalOverlay) closeConfirmModal(); });

    ui.addNewPresetBtn.addEventListener('click', () => {
        resetToDefaults();
        ui.presetNameInput.value = '';
        ui.saveModalOverlay.style.display = 'flex';
        ui.presetNameInput.focus();
    });

    ui.updatePresetBtn.addEventListener('click', () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (result) => {
            const presets = result.presets || [];
            if (presets.length === 0) {
                ui.saveModalOverlay.style.display = 'flex';
                ui.presetNameInput.focus();
            } else {
                const activeIndex = result.activePresetIndex;
                if (activeIndex !== undefined && activeIndex >= 0) {
                    const currentState = getCurrentUiState();
                    presets[activeIndex] = { ...currentState, name: presets[activeIndex].name };
                    chrome.storage.local.set({ presets }, () => {
                        activePresetState = currentState;
                        const originalText = ui.updatePresetBtn.textContent;
                        ui.updatePresetBtn.textContent = 'Saved!';
                        updateSaveButtonState();
                        setTimeout(() => {
                            ui.updatePresetBtn.textContent = originalText;
                        }, 1500);
                    });
                }
            }
        });
    });

    ui.saveModalSaveBtn.addEventListener('click', () => {
        const presetName = ui.presetNameInput.value.trim();
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
            } else {
                resetToDefaults();
            }
            loadPresets();
            setupChangeListeners();
        });
    })();
});