import { storageSync, observeStorage } from "../shared/storage.js";
import { getPopupCss } from "../shared/theme-loader.js";

const STYLE_ELEMENT_ID = "popup-theme-vars";

export class PopupThemeEngine {
  constructor(rootDocument = document) {
    this.document = rootDocument;
    this.unsubscribe = null;
    this.currentThemeId = null;
    this.currentOverrides = null;
  }

  async init() {
    await this.applyCurrentTheme();
    this.unsubscribe = observeStorage("sync", (changes) => {
      if (!changes.settings) return;
      const newSettings = changes.settings.newValue ?? null;
      const themeId = newSettings?.currentTheme;
      const overrides = newSettings?.themeOverrides ?? null;
      this.applyTheme(themeId, overrides);
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  async applyCurrentTheme() {
    const settings = await storageSync.get("settings", null);
    await this.applyTheme(settings?.currentTheme, settings?.themeOverrides ?? null);
  }

  async applyTheme(themeId, overrides) {
    try {
      // Don't reapply if values are already current (prevents double application)
      if (themeId === this.currentThemeId && this.overridesEqual(overrides, this.currentOverrides)) {
        return;
      }

      const css = await getPopupCss(themeId);
      if (!css) return;
      const styleElement = this.ensureStyleElement();
      const overrideCss = this.buildOverrideCss(overrides);
      styleElement.textContent = [css, overrideCss].filter(Boolean).join("\n\n");
      this.currentThemeId = themeId ?? null;
      this.currentOverrides = overrides ?? null;
    } catch (error) {
      console.error("Failed to apply popup theme", error);
    }
  }

  overridesEqual(a, b) {
    if (a === b) return true;
    if (!a && !b) return true; // Both null/undefined
    if (!a || !b) return false; // One is null/undefined, other isn't

    // Compare the actual override values
    return (a.radius || null) === (b.radius || null) &&
           (a.borderWidth || null) === (b.borderWidth || null) &&
           (a.outlineOpacity || null) === (b.outlineOpacity || null);
  }

  ensureStyleElement() {
    let styleElement = this.document.getElementById(STYLE_ELEMENT_ID);
    if (!styleElement) {
      styleElement = this.document.createElement("style");
      styleElement.id = STYLE_ELEMENT_ID;
      this.document.head.appendChild(styleElement);
    }
    return styleElement;
  }

  buildOverrideCss(overrides) {
    if (!overrides) return "";
    const declarations = [];
    if (overrides.radius) {
      declarations.push(`  --bas-radius: ${overrides.radius};`);
    }
    if (overrides.borderWidth) {
      declarations.push(`  --bas-border-width: ${overrides.borderWidth};`);
    }
    if (overrides.outlineOpacity !== undefined && overrides.outlineOpacity !== null) {
      declarations.push(`  --bas-outline-opacity: ${overrides.outlineOpacity};`);
    }
    if (declarations.length === 0) {
      return "";
    }
    return `:root {\n${declarations.join("\n")}\n}`;
  }
}
