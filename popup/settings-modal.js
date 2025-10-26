import { storageSync } from "../shared/storage.js";
import { getSyncDefaults } from "../shared/defaults.js";
import { loadThemeConfig } from "../shared/theme-loader.js";

const parsePx = (value, fallback = 0) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  const numeric = Number.parseFloat(value.replace(/px$/i, ""));
  return Number.isFinite(numeric) ? numeric : fallback;
};

const formatPx = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  const display =
    Math.round(numeric * 10) % 10 === 0 ? String(Math.trunc(numeric)) : numeric.toFixed(1);
  return `${display}px`;
};

const formatDisplayPx = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return `${Math.round(numeric * 10) % 10 === 0 ? Math.trunc(numeric) : numeric.toFixed(1)}px`;
};

const formatOpacity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "1.00";
  }
  return numeric.toFixed(2);
};

const updateSliderProgress = (slider, value) => {
  if (!(slider instanceof HTMLInputElement)) return;
  const min = Number.parseFloat(slider.min || "0");
  const max = Number.parseFloat(slider.max || "100");
  const currentValue = value !== undefined ? value : Number.parseFloat(slider.value || String(min));
  const clamped = Number.isFinite(currentValue)
    ? Math.min(Math.max(currentValue, min), max)
    : min;
  const range = max - min;
  const percent = range <= 0 ? 0 : ((clamped - min) / range) * 100;

  // Only update if the value actually changed to prevent infinite loops
  if (slider.value !== String(clamped)) {
    slider.value = String(clamped);
  }
  slider.style.setProperty("--slider-progress", `${percent}%`);
};

// Simple function executor - no debouncing needed since we're handling immediately
const executeOnce = (func) => {
  return function(...args) {
    func(...args);
  };
};

// Batch storage updates to prevent excessive operations
const scheduleStorageUpdate = (modalInstance) => (partialOverrides) => {
  // Clear any pending update
  if (modalInstance.storageUpdateTimeout) {
    clearTimeout(modalInstance.storageUpdateTimeout);
  }

  // Merge with pending overrides
  Object.assign(modalInstance.pendingOverrides, partialOverrides);

  // Schedule update after a brief delay to batch rapid changes
  modalInstance.storageUpdateTimeout = setTimeout(() => {
    const overridesToSave = { ...modalInstance.pendingOverrides };
    modalInstance.pendingOverrides = {};
    modalInstance.storageUpdateTimeout = null;
    void modalInstance.applyOverrideChanges(overridesToSave, false);
  }, 100); // Small delay to batch rapid slider movements
};

