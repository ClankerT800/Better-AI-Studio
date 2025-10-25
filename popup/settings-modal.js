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
      <h3 class="modal-title">Theme Settings</h3>
      <button class="modal-close-btn" aria-label="Close theme settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="modal-content">
      <section class="themes-section">
        <h3 class="section-title">Themes</h3>
        <div class="preset-grid" data-role="themes-grid"></div>
      </section>
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
  }

  async open() {
    if (this.overlay) return;
    this.overlay = this.createOverlay();
    this.document.body.appendChild(this.overlay);
    await this.renderThemes();
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
}
