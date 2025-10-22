import { storageSync, observeStorage } from "../shared/storage.js";
import { getPopupCss } from "../shared/theme-loader.js";

const STYLE_ELEMENT_ID = "popup-theme-vars";

export class PopupThemeEngine {
  constructor(rootDocument = document) {
    this.document = rootDocument;
    this.unsubscribe = null;
  }

  async init() {
    await this.applyCurrentTheme();
    this.unsubscribe = observeStorage("sync", (changes) => {
      if (!changes.settings) return;
      const newTheme = changes.settings.newValue?.currentTheme;
      if (!newTheme) return;
      this.applyTheme(newTheme);
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
    await this.applyTheme(settings?.currentTheme);
  }

  async applyTheme(themeId) {
    try {
      const css = await getPopupCss(themeId);
      if (!css) return;
      const styleElement = this.ensureStyleElement();
      styleElement.textContent = css;
    } catch (error) {
      console.error("Failed to apply popup theme", error);
    }
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
}