const TEMPLATE = `
  <div class="theme-modal" role="document">
    <div class="modal-header">
      <h3 class="modal-title">Settings</h3>
      <button class="modal-close-btn" aria-label="Close settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="modal-nav">
      <button class="nav-tab active" data-tab="themes" type="button">Themes</button>
      <button class="nav-tab" data-tab="elements" type="button">Elements</button>
      <button class="nav-tab" data-tab="optimization" type="button">Optimization</button>
      <button class="nav-tab" data-tab="general" type="button">General</button>
    </div>
    <div class="modal-content">
      <div class="tab-content active" data-tab-content="themes">
        <section class="themes-section">
          <h3 class="section-title">Themes</h3>
          <div class="preset-grid" data-role="themes-grid"></div>
        </section>
      </div>
      <div class="tab-content" data-tab-content="elements">
        <section class="settings-section">
          <h3 class="section-title">Element Customization</h3>
          <div class="settings-group">
            <div class="setting-item">
              <div class="setting-row">
                <div class="setting-info">
                  <label class="setting-label">History Button Animation</label>
                  <p class="setting-description">Enable or disable history button spin animations</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" data-role="history-animation-toggle" checked />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-row" style="cursor: pointer;" data-role="text-input-header">
                <div class="setting-info">
                  <label class="setting-label">Text Input Styling</label>
                  <p class="setting-description">Customize the main text input appearance</p>
                </div>
                <svg class="setting-chevron expanded" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s ease;">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              <div class="text-input-section" style="display: flex;">
                <div class="preview-container">
                  <div class="preview-inner">
                    <div class="preview-add">
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 96 960 960" width="24" fill="currentColor">
                        <path d="M480 856q-17 0-28.5-11.5T440 816v-240H200q-17 0-28.5-11.5T160 536q0-17 11.5-28.5T200 496h240V256q0-17 11.5-28.5T480 216q17 0 28.5 11.5T520 256v240h240q17 0 28.5 11.5T800 536q0 17-11.5 28.5T760 576H520v240q0 17-11.5 28.5T480 856Z"/>
                      </svg>
                    </div>
                    <div class="preview-text-wrap">
                      <div class="preview-text">Type something...</div>
                    </div>
                    <div class="preview-run">
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
                        <path d="M440-160v-487L216-423l-56-57 320-320 320 320-56 57-224-224v487h-80Z"/>
                      </svg>
                    </div>
                  </div>
                </div>
                <div class="controls-grid">
                  <div class="ctrl">
                    <label>Background</label>
                    <div class="color-row">
                      <input type="color" data-role="text-input-bg-color" value="#0B0F1A" />
                      <input type="text" class="hex-input" data-role="text-input-bg-color-hex" value="#0B0F1A" maxlength="7" />
                    </div>
                  </div>
                  <div class="ctrl">
                    <label>Text</label>
                    <div class="color-row">
                      <input type="color" data-role="text-input-text-color" value="#E8F0FC" />
                      <input type="text" class="hex-input" data-role="text-input-text-color-hex" value="#E8F0FC" maxlength="7" />
                    </div>
                  </div>
                  <div class="ctrl ctrl-full">
                    <label>Radius</label>
                    <div class="ctrl-row">
                      <input type="range" min="0" max="30" step="1" value="30" data-role="text-input-radius" />
                      <span data-role="text-input-radius-value">30px</span>
                    </div>
                  </div>
                  <div class="ctrl ctrl-full">
                    <div class="border-checklist">
                      <div class="border-checklist__header">
                        <div class="border-checklist__left">
                          <input type="color" class="border-checklist__color" data-role="text-input-border-color" value="#4A9FF5" />
                          <span class="border-checklist__name">Border</span>
                        </div>
                        <label class="toggle-switch" data-role="text-input-border-toggle">
                          <input type="checkbox" />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div class="ctrl ctrl-full border-sliders" data-role="border-sliders" style="display: none;">
                    <div class="slider-pair">
                      <div class="slider-pair__item">
                        <label>Stroke</label>
                        <div class="ctrl-row">
                          <input type="range" min="0" max="5" step="0.5" value="1" data-role="text-input-border-width" />
                          <span data-role="text-input-border-width-value">1px</span>
                        </div>
                      </div>
                      <div class="slider-pair__item">
                        <label>Opacity</label>
                        <div class="ctrl-row">
                          <input type="range" min="0" max="1" step="0.01" value="1" data-role="text-input-border-opacity" />
                          <span data-role="text-input-border-opacity-value">100%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="ctrl ctrl-full">
                    <div class="border-checklist">
                      <div class="border-checklist__header">
                        <div class="border-checklist__left">
                          <input type="color" class="border-checklist__color" data-role="text-input-glow-color" value="#4A9FF5" />
                          <span class="border-checklist__name">Glow</span>
                        </div>
                        <label class="toggle-switch" data-role="text-input-glow-toggle">
                          <input type="checkbox" />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div class="ctrl ctrl-full glow-sliders" data-role="glow-sliders" style="display: none;">
                    <div class="slider-pair">
                      <div class="slider-pair__item">
                        <label>Intensity</label>
                        <div class="ctrl-row">
                          <input type="range" min="0" max="50" step="1" value="20" data-role="text-input-glow-intensity" />
                          <span data-role="text-input-glow-intensity-value">20px</span>
                        </div>
                      </div>
                      <div class="slider-pair__item">
                        <label>Opacity</label>
                        <div class="ctrl-row">
                          <input type="range" min="0" max="1" step="0.01" value="1" data-role="text-input-glow-opacity" />
                          <span data-role="text-input-glow-opacity-value">100%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="ctrl ctrl-full">
                    <div class="advanced-section">
                      <div class="advanced-header" data-role="advanced-header">
                        <span class="advanced-label">Advanced</span>
                        <svg class="advanced-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </div>
                      <div class="advanced-content" data-role="advanced-content" style="display: none;">
                        <div class="advanced-controls">
                          <div class="advanced-ctrl">
                            <label>Max Width</label>
                            <div class="ctrl-row">
                              <input type="range" min="400" max="1500" step="10" value="1000" data-role="text-input-max-width" />
                              <span data-role="text-input-max-width-value">1000px</span>
                            </div>
                          </div>
                          <div class="advanced-ctrl">
                            <label>Bottom Position</label>
                            <div class="ctrl-row">
                              <input type="range" min="0" max="200" step="1" value="0" data-role="text-input-bottom-position" />
                              <span data-role="text-input-bottom-position-value">0px</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="ctrl ctrl-full">
                    <button class="reset-btn" data-role="reset-text-input" type="button">Reset</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="tab-content" data-tab-content="optimization">
        <section class="settings-section">
          <h3 class="section-title">Performance & Optimization</h3>
          <div class="settings-group">
            <p class="setting-description" style="text-align: center; padding: 40px 20px; opacity: 0.6;">No optimization settings available</p>
          </div>
        </section>
      </div>
      <div class="tab-content" data-tab-content="general">
        <section class="settings-section">
          <h3 class="section-title">General Settings</h3>
          <div class="settings-group">
            <div class="setting-item">
              <label class="setting-label">Extension Version</label>
              <p class="setting-description" data-role="version-display">Loading...</p>
            </div>
          </div>
        </section>
        <section class="settings-section danger-zone">
          <h3 class="section-title danger-zone__title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Danger Zone
          </h3>
          <div class="settings-group">
            <div class="setting-item danger-zone__item">
              <div class="setting-row">
                <div class="setting-info">
                  <label class="setting-label">Disable All Functionality</label>
                  <p class="setting-description">Temporarily disable all extension features without uninstalling</p>
                </div>
                <label class="toggle-switch danger">
                  <input type="checkbox" data-role="disable-toggle" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-item danger-zone__item">
              <div class="setting-row">
                <div class="setting-info">
                  <label class="setting-label">Reset All Settings</label>
                  <p class="setting-description">Clear all data and restore extension to factory defaults</p>
                </div>
                <button class="danger-btn" data-role="reset-all" type="button">Reset All Data</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
    <div class="theme-customizer" data-role="customizer-tab">
      <div class="theme-customizer__header">
        <span class="theme-customizer__title">
          Border styling
          <span class="theme-tag theme-tag--beta">BETA</span>
        </span>
        <button
          class="theme-customizer__reset-btn"
          type="button"
          data-role="customizer-reset"
          aria-label="Reset border overrides to theme defaults"
        >
          Reset
        </button>
      </div>
      <div class="theme-customizer__body">
        <div class="theme-customizer__field">
          <label class="theme-customizer__label" for="theme-border-radius-input">
            Corner radius
          </label>
          <div class="theme-customizer__control">
            <input
              id="theme-border-radius-input"
              type="range"
              min="0"
              max="50"
              step="1"
              data-role="radius-slider"
              aria-label="Corner radius in pixels"
            />
            <span class="theme-customizer__value" data-role="radius-value">0px</span>
          </div>
        </div>
        <div class="theme-customizer__field">
          <label class="theme-customizer__label" for="theme-border-width-input">
            Border width
          </label>
          <div class="theme-customizer__control">
            <input
              id="theme-border-width-input"
              type="range"
              min="0"
              max="5"
              step="0.5"
              data-role="border-slider"
              aria-label="Border width in pixels"
            />
            <span class="theme-customizer__value" data-role="border-value">0px</span>
          </div>
        </div>
        <div class="theme-customizer__field">
          <label class="theme-customizer__label" for="theme-outline-opacity-input">
            Outline opacity
          </label>
          <div class="theme-customizer__control">
            <input
              id="theme-outline-opacity-input"
              type="range"
              min="0"
              max="1"
              step="0.01"
              data-role="opacity-slider"
              aria-label="Outline opacity"
            />
            <span class="theme-customizer__value" data-role="opacity-value">1.00</span>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

export class SettingsModal {
  constructor(rootDocument = document) {
    this.document = rootDocument;
    this.overlay = null;
    this.cleanup = null;
    this.themes = {};
    this.settings = null;
    this.defaultSettings = null;
    this.currentThemeId = null;
    this.currentThemeDefaults = { radius: "", borderWidth: "" };
    this.customizerInitialized = false;
    this.sliderEventListeners = [];
    this.pendingOverrides = {};
    this.storageUpdateTimeout = null;
    this.scheduleStorageUpdate = scheduleStorageUpdate(this);
    this.currentTab = 'themes';
  }

  async open() {
    if (this.overlay) return;
    this.overlay = this.createOverlay();
    this.document.body.appendChild(this.overlay);
    this.initTabNavigation();
    await this.renderThemes();
    this.initGeneralTab();
    this.initElementsTab();
    this.initOptimizationTab();
    const closeButton = this.overlay.querySelector(".modal-close-btn");
    closeButton?.focus();
  }

  close = () => {
    if (!this.overlay) return;

    // Clean up slider event listeners
    this.sliderEventListeners.forEach(removeListener => removeListener());
    this.sliderEventListeners = [];

    // Clean up storage update timeout
    if (this.storageUpdateTimeout) {
      clearTimeout(this.storageUpdateTimeout);
      this.storageUpdateTimeout = null;
    }

    this.overlay.remove();
    this.overlay = null;
    this.customizerInitialized = false;
    this.themes = {};
    this.settings = null;
    this.currentThemeId = null;
    this.cleanup?.();
    this.cleanup = null;
  };

  createOverlay() {
    const overlay = this.document.createElement("div");
    overlay.className = "theme-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = TEMPLATE;

    const closeButton = overlay.querySelector(".modal-close-btn");
    closeButton?.addEventListener("click", this.close, { once: true });

    const handleOutsideClick = (event) => {
      if (event.target === overlay) {
        this.close();
      }
    };

    overlay.addEventListener("click", handleOutsideClick);
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        this.close();
      }
    };
    this.document.addEventListener("keydown", handleEscape);

    this.cleanup = () => {
      overlay.removeEventListener("click", handleOutsideClick);
      this.document.removeEventListener("keydown", handleEscape);
    };

    return overlay;
  }

  async renderThemes() {
    if (!this.overlay) return;

    const [themeConfig, storedSettings, defaults] = await Promise.all([
      loadThemeConfig(),
      storageSync.get("settings", null),
      getSyncDefaults(),
    ]);

    const themes = themeConfig.themes ?? {};
    const settings = storedSettings ?? defaults;

    this.defaultSettings = defaults;
    this.settings = settings;
    this.themes = themes;
    const currentTheme = settings.currentTheme;
    this.currentThemeId = currentTheme;

    // Get pinned themes from preferences, default to the three initial themes
    if (!this.settings.preferences) {
      this.settings.preferences = {};
    }
    if (!this.settings.preferences.pinnedThemes) {
      this.settings.preferences.pinnedThemes = ["monochrome", "matrix", "midnight"];
    }
    this.pinnedThemes = this.settings.preferences.pinnedThemes;
    console.log('Loaded pinned themes:', this.pinnedThemes);

    const grid = this.overlay.querySelector('[data-role="themes-grid"]');
    if (!grid) return;

    grid.replaceChildren();

    // Define default theme order
    const defaultOrder = [
      "monochrome",
      "matrix",
      "midnight",
      "royal",
      "neon",
      "ocean",
      "forest",
      "sunset",
      "coral",
      "arctic",
      "crimson",
      "ivory"
    ];

    // Sort themes: pinned first (in pinned order), then by default order
    const sortedThemeEntries = Object.entries(themes).sort(([idA], [idB]) => {
      const isPinnedA = this.pinnedThemes.includes(idA);
      const isPinnedB = this.pinnedThemes.includes(idB);
      
      // Pinned themes go first
      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;
      
      // If both pinned, sort by pinned order
      if (isPinnedA && isPinnedB) {
        return this.pinnedThemes.indexOf(idA) - this.pinnedThemes.indexOf(idB);
      }
      
      // If neither pinned, sort by default order
      const indexA = defaultOrder.indexOf(idA);
      const indexB = defaultOrder.indexOf(idB);
      
      // If both in default order, use that order
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // If only A is in default order, A comes first
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // If neither in default order, maintain original order (by id)
      return idA.localeCompare(idB);
    });

    for (const [themeId, theme] of sortedThemeEntries) {
      const card = this.createThemeCard(themeId, theme, currentTheme);
      grid.appendChild(card);
    }

    this.initializeCustomizer();
    this.applyCustomizerValues(this.themes[currentTheme]);
  }

  createThemeCard(themeId, theme, currentThemeId) {
    const card = this.document.createElement("div");
    card.className = `theme-card${currentThemeId === themeId ? " active" : ""}`;
    card.dataset.themeId = themeId;

    const colors = theme.base
      ? [
          theme.base.primary,
          theme.base.background,
          theme.base.surface,
          theme.base.text,
        ]
      : ["#666666", "#333333", "#222222", "#ffffff"];

    const isPinned = this.pinnedThemes.includes(themeId);
    console.log(`Creating card for ${themeId}, isPinned: ${isPinned}`);

    card.innerHTML = `
      <button 
        class="theme-pin-btn" 
        type="button"
        data-theme-id="${themeId}"
        aria-label="${isPinned ? 'Unpin' : 'Pin'} ${theme.name ?? themeId}"
        title="${isPinned ? 'Unpin theme' : 'Pin theme to top'}"
      >
        <svg class="pin-icon ${isPinned ? 'pinned' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11.2V22H12.8V16H18V14L16 12Z" fill="currentColor"/>
        </svg>
      </button>
      <button 
        class="theme-card-content" 
        type="button"
        aria-pressed="${currentThemeId === themeId ? "true" : "false"}"
      >
        <div class="theme-card-header">
          <span class="theme-name">${theme.name ?? themeId}</span>
        </div>
        <div class="theme-preview">
          <div class="preview-swatches">
            ${colors.map((color) => `<span class="swatch" style="background-color: ${color};"></span>`).join("")}
          </div>
        </div>
      </button>
    `;

    const contentBtn = card.querySelector('.theme-card-content');
    contentBtn.addEventListener("click", () => this.selectTheme(themeId));

    const pinBtn = card.querySelector('.theme-pin-btn');
    if (pinBtn) {
      const handlePinClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('Pin button clicked for:', themeId);
        this.togglePinTheme(themeId);
      };
      pinBtn.addEventListener("click", handlePinClick);
    } else {
      console.error('Pin button not found for theme:', themeId);
    }

    return card;
  }

  togglePinTheme = async (themeId) => {
    console.log('Toggle pin for:', themeId);
    console.log('Current pinned themes:', this.pinnedThemes);
    
    const isPinned = this.pinnedThemes.includes(themeId);
    console.log('Is pinned:', isPinned);

    if (isPinned) {
      // Unpin the theme
      this.pinnedThemes = this.pinnedThemes.filter(id => id !== themeId);
      console.log('Unpinned, new list:', this.pinnedThemes);
    } else {
      // Pin the theme (add to end of pinned list)
      this.pinnedThemes.push(themeId);
      console.log('Pinned, new list:', this.pinnedThemes);
    }

    // Save to storage using merge to avoid conflicts
    const defaults = await getSyncDefaults();
    await storageSync.merge(
      "settings",
      async (settings) => {
        const current = settings ?? defaults;
        return {
          ...current,
          preferences: {
            ...current.preferences,
            pinnedThemes: this.pinnedThemes,
          },
          lastUpdatedAt: Date.now(),
        };
      },
      defaults,
    );
    console.log('Saved to storage');

    // Re-render themes to update the order and pin button states
    await this.renderThemes();
    console.log('Re-rendered themes');
  };

  initializeCustomizer() {
    if (!this.overlay || this.customizerInitialized) return;

    const radiusSlider = this.overlay.querySelector('[data-role="radius-slider"]');
    const borderSlider = this.overlay.querySelector('[data-role="border-slider"]');
    const opacitySlider = this.overlay.querySelector('[data-role="opacity-slider"]');
    const resetButton = this.overlay.querySelector('[data-role="customizer-reset"]');

    if (radiusSlider) {
      radiusSlider.addEventListener("input", this.handleRadiusChange);
      this.sliderEventListeners.push(() => radiusSlider.removeEventListener("input", this.handleRadiusChange));
    }
    if (borderSlider) {
      borderSlider.addEventListener("input", this.handleBorderWidthChange);
      this.sliderEventListeners.push(() => borderSlider.removeEventListener("input", this.handleBorderWidthChange));
    }
    if (opacitySlider) {
      opacitySlider.addEventListener("input", this.handleOpacityChange);
      this.sliderEventListeners.push(() => opacitySlider.removeEventListener("input", this.handleOpacityChange));
    }
    if (resetButton) {
      resetButton.addEventListener("click", this.handleResetOverrides);
      this.sliderEventListeners.push(() => resetButton.removeEventListener("click", this.handleResetOverrides));
    }

    updateSliderProgress(radiusSlider, radiusSlider?.value);
    updateSliderProgress(borderSlider, borderSlider?.value);
    updateSliderProgress(opacitySlider, opacitySlider?.value);

    this.customizerInitialized = true;
  }

  applyCustomizerValues(theme) {
    if (!this.overlay) return;

    const overrides = this.settings?.themeOverrides ?? {};
    const fallbackRadius = theme?.radius ?? this.defaultSettings?.themeOverrides?.radius ?? "6px";
    const fallbackBorderWidth =
      theme?.borderWidth ?? this.defaultSettings?.themeOverrides?.borderWidth ?? "1px";
    const fallbackOpacity = theme?.outlineOpacity ?? this.defaultSettings?.themeOverrides?.outlineOpacity ?? "1";

    const radiusValue = overrides.radius ?? fallbackRadius;
    const borderWidthValue = overrides.borderWidth ?? fallbackBorderWidth;
    const opacityValue = overrides.outlineOpacity ?? fallbackOpacity;

    this.currentThemeDefaults = {
      radius: fallbackRadius,
      borderWidth: fallbackBorderWidth,
      outlineOpacity: fallbackOpacity,
    };

    this.setCustomizerControl("radius", radiusValue);
    this.setCustomizerControl("border", borderWidthValue);
    this.setCustomizerControl("opacity", opacityValue);
    this.refreshResetButton();
  }

  setCustomizerControl(type, value) {
    if (!this.overlay) return;
    const isRadius = type === "radius";
    const isBorder = type === "border";
    const isOpacity = type === "opacity";
    
    let sliderRole, valueRole;
    if (isRadius) {
      sliderRole = "radius-slider";
      valueRole = "radius-value";
    } else if (isBorder) {
      sliderRole = "border-slider";
      valueRole = "border-value";
    } else if (isOpacity) {
      sliderRole = "opacity-slider";
      valueRole = "opacity-value";
    } else {
      return;
    }
    
    const slider = this.overlay.querySelector(`[data-role="${sliderRole}"]`);
    const valueElement = this.overlay.querySelector(`[data-role="${valueRole}"]`);
    if (!slider || !valueElement) return;

    if (isOpacity) {
      const numeric = Number.parseFloat(value);
      const clamped = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 1) : 1;
      slider.value = String(clamped);
      updateSliderProgress(slider, clamped);
      valueElement.textContent = formatOpacity(clamped);
    } else {
      const numeric = parsePx(value, isRadius ? 0 : 1);
      slider.value = String(numeric);
      updateSliderProgress(slider, numeric);
      valueElement.textContent = formatDisplayPx(numeric);
    }
  }

  refreshResetButton() {
    if (!this.overlay) return;
    const resetButton = this.overlay.querySelector('[data-role="customizer-reset"]');
    if (!resetButton) return;
    const hasOverrides =
      this.settings?.themeOverrides && Object.keys(this.settings.themeOverrides).length > 0;
    resetButton.disabled = !hasOverrides;
  }

  async selectTheme(themeId) {
    const defaults = await getSyncDefaults();
    const updated = await storageSync.merge(
      "settings",
      async (settings) => {
        const current = settings ?? defaults;
        return { ...current, currentTheme: themeId, lastUpdatedAt: Date.now() };
      },
      defaults,
    );

    if (!this.overlay) return;
    this.overlay.querySelectorAll(".theme-card").forEach((card) => {
      const pressed = card.dataset.themeId === themeId;
      card.classList.toggle("active", pressed);
      card.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
    this.settings = updated;
    this.currentThemeId = themeId;
    this.applyCustomizerValues(this.themes?.[themeId]);
    
    // Refresh text input controls if on Elements tab to load per-theme settings
    if (this.currentTab === 'elements' && this.refreshTextInputControls) {
      this.refreshTextInputControls();
    }
  }

  handleRadiusChange = (event) => {
    try {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement)) return;
      const numericValue = input.valueAsNumber ?? Number.parseFloat(input.value);
      if (!Number.isFinite(numericValue)) return;
      const formatted = formatPx(numericValue);
      updateSliderProgress(input, numericValue);
      const valueElement = this.overlay?.querySelector('[data-role="radius-value"]');
      if (valueElement) {
        valueElement.textContent = formatDisplayPx(numericValue);
      }
    // Apply visual changes immediately and batch storage updates
    this.applyThemeOverridesImmediately({ radius: formatted });
    this.scheduleStorageUpdate({ radius: formatted });
    } catch (error) {
      console.error('Error in handleRadiusChange:', error);
    }
  };

  handleBorderWidthChange = (event) => {
    try {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement)) return;
      const numericValue = input.valueAsNumber ?? Number.parseFloat(input.value);
      if (!Number.isFinite(numericValue)) return;
      const formatted = formatPx(numericValue);
      updateSliderProgress(input, numericValue);
      const valueElement = this.overlay?.querySelector('[data-role="border-value"]');
      if (valueElement) {
        valueElement.textContent = formatDisplayPx(numericValue);
      }
    // Apply visual changes immediately and batch storage updates
    this.applyThemeOverridesImmediately({ borderWidth: formatted });
    this.scheduleStorageUpdate({ borderWidth: formatted });
    } catch (error) {
      console.error('Error in handleBorderWidthChange:', error);
    }
  };

  handleOpacityChange = (event) => {
    try {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement)) return;
      const numericValue = input.valueAsNumber ?? Number.parseFloat(input.value);
      if (!Number.isFinite(numericValue)) return;
      const formatted = String(numericValue);
      updateSliderProgress(input, numericValue);
      const valueElement = this.overlay?.querySelector('[data-role="opacity-value"]');
      if (valueElement) {
        valueElement.textContent = formatOpacity(numericValue);
      }
    // Apply visual changes immediately and batch storage updates
    this.applyThemeOverridesImmediately({ outlineOpacity: formatted });
    this.scheduleStorageUpdate({ outlineOpacity: formatted });
    } catch (error) {
      console.error('Error in handleOpacityChange:', error);
    }
  };

  handleResetOverrides = async () => {
    const defaults = this.currentThemeDefaults;
    const radiusSlider = this.overlay?.querySelector('[data-role="radius-slider"]');
    const borderSlider = this.overlay?.querySelector('[data-role="border-slider"]');
    const opacitySlider = this.overlay?.querySelector('[data-role="opacity-slider"]');

    if (radiusSlider instanceof HTMLInputElement) {
      const defaultRadius = parsePx(defaults.radius, 0);
      radiusSlider.value = String(defaultRadius);
      updateSliderProgress(radiusSlider, defaultRadius);
      const valueElement = this.overlay?.querySelector('[data-role="radius-value"]');
      if (valueElement) {
        valueElement.textContent = formatDisplayPx(defaultRadius);
      }
    }

    if (borderSlider instanceof HTMLInputElement) {
      const defaultBorder = parsePx(defaults.borderWidth, 1);
      borderSlider.value = String(defaultBorder);
      updateSliderProgress(borderSlider, defaultBorder);
      const valueElement = this.overlay?.querySelector('[data-role="border-value"]');
      if (valueElement) {
        valueElement.textContent = formatDisplayPx(defaultBorder);
      }
    }

    if (opacitySlider instanceof HTMLInputElement) {
      const defaultOpacity = Number.parseFloat(defaults.outlineOpacity ?? "1");
      opacitySlider.value = String(defaultOpacity);
      updateSliderProgress(opacitySlider, defaultOpacity);
      const valueElement = this.overlay?.querySelector('[data-role="opacity-value"]');
      if (valueElement) {
        valueElement.textContent = formatOpacity(defaultOpacity);
      }
    }

    await this.applyOverrideChanges({ radius: null, borderWidth: null, outlineOpacity: null }, true);
    // Clear any pending overrides since we're resetting
    this.pendingOverrides = {};
  };

  async applyOverrideChanges(partialOverrides, applyImmediately = true) {
    const defaults = this.defaultSettings ?? (await getSyncDefaults());

    const updated = await storageSync.merge(
      "settings",
      async (settings) => {
        const current = settings ?? defaults;
        const overrides = { ...(current.themeOverrides ?? {}) };
        let changed = false;

        for (const [key, value] of Object.entries(partialOverrides)) {
          if (value === null) {
            if (key in overrides) {
              delete overrides[key];
              changed = true;
            }
          } else if (overrides[key] !== value) {
            overrides[key] = value;
            changed = true;
          }
        }

        if (!changed) return current;

        const next = { ...current };
        if (Object.keys(overrides).length > 0) {
          next.themeOverrides = overrides;
        } else {
          delete next.themeOverrides;
        }
        next.lastUpdatedAt = Date.now();
        return next;
      },
      defaults,
    );

    this.settings = updated;
    this.refreshResetButton();

    // Apply changes immediately to UI without waiting for storage events
    if (applyImmediately) {
      this.applyThemeOverridesImmediately(partialOverrides);
    }
  }

  applyThemeOverridesImmediately(partialOverrides) {
    try {
      // Apply to document root immediately for instant visual feedback
      const root = this.document.documentElement;
      if (!root) return;

      // Use requestAnimationFrame to avoid layout thrashing during rapid updates
      requestAnimationFrame(() => {
        for (const [key, value] of Object.entries(partialOverrides)) {
          try {
            if (value === null) {
              // Remove override - revert to theme default
              if (key === 'radius') {
                root.style.setProperty('--bas-radius', this.currentThemeDefaults.radius || '6px');
              } else if (key === 'borderWidth') {
                root.style.setProperty('--bas-border-width', this.currentThemeDefaults.borderWidth || '1px');
              } else if (key === 'outlineOpacity') {
                root.style.setProperty('--bas-outline-opacity', this.currentThemeDefaults.outlineOpacity || '1');
              }
            } else {
              // Apply override
              if (key === 'radius') {
                root.style.setProperty('--bas-radius', value);
              } else if (key === 'borderWidth') {
                root.style.setProperty('--bas-border-width', value);
              } else if (key === 'outlineOpacity') {
                root.style.setProperty('--bas-outline-opacity', value);
              }
            }
          } catch (error) {
            console.error('Error applying theme override:', key, value, error);
          }
        }
        
        // Automatically adjust padding based on border radius and width
        this.adjustElementPadding();
      });
    } catch (error) {
      console.error('Error in applyThemeOverridesImmediately:', error);
    }
  }

  adjustElementPadding() {
    try {
      const root = this.document.documentElement;
      if (!root) return;

      // Get current values
      const radiusStr = getComputedStyle(root).getPropertyValue('--bas-radius').trim();
      const borderStr = getComputedStyle(root).getPropertyValue('--bas-border-width').trim();
      
      const radius = parsePx(radiusStr, 6);
      const border = parsePx(borderStr, 1);
      
      // Calculate optimal padding based on border radius and width
      // Formula: base padding + (radius * factor) + (border * factor)
      const basePadding = 8; // Base padding in px
      const radiusFactor = 0.15; // 15% of radius
      const borderFactor = 1.5; // 150% of border width
      
      const calculatedPadding = basePadding + (radius * radiusFactor) + (border * borderFactor);
      const finalPadding = Math.max(basePadding, Math.round(calculatedPadding * 10) / 10);
      
      // Apply calculated padding
      root.style.setProperty('--bas-padding', `${finalPadding}px`);
      root.style.setProperty('--bas-padding-sm', `${finalPadding * 0.5}px`);
      root.style.setProperty('--bas-padding-lg', `${finalPadding * 1.5}px`);
    } catch (error) {
      console.error('Error adjusting element padding:', error);
    }
  }

  initTabNavigation() {
    if (!this.overlay) return;

    const tabs = this.overlay.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });

    // Show/hide customizer based on active tab
    this.updateCustomizerVisibility();
  }

  switchTab(tabName) {
    if (!this.overlay) return;
    
    this.currentTab = tabName;

    // Update tab buttons
    const tabs = this.overlay.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
    });

    // Update tab content
    const contents = this.overlay.querySelectorAll('.tab-content');
    contents.forEach(content => {
      const isActive = content.dataset.tabContent === tabName;
      content.classList.toggle('active', isActive);
    });

    // Show/hide customizer based on active tab
    this.updateCustomizerVisibility();
  }

  updateCustomizerVisibility() {
    if (!this.overlay) return;
    
    const customizer = this.overlay.querySelector('[data-role="customizer-tab"]');
    if (customizer) {
      // Only show customizer on themes tab
      customizer.style.display = this.currentTab === 'themes' ? '' : 'none';
    }
  }

  async initElementsTab() {
    if (!this.overlay) return;

    // Load element settings and ensure theme data is available
    const [elementSettingsData, themeConfig, settingsData] = await Promise.all([
      chrome.storage.sync.get('elementSettings'),
      loadThemeConfig(),
      chrome.storage.sync.get('settings')
    ]);
    
    const elementSettings = elementSettingsData.elementSettings || {};
    const themes = themeConfig.themes || {};
    const settings = settingsData.settings || {};

    // History button animation toggle
    const animationToggle = this.overlay.querySelector('[data-role="history-animation-toggle"]');
    if (animationToggle) {
      animationToggle.checked = elementSettings.historyAnimation !== false;
      
      animationToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        const updatedSettings = { ...elementSettings, historyAnimation: enabled };
        await chrome.storage.sync.set({ elementSettings: updatedSettings });
        
        // Send message to content script to update animation
        chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
              type: 'UPDATE_HISTORY_ANIMATION', 
              enabled: enabled 
            }).catch(() => {});
          });
        });
        
        this.showNotification(
          enabled ? 'History button animation enabled' : 'History button animation disabled', 
          'success'
        );
      });
    }

    // Text Input Customization - per theme
    const currentThemeId = settings?.currentTheme || 'monochrome';
    const currentTheme = themes?.[currentThemeId];
    
    const textInputDefaults = {
      borderRadius: 30,
      showBorder: false,
      backgroundColor: currentTheme?.base?.background || '#18181B',
      textColor: currentTheme?.base?.text || '#FAFAFA',
      borderColor: currentTheme?.base?.primary || '#A1A1AA',
      borderWidth: 1,
      borderOpacity: 1,
      showGlow: false,
      glowColor: currentTheme?.base?.primary || '#4A9FF5',
      glowIntensity: 20,
      glowOpacity: 1,
      maxWidth: 1000,
      bottomPosition: 0
    };

    // Get per-theme settings
    if (!elementSettings.textInputByTheme) {
      elementSettings.textInputByTheme = {};
    }
    const textInputSettings = elementSettings.textInputByTheme[currentThemeId] || textInputDefaults;

    // Dropdown toggle
    const textInputHeader = this.overlay.querySelector('[data-role="text-input-header"]');
    const textInputSection = this.overlay.querySelector('.text-input-section');
    const chevron = textInputHeader?.querySelector('.setting-chevron');
    
    if (textInputHeader && textInputSection && chevron) {
      textInputHeader.addEventListener('click', () => {
        const isHidden = textInputSection.style.display === 'none';
        textInputSection.style.display = isHidden ? 'flex' : 'none';
        chevron.classList.toggle('expanded', isHidden);
      });
    }

    // Advanced dropdown toggle
    const advancedHeader = this.overlay.querySelector('[data-role="advanced-header"]');
    const advancedContent = this.overlay.querySelector('[data-role="advanced-content"]');
    const advancedChevron = advancedHeader?.querySelector('.advanced-chevron');
    
    if (advancedHeader && advancedContent && advancedChevron) {
      advancedHeader.addEventListener('click', () => {
        const isHidden = advancedContent.style.display === 'none';
        advancedContent.style.display = isHidden ? 'block' : 'none';
        advancedChevron.classList.toggle('expanded', isHidden);
      });
    }

    // Get all controls
    const radiusSlider = this.overlay.querySelector('[data-role="text-input-radius"]');
    const radiusValue = this.overlay.querySelector('[data-role="text-input-radius-value"]');
    const borderToggleLabel = this.overlay.querySelector('[data-role="text-input-border-toggle"]');
    const borderToggle = borderToggleLabel?.querySelector('input[type="checkbox"]');
    const borderSliders = this.overlay.querySelector('[data-role="border-sliders"]');
    const borderWidthSlider = this.overlay.querySelector('[data-role="text-input-border-width"]');
    const borderWidthValue = this.overlay.querySelector('[data-role="text-input-border-width-value"]');
    const borderOpacitySlider = this.overlay.querySelector('[data-role="text-input-border-opacity"]');
    const borderOpacityValue = this.overlay.querySelector('[data-role="text-input-border-opacity-value"]');
    const glowToggleLabel = this.overlay.querySelector('[data-role="text-input-glow-toggle"]');
    const glowToggle = glowToggleLabel?.querySelector('input[type="checkbox"]');
    const glowSliders = this.overlay.querySelector('[data-role="glow-sliders"]');
    const glowIntensitySlider = this.overlay.querySelector('[data-role="text-input-glow-intensity"]');
    const glowIntensityValue = this.overlay.querySelector('[data-role="text-input-glow-intensity-value"]');
    const glowOpacitySlider = this.overlay.querySelector('[data-role="text-input-glow-opacity"]');
    const glowOpacityValue = this.overlay.querySelector('[data-role="text-input-glow-opacity-value"]');
    const maxWidthSlider = this.overlay.querySelector('[data-role="text-input-max-width"]');
    const maxWidthValue = this.overlay.querySelector('[data-role="text-input-max-width-value"]');
    const bottomPositionSlider = this.overlay.querySelector('[data-role="text-input-bottom-position"]');
    const bottomPositionValue = this.overlay.querySelector('[data-role="text-input-bottom-position-value"]');
    const bgColorPicker = this.overlay.querySelector('[data-role="text-input-bg-color"]');
    const bgColorHex = this.overlay.querySelector('[data-role="text-input-bg-color-hex"]');
    const textColorPicker = this.overlay.querySelector('[data-role="text-input-text-color"]');
    const textColorHex = this.overlay.querySelector('[data-role="text-input-text-color-hex"]');
    const borderColorPicker = this.overlay.querySelector('[data-role="text-input-border-color"]');
    const glowColorPicker = this.overlay.querySelector('[data-role="text-input-glow-color"]');
    const resetBtn = this.overlay.querySelector('[data-role="reset-text-input"]');
    const previewContainer = this.overlay.querySelector('.preview-container');

    // Apply initial values
    if (radiusSlider && radiusValue) {
      radiusSlider.value = textInputSettings.borderRadius;
      radiusValue.textContent = `${textInputSettings.borderRadius}px`;
      updateSliderProgress(radiusSlider, textInputSettings.borderRadius);
    }
    if (borderToggle) {
      borderToggle.checked = textInputSettings.showBorder || false;
      if (borderSliders) {
        borderSliders.style.display = borderToggle.checked ? 'block' : 'none';
      }
    }
    if (borderWidthSlider && borderWidthValue) {
      borderWidthSlider.value = textInputSettings.borderWidth || textInputDefaults.borderWidth;
      borderWidthValue.textContent = `${textInputSettings.borderWidth || textInputDefaults.borderWidth}px`;
      updateSliderProgress(borderWidthSlider, textInputSettings.borderWidth || textInputDefaults.borderWidth);
    }
    if (borderOpacitySlider && borderOpacityValue) {
      borderOpacitySlider.value = textInputSettings.borderOpacity || textInputDefaults.borderOpacity;
      borderOpacityValue.textContent = `${Math.round((textInputSettings.borderOpacity || textInputDefaults.borderOpacity) * 100)}%`;
      updateSliderProgress(borderOpacitySlider, textInputSettings.borderOpacity || textInputDefaults.borderOpacity);
    }
    if (bgColorPicker && bgColorHex) {
      bgColorPicker.value = textInputSettings.backgroundColor;
      bgColorHex.value = textInputSettings.backgroundColor.toUpperCase();
    }
    if (textColorPicker && textColorHex) {
      textColorPicker.value = textInputSettings.textColor;
      textColorHex.value = textInputSettings.textColor.toUpperCase();
    }
    if (borderColorPicker) {
      borderColorPicker.value = textInputSettings.borderColor || textInputDefaults.borderColor;
    }
    if (glowToggle) {
      glowToggle.checked = textInputSettings.showGlow || false;
      if (glowSliders) {
        glowSliders.style.display = glowToggle.checked ? 'block' : 'none';
      }
    }
    if (glowIntensitySlider && glowIntensityValue) {
      glowIntensitySlider.value = textInputSettings.glowIntensity || textInputDefaults.glowIntensity;
      glowIntensityValue.textContent = `${textInputSettings.glowIntensity || textInputDefaults.glowIntensity}px`;
      updateSliderProgress(glowIntensitySlider, textInputSettings.glowIntensity || textInputDefaults.glowIntensity);
    }
    if (glowOpacitySlider && glowOpacityValue) {
      glowOpacitySlider.value = textInputSettings.glowOpacity || textInputDefaults.glowOpacity;
      glowOpacityValue.textContent = `${Math.round((textInputSettings.glowOpacity || textInputDefaults.glowOpacity) * 100)}%`;
      updateSliderProgress(glowOpacitySlider, textInputSettings.glowOpacity || textInputDefaults.glowOpacity);
    }
    if (glowColorPicker) {
      glowColorPicker.value = textInputSettings.glowColor || textInputDefaults.glowColor;
    }
    if (maxWidthSlider && maxWidthValue) {
      maxWidthSlider.value = textInputSettings.maxWidth || textInputDefaults.maxWidth;
      maxWidthValue.textContent = `${textInputSettings.maxWidth || textInputDefaults.maxWidth}px`;
      updateSliderProgress(maxWidthSlider, textInputSettings.maxWidth || textInputDefaults.maxWidth);
    }
    if (bottomPositionSlider && bottomPositionValue) {
      bottomPositionSlider.value = textInputSettings.bottomPosition || textInputDefaults.bottomPosition;
      bottomPositionValue.textContent = `${textInputSettings.bottomPosition || textInputDefaults.bottomPosition}px`;
      updateSliderProgress(bottomPositionSlider, textInputSettings.bottomPosition || textInputDefaults.bottomPosition);
    }

    // Update preview function
    const updatePreview = () => {
      if (!previewContainer) return;
      const radius = parseInt(radiusSlider?.value || textInputDefaults.borderRadius);
      const showBorder = borderToggle?.checked || false;
      const showGlow = glowToggle?.checked || false;
      const bgColor = bgColorPicker?.value || textInputDefaults.backgroundColor;
      const textColor = textColorPicker?.value || textInputDefaults.textColor;
      const borderColor = borderColorPicker?.value || textInputDefaults.borderColor;
      const borderWidth = parseFloat(borderWidthSlider?.value || textInputDefaults.borderWidth);
      const borderOpacity = parseFloat(borderOpacitySlider?.value || textInputDefaults.borderOpacity);
      const glowColor = glowColorPicker?.value || textInputDefaults.glowColor;
      const glowIntensity = parseInt(glowIntensitySlider?.value || textInputDefaults.glowIntensity);
      const glowOpacity = parseFloat(glowOpacitySlider?.value || textInputDefaults.glowOpacity);

      previewContainer.style.borderRadius = `${radius}px`;
      previewContainer.style.backgroundColor = bgColor;
      
      // Convert hex to rgba for border with opacity
      if (showBorder) {
        const r = parseInt(borderColor.slice(1, 3), 16);
        const g = parseInt(borderColor.slice(3, 5), 16);
        const b = parseInt(borderColor.slice(5, 7), 16);
        previewContainer.style.border = `${borderWidth}px solid rgba(${r}, ${g}, ${b}, ${borderOpacity})`;
      } else {
        previewContainer.style.border = 'none';
      }
      
      // Convert hex to rgba for glow with opacity
      if (showGlow) {
        const r = parseInt(glowColor.slice(1, 3), 16);
        const g = parseInt(glowColor.slice(3, 5), 16);
        const b = parseInt(glowColor.slice(5, 7), 16);
        previewContainer.style.boxShadow = `0 0 ${glowIntensity}px rgba(${r}, ${g}, ${b}, ${glowOpacity})`;
      } else {
        previewContainer.style.boxShadow = 'none';
      }
      
      const textEl = previewContainer.querySelector('.preview-text');
      if (textEl) {
        textEl.style.color = textColor;
      }
    };

    let saveTimeout = null;
    // Save settings function with debouncing to prevent breaking - per theme
    const saveTextInputSettings = () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      
      saveTimeout = setTimeout(async () => {
        try {
          const settings = {
            borderRadius: parseInt(radiusSlider?.value || textInputDefaults.borderRadius),
            showBorder: borderToggle?.checked || false,
            backgroundColor: bgColorPicker?.value || textInputDefaults.backgroundColor,
            textColor: textColorPicker?.value || textInputDefaults.textColor,
            borderColor: borderColorPicker?.value || textInputDefaults.borderColor,
            borderWidth: parseFloat(borderWidthSlider?.value || textInputDefaults.borderWidth),
            borderOpacity: parseFloat(borderOpacitySlider?.value || textInputDefaults.borderOpacity),
            showGlow: glowToggle?.checked || false,
            glowColor: glowColorPicker?.value || textInputDefaults.glowColor,
            glowIntensity: parseInt(glowIntensitySlider?.value || textInputDefaults.glowIntensity),
            glowOpacity: parseFloat(glowOpacitySlider?.value || textInputDefaults.glowOpacity),
            maxWidth: parseInt(maxWidthSlider?.value || textInputDefaults.maxWidth),
            bottomPosition: parseInt(bottomPositionSlider?.value || textInputDefaults.bottomPosition)
          };

          // Get fresh elementSettings to avoid conflicts
          const { elementSettings: freshSettings = {} } = await chrome.storage.sync.get('elementSettings');
          if (!freshSettings.textInputByTheme) {
            freshSettings.textInputByTheme = {};
          }
          
          // Save for current theme
          freshSettings.textInputByTheme[currentThemeId] = settings;
          
          await chrome.storage.sync.set({ elementSettings: freshSettings });

          // Send message to content script to update text input styling
          chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { 
                type: 'UPDATE_TEXT_INPUT_STYLING', 
                settings: settings,
                themeId: currentThemeId
              }).catch(() => {});
            });
          });
        } catch (error) {
          console.error('Failed to save text input settings:', error);
        }
      }, 150);
    };

    // Border Radius slider
    if (radiusSlider && radiusValue) {
      radiusSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        radiusValue.textContent = `${value}px`;
        updateSliderProgress(radiusSlider, value);
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Border toggle switch
    if (borderToggle) {
      borderToggle.addEventListener('change', () => {
        if (borderSliders) {
          borderSliders.style.display = borderToggle.checked ? 'block' : 'none';
        }
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Border width slider
    if (borderWidthSlider && borderWidthValue) {
      borderWidthSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        borderWidthValue.textContent = `${value}px`;
        updateSliderProgress(borderWidthSlider, value);
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Border opacity slider
    if (borderOpacitySlider && borderOpacityValue) {
      borderOpacitySlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        borderOpacityValue.textContent = `${Math.round(value * 100)}%`;
        updateSliderProgress(borderOpacitySlider, value);
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Background color
    if (bgColorPicker && bgColorHex) {
      bgColorPicker.addEventListener('input', (e) => {
        const value = e.target.value.toUpperCase();
        bgColorHex.value = value;
        updatePreview();
        saveTextInputSettings();
      });

      bgColorHex.addEventListener('change', (e) => {
        let value = e.target.value.trim().toUpperCase();
        if (!value.startsWith('#')) {
          value = '#' + value;
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
          bgColorPicker.value = value;
          bgColorHex.value = value;
          updatePreview();
          saveTextInputSettings();
        }
      });
    }

    // Text color
    if (textColorPicker && textColorHex) {
      textColorPicker.addEventListener('input', (e) => {
        const value = e.target.value.toUpperCase();
        textColorHex.value = value;
        updatePreview();
        saveTextInputSettings();
      });

      textColorHex.addEventListener('change', (e) => {
        let value = e.target.value.trim().toUpperCase();
        if (!value.startsWith('#')) {
          value = '#' + value;
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
          textColorPicker.value = value;
          textColorHex.value = value;
          updatePreview();
          saveTextInputSettings();
        }
      });
    }

    // Border color - prevent toggle when clicking color picker
    if (borderColorPicker) {
      // Stop propagation to prevent toggling border when clicking color picker
      borderColorPicker.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      borderColorPicker.addEventListener('input', (e) => {
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Glow toggle switch
    if (glowToggle) {
      glowToggle.addEventListener('change', () => {
        if (glowSliders) {
          glowSliders.style.display = glowToggle.checked ? 'block' : 'none';
        }
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Glow intensity slider
    if (glowIntensitySlider && glowIntensityValue) {
      glowIntensitySlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        glowIntensityValue.textContent = `${value}px`;
        updateSliderProgress(glowIntensitySlider, value);
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Glow opacity slider
    if (glowOpacitySlider && glowOpacityValue) {
      glowOpacitySlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        glowOpacityValue.textContent = `${Math.round(value * 100)}%`;
        updateSliderProgress(glowOpacitySlider, value);
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Glow color - prevent toggle when clicking color picker
    if (glowColorPicker) {
      // Stop propagation to prevent toggling glow when clicking color picker
      glowColorPicker.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      glowColorPicker.addEventListener('input', (e) => {
        updatePreview();
        saveTextInputSettings();
      });
    }

    // Max width slider
    if (maxWidthSlider && maxWidthValue) {
      maxWidthSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        maxWidthValue.textContent = `${value}px`;
        updateSliderProgress(maxWidthSlider, value);
        saveTextInputSettings();
      });
    }

    // Bottom position slider
    if (bottomPositionSlider && bottomPositionValue) {
      bottomPositionSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        bottomPositionValue.textContent = `${value}px`;
        updateSliderProgress(bottomPositionSlider, value);
        saveTextInputSettings();
      });
    }

    // Reset button - clears per-theme customization
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        // Delete the per-theme settings to revert to theme defaults
        const { elementSettings: freshSettings = {} } = await chrome.storage.sync.get('elementSettings');
        if (freshSettings.textInputByTheme && freshSettings.textInputByTheme[currentThemeId]) {
          delete freshSettings.textInputByTheme[currentThemeId];
          await chrome.storage.sync.set({ elementSettings: freshSettings });
        }
        
        // Update UI to theme defaults
        if (radiusSlider && radiusValue) {
          radiusSlider.value = textInputDefaults.borderRadius;
          radiusValue.textContent = `${textInputDefaults.borderRadius}px`;
          updateSliderProgress(radiusSlider, textInputDefaults.borderRadius);
        }
        if (borderToggle) {
          borderToggle.checked = textInputDefaults.showBorder || false;
          if (borderSliders) {
            borderSliders.style.display = textInputDefaults.showBorder ? 'block' : 'none';
          }
        }
        if (borderWidthSlider && borderWidthValue) {
          borderWidthSlider.value = textInputDefaults.borderWidth;
          borderWidthValue.textContent = `${textInputDefaults.borderWidth}px`;
          updateSliderProgress(borderWidthSlider, textInputDefaults.borderWidth);
        }
        if (borderOpacitySlider && borderOpacityValue) {
          borderOpacitySlider.value = textInputDefaults.borderOpacity;
          borderOpacityValue.textContent = `${Math.round(textInputDefaults.borderOpacity * 100)}%`;
          updateSliderProgress(borderOpacitySlider, textInputDefaults.borderOpacity);
        }
        if (bgColorPicker && bgColorHex) {
          bgColorPicker.value = textInputDefaults.backgroundColor;
          bgColorHex.value = textInputDefaults.backgroundColor.toUpperCase();
        }
        if (textColorPicker && textColorHex) {
          textColorPicker.value = textInputDefaults.textColor;
          textColorHex.value = textInputDefaults.textColor.toUpperCase();
        }
        if (borderColorPicker) {
          borderColorPicker.value = textInputDefaults.borderColor;
        }
        if (glowToggle) {
          glowToggle.checked = textInputDefaults.showGlow || false;
          if (glowSliders) {
            glowSliders.style.display = textInputDefaults.showGlow ? 'block' : 'none';
          }
        }
        if (glowIntensitySlider && glowIntensityValue) {
          glowIntensitySlider.value = textInputDefaults.glowIntensity;
          glowIntensityValue.textContent = `${textInputDefaults.glowIntensity}px`;
          updateSliderProgress(glowIntensitySlider, textInputDefaults.glowIntensity);
        }
        if (glowOpacitySlider && glowOpacityValue) {
          glowOpacitySlider.value = textInputDefaults.glowOpacity;
          glowOpacityValue.textContent = `${Math.round(textInputDefaults.glowOpacity * 100)}%`;
          updateSliderProgress(glowOpacitySlider, textInputDefaults.glowOpacity);
        }
        if (glowColorPicker) {
          glowColorPicker.value = textInputDefaults.glowColor;
        }
        if (maxWidthSlider && maxWidthValue) {
          maxWidthSlider.value = textInputDefaults.maxWidth;
          maxWidthValue.textContent = `${textInputDefaults.maxWidth}px`;
          updateSliderProgress(maxWidthSlider, textInputDefaults.maxWidth);
        }
        if (bottomPositionSlider && bottomPositionValue) {
          bottomPositionSlider.value = textInputDefaults.bottomPosition;
          bottomPositionValue.textContent = `${textInputDefaults.bottomPosition}px`;
          updateSliderProgress(bottomPositionSlider, textInputDefaults.bottomPosition);
        }
        updatePreview();
        
        // Send message to content script to use theme defaults
        chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
              type: 'UPDATE_TEXT_INPUT_STYLING', 
              settings: textInputDefaults,
              themeId: currentThemeId
            }).catch(() => {});
          });
        });
        
        this.showNotification('Reset to theme defaults', 'success');
      });
    }

    // Initial preview update
    updatePreview();

    // Store refresh function for theme change handling
    this.refreshTextInputControls = () => {
      // Re-initialize with new theme
      this.initElementsTab();
    };
  }

  async initOptimizationTab() {
    // No optimization settings currently
  }

  async initGeneralTab() {
    if (!this.overlay) return;

    // Display version
    const versionDisplay = this.overlay.querySelector('[data-role="version-display"]');
    if (versionDisplay) {
      const manifest = chrome.runtime.getManifest();
      versionDisplay.textContent = `Version ${manifest.version}`;
    }

    // Load and set disable toggle state
    const disableToggle = this.overlay.querySelector('[data-role="disable-toggle"]');
    if (disableToggle) {
      const { extensionDisabled = false } = await chrome.storage.sync.get('extensionDisabled');
      disableToggle.checked = extensionDisabled;

      disableToggle.addEventListener('change', async (e) => {
        const willDisable = e.target.checked;
        
        if (willDisable) {
          // Show confirmation modal
          this.showDisableConfirmModal(async (confirmed) => {
            if (confirmed) {
              await this.setExtensionDisabled(true);
            } else {
              // User canceled, revert toggle
              disableToggle.checked = false;
            }
          });
        } else {
          // Re-enabling, no confirmation needed
          await this.setExtensionDisabled(false);
        }
      });
    }

    // Reset all settings button
    const resetBtn = this.overlay.querySelector('[data-role="reset-all"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        this.showResetConfirmModal(async (confirmed) => {
          if (confirmed) {
            await this.resetAllSettings();
          }
        });
      });
    }
  }

  async setExtensionDisabled(disabled) {
    try {
      await chrome.storage.sync.set({ extensionDisabled: disabled });
      
      if (disabled) {
        // Show success message
        this.showNotification('Extension disabled. Refresh AI Studio pages to see changes.', 'warning');
      } else {
        // Show success message
        this.showNotification('Extension enabled. Refresh AI Studio pages to see changes.', 'success');
      }
    } catch (error) {
      console.error('Failed to update extension state:', error);
      this.showNotification('Failed to update extension state. Please try again.', 'error');
    }
  }

  showDisableConfirmModal(callback) {
    const modal = this.document.createElement('div');
    modal.className = 'confirm-modal-overlay';
    modal.innerHTML = `
      <div class="confirm-modal danger-modal">
        <div class="confirm-modal__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h3 class="confirm-modal__title">Disable Extension?</h3>
        <p class="confirm-modal__message">
          This will temporarily disable all Better AI Studio functionality including:
        </p>
        <ul class="confirm-modal__list">
          <li>Automatic preset application</li>
          <li>Theme customization</li>
          <li>Custom UI elements</li>
          <li>All extension features</li>
        </ul>
        <p class="confirm-modal__note">
          You'll need to refresh any open AI Studio tabs for changes to take effect. You can re-enable the extension at any time.
        </p>
        <div class="confirm-modal__actions">
          <button class="modal-btn modal-btn--secondary" data-action="cancel">Cancel</button>
          <button class="modal-btn modal-btn--danger" data-action="confirm">Disable Extension</button>
        </div>
      </div>
    `;

    // Append to overlay instead of body for proper positioning within popup
    if (this.overlay) {
      this.overlay.appendChild(modal);
    } else {
      this.document.body.appendChild(modal);
    }

    const cleanup = () => {
      modal.remove();
    };

    const handleClick = (e) => {
      const action = e.target.dataset.action;
      if (action === 'confirm') {
        cleanup();
        callback(true);
      } else if (action === 'cancel') {
        cleanup();
        callback(false);
      }
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup();
        callback(false);
      }
    });

    modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleClick);
    });
  }

  showResetConfirmModal(callback) {
    const modal = this.document.createElement('div');
    modal.className = 'confirm-modal-overlay';
    modal.innerHTML = `
      <div class="confirm-modal danger-modal">
        <div class="confirm-modal__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h3 class="confirm-modal__title">Reset All Settings?</h3>
        <p class="confirm-modal__message">
          This will permanently delete all your data including:
        </p>
        <ul class="confirm-modal__list">
          <li>All saved presets</li>
          <li>Theme preferences</li>
          <li>Custom settings</li>
          <li>Pinned themes</li>
        </ul>
        <p class="confirm-modal__note danger">
          ⚠️ This action cannot be undone. The extension will reload after reset.
        </p>
        <div class="confirm-modal__actions">
          <button class="modal-btn modal-btn--secondary" data-action="cancel">Cancel</button>
          <button class="modal-btn modal-btn--danger" data-action="confirm">Reset All Data</button>
        </div>
      </div>
    `;

    // Append to overlay instead of body for proper positioning within popup
    if (this.overlay) {
      this.overlay.appendChild(modal);
    } else {
      this.document.body.appendChild(modal);
    }

    const cleanup = () => {
      modal.remove();
    };

    const handleClick = (e) => {
      const action = e.target.dataset.action;
      if (action === 'confirm') {
        cleanup();
        callback(true);
      } else if (action === 'cancel') {
        cleanup();
        callback(false);
      }
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup();
        callback(false);
      }
    });

    modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleClick);
    });
  }

  showNotification(message, type = 'info') {
    const notification = this.document.createElement('div');
    notification.className = `settings-notification settings-notification--${type}`;
    notification.textContent = message;
    
    if (this.overlay) {
      this.overlay.appendChild(notification);
      
      setTimeout(() => {
        notification.classList.add('show');
      }, 10);
      
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
      }, 4000);
    }
  }

  async resetAllSettings() {
    try {
      // Clear all storage
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      
      // Reload the extension
      chrome.runtime.reload();
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showNotification('Failed to reset settings. Please try again.', 'error');
    }
  }
}

