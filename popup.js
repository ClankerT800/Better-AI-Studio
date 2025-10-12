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
        presetsSection: document.querySelector('.presets-section'),
    };

    let activePresetState = null;
    let deleteIndex = -1;
    let isProgrammaticUpdate = false;

    const deepEqual = (obj1, obj2) => {
        if (obj1 === obj2) return true;
        if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false;
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) return false;
        for (const key of keys1) {
            if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
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
        if (isProgrammaticUpdate) return;
        chrome.storage.local.get('activePresetIndex', ({ activePresetIndex }) => {
            if (activePresetIndex === -1 || activePresetIndex === undefined) {
                UI.savePresetBtn.disabled = false;
                return;
            }
            const currentState = getCurrentUiState();
            UI.savePresetBtn.disabled = deepEqual(activePresetState, currentState);
        });
    };

    const setupChangeListeners = () => {
        const inputs = [
            UI.temperatureSlider, UI.topPSlider, UI.systemInstructionsTextarea,
            UI.temperatureValueInput, UI.topPValueInput, UI.codeExecutionToggle,
            UI.searchToggle, UI.urlContextToggle
        ];
        inputs.forEach(el => {
            const eventType = el.type === 'range' || el.type === 'textarea' ? 'input' : 'change';
            el.addEventListener(eventType, updateSaveButtonState);
        });
    };

    const updateSliderFromText = (textInput, slider) => {
        let value = parseFloat(textInput.value);
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        if (isNaN(value)) value = min;
        value = Math.max(min, Math.min(max, value));
        isProgrammaticUpdate = true;
        slider.value = value;
        textInput.value = value.toFixed(2);
        updateSliderTrack(slider);
        isProgrammaticUpdate = false;
        updateSaveButtonState();
    };

    const updateTextFromSlider = (slider, textInput) => {
        textInput.value = parseFloat(slider.value).toFixed(2);
    };

    const updateSliderTrack = (slider) => {
        const progress = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.setProperty('--slider-progress', `${progress}%`);
    };

    const makePresetNameEditable = (span, index) => {
        const originalName = span.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'preset__name-input';
        span.replaceWith(input);
        input.focus();
        input.select();

        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== originalName) {
                chrome.storage.local.get('presets', ({ presets }) => {
                    if (presets && presets[index]) {
                        presets[index].name = newName;
                        chrome.storage.local.set({ presets }, () => renderUI());
                    }
                });
            } else {
                renderUI();
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            else if (e.key === 'Escape') renderUI();
        });
    };

    const handlePresetSelect = (index) => {
        chrome.storage.local.get('presets', ({ presets }) => {
            if (!presets?.[index]) return;
            chrome.storage.local.set({ activePresetIndex: index }, () => {
                applyPresetToPopup(presets[index]);
                renderUI();
            });
        });
    };

    const renderUI = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex }) => {
            const presetsExist = presets.length > 0;
            UI.presetsSection.style.display = presetsExist ? 'block' : 'none';
            UI.noPresetsMsg.style.display = presetsExist ? 'none' : 'block';
            UI.addNewPresetBtn.style.display = presetsExist ? 'block' : 'none';

            if (presetsExist) {
                UI.savePresetBtn.textContent = 'Save';
                const fragment = document.createDocumentFragment();
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
                    fragment.appendChild(li);
                });
                UI.presetsListContainer.innerHTML = '';
                UI.presetsListContainer.appendChild(fragment);
            } else {
                UI.savePresetBtn.textContent = 'Save as Preset';
                UI.presetsListContainer.innerHTML = '';
            }
            updateSaveButtonState();
        });
    };

    const applyStateToUI = (state) => {
        isProgrammaticUpdate = true;
        UI.temperatureSlider.value = state.temperature;
        UI.topPSlider.value = state.topP;
        updateTextFromSlider(UI.temperatureSlider, UI.temperatureValueInput);
        updateTextFromSlider(UI.topPSlider, UI.topPValueInput);
        updateSliderTrack(UI.temperatureSlider);
        updateSliderTrack(UI.topPSlider);
        UI.codeExecutionToggle.checked = state.tools?.codeExecution ?? false;
        UI.searchToggle.checked = state.tools?.search ?? true;
        UI.urlContextToggle.checked = state.tools?.urlContext ?? false;
        UI.systemInstructionsTextarea.value = state.systemInstructions || '';
        isProgrammaticUpdate = false;

        UI.toolCards.forEach(card => {
            const checkbox = document.getElementById(card.dataset.tool);
            if (checkbox) card.classList.toggle('active', checkbox.checked);
        });
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
        activePresetState = defaultState;
        chrome.storage.local.set({ activePresetIndex: -1 }, renderUI);
        updateSaveButtonState();
    };

    const closeModal = (modal) => () => modal.style.display = 'none';
    const closeSaveModal = closeModal(UI.savePresetModal);
    const closeConfirmModal = closeModal(UI.deleteConfirmModal);

    UI.temperatureValueInput.addEventListener('change', () => updateSliderFromText(UI.temperatureValueInput, UI.temperatureSlider));
    UI.topPValueInput.addEventListener('change', () => updateSliderFromText(UI.topPValueInput, UI.topPSlider));
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
        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        checkbox.addEventListener('change', () => {
             card.classList.toggle('active', checkbox.checked);
             updateSaveButtonState();
        });
    });

    UI.presetsListContainer.addEventListener('click', (e) => {
        const presetLi = e.target.closest('.preset');
        if (!presetLi || presetLi.querySelector('.preset__name-input')) return;
        const index = parseInt(presetLi.dataset.index, 10);
        if (isNaN(index)) return;

        if (e.target.closest('.preset__action-button--delete')) {
            e.stopPropagation();
            deleteIndex = index;
            UI.deleteConfirmModal.style.display = 'flex';
        } else {
            handlePresetSelect(index);
        }
    });

    UI.presetsListContainer.addEventListener('dblclick', (e) => {
        const nameSpan = e.target.closest('.preset__name');
        const presetLi = e.target.closest('.preset');
        if (nameSpan && presetLi?.dataset.index) {
            makePresetNameEditable(nameSpan, parseInt(presetLi.dataset.index, 10));
        }
    });

    UI.deleteConfirmModalConfirmBtn.addEventListener('click', () => {
        if (deleteIndex === -1) return;
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets, activePresetIndex }) => {
            presets.splice(deleteIndex, 1);
            const newActiveIndex = (activePresetIndex === deleteIndex) ? -1 : (activePresetIndex > deleteIndex ? activePresetIndex - 1 : activePresetIndex);
            chrome.storage.local.set({ presets, activePresetIndex: newActiveIndex }, () => {
                if (newActiveIndex === -1) resetToDefaults();
                else handlePresetSelect(newActiveIndex);
                renderUI();
                closeConfirmModal();
                deleteIndex = -1;
            });
        });
    });

    UI.savePresetModalCancelBtn.addEventListener('click', closeSaveModal);
    UI.savePresetModal.addEventListener('click', (e) => e.target === UI.savePresetModal && closeSaveModal());
    UI.deleteConfirmModalCancelBtn.addEventListener('click', closeConfirmModal);
    UI.deleteConfirmModal.addEventListener('click', (e) => e.target === UI.deleteConfirmModal && closeConfirmModal());

    UI.addNewPresetBtn.addEventListener('click', () => {
        UI.presetNameModalInput.value = '';
        UI.savePresetModal.style.display = 'flex';
        UI.presetNameModalInput.focus();
    });

    UI.savePresetBtn.addEventListener('click', () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex }) => {
            if (presets.length > 0) { // Save existing preset
                if (UI.savePresetBtn.disabled) return;
                const currentState = getCurrentUiState();
                presets[activePresetIndex] = { ...currentState, name: presets[activePresetIndex].name };
                chrome.storage.local.set({ presets }, () => {
                    activePresetState = currentState;
                    const originalText = UI.savePresetBtn.textContent;
                    UI.savePresetBtn.textContent = 'Saved!';
                    updateSaveButtonState();
                    setTimeout(() => { UI.savePresetBtn.textContent = originalText; }, 1500);
                });
            } else { // Save as new preset (first one)
                UI.presetNameModalInput.value = '';
                UI.savePresetModal.style.display = 'flex';
                UI.presetNameModalInput.focus();
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
                renderUI();
                closeSaveModal();
            });
        });
    });

    const init = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex }) => {
            if (presets.length > 0 && activePresetIndex >= 0 && activePresetIndex < presets.length) {
                applyPresetToPopup(presets[activePresetIndex]);
            } else {
                resetToDefaults();
            }
            renderUI();
            setupChangeListeners();
        });
    };

    init();
});