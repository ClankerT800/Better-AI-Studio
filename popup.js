document.addEventListener('DOMContentLoaded', () => {
    const UI = {
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

    const deepEqual = (obj1, obj2) => {
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
    };

    const getCurrentUiState = () => ({
        temperature: parseFloat(UI.temperatureSlider.value),
        topP: parseFloat(UI.topPSlider.value),
        tools: {
            codeExecution: UI.codeExecutionToggle.checked,
            search: UI.searchToggle.checked,
            urlContext: UI.urlContextToggle.checked,
        },
        systemInstructions: UI.systemInstructionsTextarea.value,
    });

    const updateSaveButtonState = () => {
        chrome.storage.local.get('presets', ({ presets }) => {
            if (!presets || presets.length === 0) {
                UI.savePresetBtn.disabled = false;
                return;
            }
            if (!activePresetState) {
                UI.savePresetBtn.disabled = true;
                return;
            }
            const currentState = getCurrentUiState();
            UI.savePresetBtn.disabled = deepEqual(activePresetState, currentState);
        });
    };

    const setupChangeListeners = () => {
        const inputs = [UI.temperatureSlider, UI.topPSlider, UI.systemInstructionsTextarea, UI.temperatureValueInput, UI.topPValueInput, UI.codeExecutionToggle, UI.searchToggle, UI.urlContextToggle];
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
        value = Math.max(min, Math.min(max, value));
        slider.value = value;
        textInput.value = value.toFixed(2);
        updateSliderTrack(slider);
    };

    UI.temperatureValueInput.addEventListener('change', () => updateSliderFromText(UI.temperatureValueInput, UI.temperatureSlider));
    UI.topPValueInput.addEventListener('change', () => updateSliderFromText(UI.topPValueInput, UI.topPSlider));

    const updateTextFromSlider = (slider, textInput) => {
        textInput.value = parseFloat(slider.value).toFixed(2);
    };

    const updateSliderTrack = (slider) => {
        const progress = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.setProperty('--slider-progress', `${progress}%`);
    };

    UI.temperatureSlider.addEventListener('input', () => {
        updateTextFromSlider(UI.temperatureSlider, UI.temperatureValueInput);
        updateSliderTrack(UI.temperatureSlider);
    });

    UI.topPSlider.addEventListener('input', () => {
        updateTextFromSlider(UI.topPSlider, UI.topPValueInput);
        updateSliderTrack(UI.topPSlider);
    });

    UI.toolCards.forEach(card => {
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
            width: '100%', padding: '0', margin: '0', border: '1px solid var(--primary-accent)',
            borderRadius: '4px', background: 'var(--surface-elevated)', color: 'var(--text-primary)',
            fontFamily: 'inherit', fontSize: '14px', fontWeight: '500', outline: 'none', textAlign: 'left'
        });
        span.replaceWith(input);
        input.focus();
        input.select();

        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== originalName) {
                chrome.storage.local.get('presets', ({ presets }) => {
                    if (presets && presets[index]) {
                        presets[index].name = newName;
                        chrome.storage.local.set({ presets }, loadPresets);
                    }
                });
            } else {
                loadPresets();
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') loadPresets();
        });
    };

    UI.presetsListContainer.addEventListener('dblclick', (e) => {
        const span = e.target.closest('.preset__name');
        if (span) {
            const li = e.target.closest('.preset');
            if (li?.dataset.index) {
                makePresetNameEditable(span, parseInt(li.dataset.index, 10));
            }
        }
    });

    const handlePresetSelect = (index) => {
        chrome.storage.local.get('presets', ({ presets }) => {
            if (!presets?.[index]) return;
            chrome.storage.local.set({ activePresetIndex: index });
            applyPresetToPopup(presets[index]);
            UI.presetsListContainer.querySelector('.selected')?.classList.remove('selected');
            UI.presetsListContainer.querySelector(`[data-index="${index}"]`)?.classList.add('selected');
        });
    };

    const loadPresets = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex }) => {
            UI.savePresetBtn.textContent = presets.length === 0 ? 'Save as Preset' : 'Save';
            UI.addNewPresetBtn.style.display = presets.length === 0 ? 'none' : 'block';
            UI.presetsListContainer.innerHTML = '';
            UI.noPresetsMsg.style.display = presets.length === 0 ? 'block' : 'none';

            presets.forEach((preset, index) => {
                if (!preset?.name) return;
                const li = document.createElement('li');
                li.className = `preset ${index === activePresetIndex ? 'selected' : ''}`;
                li.dataset.index = index;
                li.innerHTML = `
                    <span class="preset__name">${preset.name}</span>
                    <div class="preset__actions">
                        <button class="preset__action-button preset__action-button--delete" title="Delete preset">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>`;
                li.addEventListener('click', () => !li.querySelector('input.preset__name-input') && handlePresetSelect(index));
                li.querySelector('.preset__action-button--delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    UI.deleteConfirmModal.style.display = 'flex';
                    const confirmHandler = () => {
                        presets.splice(index, 1);
                        const newActiveIndex = (activePresetIndex === index) ? -1 : (activePresetIndex > index ? activePresetIndex - 1 : activePresetIndex);
                        chrome.storage.local.set({ presets, activePresetIndex: newActiveIndex }, () => {
                            if (newActiveIndex === -1) {
                                activePresetState = null;
                                resetToDefaults();
                            }
                            loadPresets();
                            closeConfirmModal();
                        });
                    };
                    UI.deleteConfirmModalConfirmBtn.addEventListener('click', confirmHandler, { once: true });
                });
                UI.presetsListContainer.appendChild(li);
            });
            updateSaveButtonState();
        });
    };

    const applyStateToUI = (state) => {
        UI.temperatureSlider.value = state.temperature;
        UI.topPSlider.value = state.topP;
        updateTextFromSlider(UI.temperatureSlider, UI.temperatureValueInput);
        updateTextFromSlider(UI.topPSlider, UI.topPValueInput);
        updateSliderTrack(UI.temperatureSlider);
        updateSliderTrack(UI.topPSlider);
        UI.codeExecutionToggle.checked = state.tools?.codeExecution ?? false;
        UI.searchToggle.checked = state.tools?.search ?? true;
        UI.urlContextToggle.checked = state.tools?.urlContext ?? false;
        [UI.codeExecutionToggle, UI.searchToggle, UI.urlContextToggle].forEach(check => check.dispatchEvent(new Event('change', { bubbles: true })));
        UI.systemInstructionsTextarea.value = state.systemInstructions || '';
    };

    const applyPresetToPopup = (preset) => {
        applyStateToUI(preset);
        const { name, ...state } = preset;
        activePresetState = state;
        updateSaveButtonState();
    };

    const resetToDefaults = () => {
        const defaultState = {
            temperature: 1.0, topP: 0.95,
            tools: { codeExecution: false, search: true, urlContext: false },
            systemInstructions: ''
        };
        applyStateToUI(defaultState);
        activePresetState = null;
        UI.presetsListContainer.querySelector('.selected')?.classList.remove('selected');
        chrome.storage.local.set({ activePresetIndex: -1 });
        updateSaveButtonState();
    };

    const closeModal = (modal) => () => modal.style.display = 'none';
    const closeSaveModal = closeModal(UI.savePresetModal);
    const closeConfirmModal = closeModal(UI.deleteConfirmModal);

    UI.savePresetModalCancelBtn.addEventListener('click', closeSaveModal);
    UI.savePresetModal.addEventListener('click', (e) => e.target === UI.savePresetModal && closeSaveModal());
    UI.deleteConfirmModalCancelBtn.addEventListener('click', closeConfirmModal);
    UI.deleteConfirmModal.addEventListener('click', (e) => e.target === UI.deleteConfirmModal && closeConfirmModal());

    UI.addNewPresetBtn.addEventListener('click', () => {
        resetToDefaults();
        UI.presetNameModalInput.value = '';
        UI.savePresetModal.style.display = 'flex';
        UI.presetNameModalInput.focus();
    });

    UI.savePresetBtn.addEventListener('click', () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex }) => {
            if (presets.length === 0) {
                UI.savePresetModal.style.display = 'flex';
                UI.presetNameModalInput.focus();
            } else if (activePresetIndex !== undefined && activePresetIndex >= 0) {
                const currentState = getCurrentUiState();
                presets[activePresetIndex] = { ...currentState, name: presets[activePresetIndex].name };
                chrome.storage.local.set({ presets }, () => {
                    activePresetState = currentState;
                    const originalText = UI.savePresetBtn.textContent;
                    UI.savePresetBtn.textContent = 'Saved!';
                    updateSaveButtonState();
                    setTimeout(() => UI.savePresetBtn.textContent = originalText, 1500);
                });
            }
        });
    });

    UI.savePresetModalSaveBtn.addEventListener('click', () => {
        const presetName = UI.presetNameModalInput.value.trim();
        if (!presetName) return;
        const newPreset = { name: presetName, ...getCurrentUiState() };
        chrome.storage.local.get('presets', ({ presets = [] }) => {
            presets.push(newPreset);
            chrome.storage.local.set({ presets, activePresetIndex: presets.length - 1 }, () => {
                applyPresetToPopup(newPreset);
                loadPresets();
                closeSaveModal();
            });
        });
    });

    (() => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex }) => {
            if (presets.length > 0 && activePresetIndex >= 0 && activePresetIndex < presets.length) {
                applyPresetToPopup(presets[activePresetIndex]);
            } else {
                resetToDefaults();
            }
            loadPresets();
            setupChangeListeners();
        });
    })();
});