

// Simplified settings modal that uses theme-config.json
class SettingsModal {
    constructor() {
        this.overlay = null;
        this.settings = null;
    }

    async open() {
        this.settings = await this.getSettings();
        this.overlay = this.createDOM();
        document.body.appendChild(this.overlay);

        const closeBtn = this.overlay.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => this.close();
        }

        await this.loadThemes();
        this.setupListeners();
        if (closeBtn) closeBtn.focus();
    }

    close() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    createDOM() {
        const overlay = document.createElement('div');
        overlay.className = 'theme-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        overlay.innerHTML = `
            <div class="theme-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Theme Settings</h3>
                    <button class="modal-close-btn" aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-content">
                    <section class="themes-section">
                        <h3 class="section-title">Themes</h3>
                        <div class="preset-grid" id="themes-grid"></div>
                    </section>
                </div>
            </div>
        `;

        return overlay;
    }

    async getSettings() {
        const data = await chrome.storage.sync.get('settings');
        return data.settings || {
            currentTheme: 'monochrome',
            customThemes: {},
            preferences: {
                favoriteThemes: ['midnight', 'monochrome', 'matrix'],
                recentThemes: []
            },
            version: '1.2.0'
        };
    }

    async loadThemes() {
        const grid = this.overlay.querySelector('#themes-grid');
        const themes = await this.loadThemeData();

        grid.innerHTML = '';

        for (const [themeId, theme] of Object.entries(themes)) {
            const card = this.createThemeCard(theme, themeId);
            grid.appendChild(card);
        }
    }

    async loadThemeData() {
        try {
            const response = await fetch(chrome.runtime.getURL('themes/theme-config.json'));
            const config = await response.json();
            return config.themes || {};
        } catch (error) {
            return {};
        }
    }

    createThemeCard(theme, themeId) {
        const card = document.createElement('div');
        card.className = 'theme-card' + (this.settings.currentTheme === themeId ? ' active' : '');
        card.dataset.themeId = themeId;

        const colors = theme.base ? [
            theme.base.primary,
            theme.base.background,
            theme.base.surface,
            theme.base.text
        ] : ['#666', '#333', '#222', '#fff'];

        card.innerHTML = `
            <div class="theme-card-header">
                <span class="theme-name">${theme.name || themeId}</span>
            </div>
            <div class="theme-preview">
                <div class="preview-swatches">
                    ${colors.map(color => `<span class="swatch" style="background-color: ${color}"></span>`).join('')}
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            this.selectTheme(themeId);
        });

        return card;
    }

    async selectTheme(themeId) {
        await this.updateSettings({ currentTheme: themeId });
        this.settings = await this.getSettings();

        this.overlay.querySelectorAll('.theme-card').forEach(card => {
            card.classList.toggle('active', card.dataset.themeId === themeId);
        });

        // Notify content script of theme change
        chrome.tabs.query({url: "https://aistudio.google.com/*"}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {type: 'THEME_CHANGED'});
            });
        });
    }

    async updateSettings(updates) {
        const settings = await this.getSettings();
        const newSettings = { ...settings, ...updates };
        await chrome.storage.sync.set({ settings: newSettings });
        return newSettings;
    }

    setupListeners() {
        this.overlay.addEventListener('click', e => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay) {
                this.close();
            }
        });
    }
}

