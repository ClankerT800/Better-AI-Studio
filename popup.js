import { manifestMeta, loadUiConfig } from "./shared/app-config.js";
import { SettingsModal } from "./popup/settings-modal.js";
import { PopupThemeEngine } from "./popup/theme-engine.js";
import { PresetsController } from "./popup/presets-controller.js";

const setHeaderMetadata = async () => {
  const config = await loadUiConfig();
  const title = document.querySelector(".popup-header__title");
  if (title) {
    title.textContent = manifestMeta.name;
  }
  document.title = manifestMeta.name;

  const themeButton = document.getElementById("theme-settings-btn");
  if (themeButton) {
    themeButton.setAttribute(
      "aria-label",
      `${manifestMeta.name} settings`,
    );
  }

  const socialLinks = config.links?.social ?? [];
  socialLinks.forEach((link) => {
    const anchor = document.querySelector(
      `[data-link-group="social"][data-link-id="${link.id}"]`,
    );
    if (!anchor) return;
    anchor.href = link.href;
    anchor.title = link.label;
    anchor.setAttribute("aria-label", link.label);
  });

  const supportLinks = config.links?.support ?? [];
  supportLinks.forEach((link) => {
    const anchor = document.querySelector(
      `[data-link-group="support"][data-link-id="${link.id}"]`,
    );
    if (!anchor) return;
    anchor.href = link.href;
    anchor.title = link.label;
    anchor.setAttribute("aria-label", link.label);
    const img = anchor.querySelector("img");
    if (img) {
      img.src = link.image;
      img.alt = link.alt ?? link.label;
    }
  });
};

const bootstrap = async () => {
  await setHeaderMetadata();
  const themeEngine = new PopupThemeEngine(document);
  await themeEngine.init();

  const settingsModal = new SettingsModal(document);
  const presetsController = new PresetsController(document);
  await presetsController.init();

  const themeBtn = document.getElementById("theme-settings-btn");
  themeBtn?.addEventListener("click", () => settingsModal.open());

  window.addEventListener(
    "beforeunload",
    () => {
      themeEngine.destroy();
    },
    { once: true },
  );
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
