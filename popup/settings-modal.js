import { storageSync } from "../shared/storage.js";
import { getSyncDefaults } from "../shared/defaults.js";
import { loadThemeConfig } from "../shared/theme-loader.js";

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
  </div>
`;

export class SettingsModal {
  constructor(rootDocument = document) {
    this.document = rootDocument;
    this.overlay = null;
    this.cleanup = null;
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
    this.overlay.remove();
    this.overlay = null;
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

    const [themeConfig, storedSettings] = await Promise.all([
      loadThemeConfig(),
      storageSync.get("settings", null),
    ]);

    const themes = themeConfig.themes ?? {};
    const settings = storedSettings ?? (await getSyncDefaults());

    const currentTheme = settings.currentTheme;
    const grid = this.overlay.querySelector('[data-role="themes-grid"]');
    if (!grid) return;

    grid.replaceChildren();

    for (const [themeId, theme] of Object.entries(themes)) {
      const card = this.createThemeCard(themeId, theme, currentTheme);
      grid.appendChild(card);
    }
  }

  createThemeCard(themeId, theme, currentThemeId) {
    const card = this.document.createElement("button");
    card.className = `theme-card${currentThemeId === themeId ? " active" : ""}`;
    card.type = "button";
    card.dataset.themeId = themeId;
    card.setAttribute(
      "aria-pressed",
      currentThemeId === themeId ? "true" : "false",
    );

    const colors = theme.base
      ? [
          theme.base.primary,
          theme.base.background,
          theme.base.surface,
          theme.base.text,
        ]
      : ["#666666", "#333333", "#222222", "#ffffff"];

    card.innerHTML = `
      <div class="theme-card-header">
        <span class="theme-name">${theme.name ?? themeId}</span>
      </div>
      <div class="theme-preview">
        <div class="preview-swatches">
          ${colors.map((color) => `<span class="swatch" style="background-color: ${color};"></span>`).join("")}
        </div>
      </div>
    `;

    card.addEventListener("click", () => this.selectTheme(themeId));
    return card;
  }

  async selectTheme(themeId) {
    const defaults = await getSyncDefaults();
    await storageSync.merge(
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
  }
}