// Simple theme engine for popup
class PopupThemeEngine {
    async init() {
        await this.loadAndApplyTheme();

        // Listen for theme changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.settings) {
                const newTheme = changes.settings.newValue?.currentTheme;
                if (newTheme) {
                    this.loadAndApplyTheme();
                }
            }
        });
    }

    async loadAndApplyTheme() {
        try {
            const data = await chrome.storage.sync.get('settings');
            const settings = data.settings || {};
            const themeId = settings.currentTheme || 'monochrome';

            // Load theme from theme-config.json
            const response = await fetch(chrome.runtime.getURL('themes/theme-config.json'));
            const config = await response.json();
            const theme = config.themes[themeId] || config.themes.monochrome;

            if (theme && theme.base) {
                const { primary, background, surface, text } = theme.base;
                const radius = theme.radius || '8px';
                const borderWidth = theme.borderWidth || '1px';

                // Generate CSS from theme-config.json
                let css = config.css.popupStyles || '';

                // Replace placeholders
                css = css
                    .replace(/\$\{primary\}/g, primary)
                    .replace(/\$\{background\}/g, background)
                    .replace(/\$\{surface\}/g, surface)
                    .replace(/\$\{text\}/g, text)
                    .replace(/\$\{radius\}/g, radius)
                    .replace(/\$\{borderWidth\}/g, borderWidth);

                // Create style element
                let styleEl = document.getElementById('popup-theme-vars');
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'popup-theme-vars';
                    document.head.appendChild(styleEl);
                }

                styleEl.textContent = css;
            }
        } catch (e) {
            console.log('Theme load error:', e);
        }
    }
}

// Initialize popup theme
const popupThemeEngine = new PopupThemeEngine();
popupThemeEngine.init();

document.getElementById('theme-settings-btn')?.addEventListener('click', () => {
    const modal = new SettingsModal();
    modal.open();
});


(() => {
    const elements = {
        temperatureSlider: document.getElementById('temperature-slider'),
        temperatureInput: document.getElementById('temperature-value-input'),
        topPSlider: document.getElementById('top-p-slider'),
        topPInput: document.getElementById('top-p-value-input'),
        toolContainers: document.querySelectorAll('.tool'),
        systemInstructions: document.getElementById('system-instructions-textarea'),
        presetsList: document.getElementById('presets-list-container'),
        savePresetBtn: document.getElementById('save-preset-btn'),
        addNewPresetBtn: document.getElementById('add-new-preset-btn'),
        savePresetModal: document.getElementById('save-preset-modal'),
        savePresetModalSaveBtn: document.getElementById('save-preset-modal-save-btn'),
        savePresetModalCancelBtn: document.getElementById('save-preset-modal-cancel-btn'),
        presetNameModalInput: document.getElementById('preset-name-modal-input'),
        deleteConfirmModal: document.getElementById('delete-confirm-modal'),
        deleteConfirmBtn: document.getElementById('delete-confirm-modal-confirm-btn'),
        deleteCancelBtn: document.getElementById('delete-confirm-modal-cancel-btn'),
        noPresetsMsg: document.getElementById('no-presets-msg'),
        presetsSection: document.querySelector('.presets-section')
    };

    const state = new Proxy({
        currentSettings: null,
        deleteIndex: -1,
        processing: false,
        rafIds: new Set(),
        toolStates: {
            codeExecution: false,
            search: true,
            urlContext: false
        }
    }, {
        set(target, prop, value) {
            target[prop] = value;
            if (prop === 'processing') updateButtonState();
            if (prop === 'toolStates') updateToolVisuals();
            return true;
        }
    });

    const raf = (fn) => {
        const id = requestAnimationFrame(() => {
            state.rafIds.delete(id);
            fn();
        });
        state.rafIds.add(id);
        return id;
    };

    const deepEqual = (a, b) => {
        if (a === b) return true;
        if (typeof a !== 'object' || !a || typeof b !== 'object' || !b) return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(key => keysB.includes(key) && deepEqual(a[key], b[key]));
    };

    const getSettings = () => ({
        temperature: parseFloat(elements.temperatureSlider.value),
        topP: parseFloat(elements.topPSlider.value),
        tools: {
            codeExecution: state.toolStates.codeExecution,
            search: state.toolStates.search,
            urlContext: state.toolStates.urlContext
        },
        systemInstructions: elements.systemInstructions.value
    });

    const updateButtonState = () => {
        if (state.processing) return;
        chrome.storage.local.get('activePresetIndex', ({ activePresetIndex: index }) => {
            if (index === -1 || index === undefined) {
                elements.savePresetBtn.disabled = false;
                return;
            }
            elements.savePresetBtn.disabled = deepEqual(state.currentSettings, getSettings());
        });
    };

    const updateSliderTrack = (slider) => {
        const progress = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.setProperty('--slider-progress', `${progress}%`);
    };

    const syncSliderToInput = (slider, input) => {
        raf(() => {
            input.value = parseFloat(slider.value).toFixed(2);
        });
    };

    const syncInputToSlider = (input, slider) => {
        let value = parseFloat(input.value);
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        if (isNaN(value)) value = min;
        value = Math.max(min, Math.min(max, value));
        state.processing = true;
        raf(() => {
            slider.value = value;
            input.value = value.toFixed(2);
            updateSliderTrack(slider);
            state.processing = false;
            updateButtonState();
        });
    };

    const editPresetName = (span, index) => {
        const original = span.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = original;
        input.className = 'preset__name-input';
        span.replaceWith(input);
        input.focus();
        input.select();

        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== original) {
                chrome.storage.local.get('presets', ({ presets }) => {
                    if (presets?.[index]) {
                        presets[index].name = newName;
                        chrome.storage.local.set({ presets }, renderPresets);
                    }
                });
            } else {
                renderPresets();
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') save();
            else if (e.key === 'Escape') renderPresets();
        });
    };

    const movePreset = (fromIndex, direction) => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: currentIndex }) => {
            if (!presets?.[fromIndex]) return;
            
            const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
            if (toIndex < 0 || toIndex >= presets.length) return;

            const fromEl = document.querySelector(`[data-index="${fromIndex}"]`);
            const toEl = document.querySelector(`[data-index="${toIndex}"]`);
            if (fromEl && toEl) {
                fromEl.style.transform = 'translateX(4px)';
                fromEl.style.transition = 'transform .2s';
                toEl.style.transform = 'translateX(-4px)';
                toEl.style.transition = 'transform .2s';
                setTimeout(() => {
                    fromEl.style.transform = '';
                    toEl.style.transform = '';
                }, 200);
            }

            [presets[fromIndex], presets[toIndex]] = [presets[toIndex], presets[fromIndex]];
            
            let newIndex = currentIndex;
            if (currentIndex === fromIndex) {
                newIndex = toIndex;
            } else if (currentIndex === toIndex) {
                newIndex = fromIndex;
            }
            
            chrome.storage.local.set({ presets, activePresetIndex: newIndex }, renderPresets);
        });
    };

    const selectPreset = (index) => {
        chrome.storage.local.get('presets', ({ presets }) => {
            if (!presets?.[index]) return;
            chrome.storage.local.set({ activePresetIndex: index }, () => {
                applyPreset(presets[index]);
                renderPresets();
            });
        });
    };

    const renderPresets = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: index }) => {
            raf(() => {
                const exists = presets.length > 0;
                document.body.classList.toggle('no-presets', !exists);
                elements.presetsSection.style.display = exists ? 'flex' : 'none';
                elements.noPresetsMsg.style.display = exists ? 'none' : 'block';
                elements.addNewPresetBtn.style.display = exists ? 'block' : 'none';

                if (exists) {
                    elements.savePresetBtn.textContent = 'Save';
                    const fragment = document.createDocumentFragment();
                    presets.forEach((preset, i) => {
                        if (!preset?.name) return;
                        const li = document.createElement('li');
                        li.className = `preset ${i === index ? 'selected' : ''}`;
                        li.dataset.index = i;

                        const reorder = presets.length > 1 ? `
                            <div class="preset__reorder">
                                <button class="preset__reorder-button preset__reorder-button--up" title="Move up" ${i === 0 ? 'disabled' : ''}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="18 15 12 9 6 15"/>
                                    </svg>
                                </button>
                                <button class="preset__reorder-button preset__reorder-button--down" title="Move down" ${i === presets.length - 1 ? 'disabled' : ''}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                </button>
                            </div>
                        ` : '';

                        li.innerHTML = `
                            ${reorder}
                            <span class="preset__name">${preset.name}</span>
                            <div class="preset__actions">
                                <button class="preset__action-button preset__action-button--delete" title="Delete">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        <line x1="10" y1="11" x2="10" y2="17"/>
                                        <line x1="14" y1="11" x2="14" y2="17"/>
                                    </svg>
                                </button>
                            </div>
                        `;
                        fragment.appendChild(li);
                    });
                    elements.presetsList.innerHTML = '';
                    elements.presetsList.appendChild(fragment);
                } else {
                    elements.savePresetBtn.textContent = 'Save as Preset';
                    elements.presetsList.innerHTML = '';
                }
                updateButtonState();
            });
        });
    };

    const toolMap = {
        'code-execution-toggle': 'codeExecution',
        'search-toggle': 'search',
        'url-context-toggle': 'urlContext'
    };

    const updateToolVisuals = () => {
        raf(() => {
            elements.toolContainers.forEach(container => {
                const key = toolMap[container.dataset.tool];
                container.classList.toggle('active', state.toolStates[key]);
            });
        });
    };

    const applyPreset = (preset) => {
        state.processing = true;
        raf(() => {
            elements.temperatureSlider.value = preset.temperature;
            elements.topPSlider.value = preset.topP;
            elements.temperatureInput.value = preset.temperature.toFixed(2);
            elements.topPInput.value = preset.topP.toFixed(2);
            updateSliderTrack(elements.temperatureSlider);
            updateSliderTrack(elements.topPSlider);
            state.toolStates = { ...preset.tools };
            elements.systemInstructions.value = preset.systemInstructions || '';
            updateToolVisuals();
            state.processing = false;
        });
        const { name, ...settings } = preset;
        state.currentSettings = settings;
        updateButtonState();
    };

    const resetToDefaults = () => {
        const defaults = {
            temperature: 1,
            topP: 0.95,
            tools: {
                codeExecution: false,
                search: true,
                urlContext: false
            },
            systemInstructions: ''
        };
        applyPreset(defaults);
        state.currentSettings = defaults;
        state.toolStates = { ...defaults.tools };
        chrome.storage.local.set({ activePresetIndex: -1 }, renderPresets);
    };

    const closeModal = (modal) => () => modal.style.display = 'none';
    const closeSaveModal = closeModal(elements.savePresetModal);
    const closeDeleteModal = closeModal(elements.deleteConfirmModal);

    elements.temperatureInput.addEventListener('change', () => syncInputToSlider(elements.temperatureInput, elements.temperatureSlider));
    elements.topPInput.addEventListener('change', () => syncInputToSlider(elements.topPInput, elements.topPSlider));

    elements.temperatureSlider.addEventListener('input', () => {
        syncSliderToInput(elements.temperatureSlider, elements.temperatureInput);
        updateSliderTrack(elements.temperatureSlider);
    });

    elements.topPSlider.addEventListener('input', () => {
        syncSliderToInput(elements.topPSlider, elements.topPInput);
        updateSliderTrack(elements.topPSlider);
    });

    [elements.temperatureSlider, elements.topPSlider, elements.systemInstructions, elements.temperatureInput, elements.topPInput].forEach(element => {
        const eventType = element.type === 'range' || element.type === 'textarea' ? 'input' : 'change';
        element.addEventListener(eventType, updateButtonState);
    });

    elements.toolContainers.forEach(container => {
        container.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (e.target.tagName !== 'INPUT') {
                const key = toolMap[container.dataset.tool];
                state.toolStates = { ...state.toolStates, [key]: !state.toolStates[key] };
                updateButtonState();
            }
        });
    });

    let clickTimeout = null;
    elements.presetsList.addEventListener('click', e => {
        const li = e.target.closest('.preset');
        if (!li || li.querySelector('.preset__name-input')) return;
        const index = parseInt(li.dataset.index, 10);
        if (isNaN(index)) return;

        if (e.target.closest('.preset__action-button--delete')) {
            e.stopPropagation();
            state.deleteIndex = index;
            elements.deleteConfirmModal.style.display = 'flex';
        } else if (e.target.closest('.preset__reorder-button--up')) {
            e.preventDefault();
            e.stopPropagation();
            movePreset(index, 'up');
        } else if (e.target.closest('.preset__reorder-button--down')) {
            e.preventDefault();
            e.stopPropagation();
            movePreset(index, 'down');
        } else {
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
            }
            clickTimeout = setTimeout(() => {
                selectPreset(index);
                clickTimeout = null;
            }, 50);
        }
    });

    elements.presetsList.addEventListener('dblclick', e => {
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
        }
        const span = e.target.closest('.preset__name');
        const li = e.target.closest('.preset');
        if (span && li?.dataset.index) {
            editPresetName(span, parseInt(li.dataset.index, 10));
        }
    });

    elements.deleteConfirmBtn.addEventListener('click', () => {
        if (state.deleteIndex === -1) return;
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets, activePresetIndex: index }) => {
            presets.splice(state.deleteIndex, 1);
            const newIndex = index === state.deleteIndex ? -1 : (index > state.deleteIndex ? index - 1 : index);
            chrome.storage.local.set({ presets, activePresetIndex: newIndex }, () => {
                if (newIndex === -1) resetToDefaults();
                else selectPreset(newIndex);
                renderPresets();
                closeDeleteModal();
                state.deleteIndex = -1;
            });
        });
    });

    elements.savePresetModalCancelBtn.addEventListener('click', closeSaveModal);
    elements.savePresetModal.addEventListener('click', e => e.target === elements.savePresetModal && closeSaveModal());
    elements.deleteCancelBtn.addEventListener('click', closeDeleteModal);
    elements.deleteConfirmModal.addEventListener('click', e => e.target === elements.deleteConfirmModal && closeDeleteModal());

    elements.addNewPresetBtn.addEventListener('click', () => {
        elements.presetNameModalInput.value = '';
        elements.savePresetModal.style.display = 'flex';
        elements.presetNameModalInput.focus();
    });

    elements.savePresetBtn.addEventListener('click', () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: index }) => {
            if (presets.length > 0 && index !== -1) {
                if (elements.savePresetBtn.disabled) return;
                const settings = getSettings();
                presets[index] = { ...settings, name: presets[index].name };
                chrome.storage.local.set({ presets }, () => {
                    state.currentSettings = settings;
                    const original = elements.savePresetBtn.textContent;
                    elements.savePresetBtn.textContent = 'Saved!';
                    updateButtonState();
                    setTimeout(() => {
                        elements.savePresetBtn.textContent = original;
                    }, 1500);
                });
            } else {
                elements.presetNameModalInput.value = '';
                elements.savePresetModal.style.display = 'flex';
                elements.presetNameModalInput.focus();
            }
        });
    });

    const saveNewPreset = () => {
        const name = elements.presetNameModalInput.value.trim();
        if (!name) return;
        const preset = { name, ...getSettings() };
        chrome.storage.local.get('presets', ({ presets = [] }) => {
            presets.push(preset);
            chrome.storage.local.set({ presets, activePresetIndex: presets.length - 1 }, () => {
                applyPreset(preset);
                renderPresets();
                closeSaveModal();
            });
        });
    };

    elements.savePresetModalSaveBtn.addEventListener('click', saveNewPreset);
    elements.presetNameModalInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveNewPreset();
        } else if (e.key === 'Escape') {
            closeSaveModal();
        }
    });

    chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: index }) => {
        raf(() => {
            if (presets.length > 0 && index >= 0 && index < presets.length) {
                applyPreset(presets[index]);
            } else {
                resetToDefaults();
            }
            renderPresets();
        });
    });

    window.addEventListener('beforeunload', () => {
        state.rafIds.forEach(cancelAnimationFrame);
        state.rafIds.clear();
    }, { once: true, passive: true });
})();