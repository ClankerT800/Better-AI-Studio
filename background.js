import {
  getTargetOrigins,
  isTargetUrl,
  manifestMeta,
} from "./shared/app-config.js";
import { storageLocal, storageSync } from "./shared/storage.js";
import { DEFAULT_LOCAL_STATE, getSyncDefaults } from "./shared/defaults.js";

const TARGET_ORIGINS = getTargetOrigins();
const TARGET_QUERY_PATTERNS = TARGET_ORIGINS.map((origin) => `${origin}*`);

const requestPresetApply = async (
  tabId,
  reason = "navigation",
  force = false,
) => {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "APPLY_PRESET",
      reason,
      force,
    });
  } catch (error) {
    if (!error?.message?.includes("Receiving end does not exist")) {
      console.warn("Preset apply message failed", { tabId, reason, error });
    }
  }
};

const executeContentScript = async (tabId, reason = "navigation") => {
  try {
    // Check if extension is disabled
    const { extensionDisabled = false } = await chrome.storage.sync.get(['extensionDisabled']);
    if (extensionDisabled) {
      console.log('Extension functionality is disabled, skipping content script injection');
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (error) {
    console.warn("Content script injection failed", { tabId, error });
  } finally {
    await requestPresetApply(tabId, reason, true);
  }
};

const ensureSyncSettings = async () => {
  const defaults = await getSyncDefaults();
  const existing = await storageSync.get("settings", null);

  if (!existing) {
    await storageSync.set({ settings: defaults });
    return defaults;
  }

  const merged = {
    ...defaults,
    ...existing,
    preferences: {
      ...defaults.preferences,
      ...(existing.preferences ?? {}),
    },
    customThemes: existing.customThemes ?? defaults.customThemes,
    presetSnapshot: existing.presetSnapshot ?? defaults.presetSnapshot,
    lastUpdatedAt: existing.lastUpdatedAt ?? Date.now(),
    version: manifestMeta.version,
  };

  const needsUpdate = JSON.stringify(existing) !== JSON.stringify(merged);
  if (needsUpdate) {
    await storageSync.set({ settings: merged });
  }

  return merged;
};

const ensureLocalDefaults = async () => {
  const snapshot = await storageLocal.get(DEFAULT_LOCAL_STATE);
  const presets = Array.isArray(snapshot.presets)
    ? snapshot.presets
    : DEFAULT_LOCAL_STATE.presets;
  const activePresetIndex =
    typeof snapshot.activePresetIndex === "number"
      ? snapshot.activePresetIndex
      : DEFAULT_LOCAL_STATE.activePresetIndex;

  if (
    presets !== snapshot.presets ||
    activePresetIndex !== snapshot.activePresetIndex
  ) {
    await storageLocal.set({
      presets,
      activePresetIndex,
    });
  }
};

const notifyThemeChange = async () => {
  const tabs = await chrome.tabs.query({ url: TARGET_QUERY_PATTERNS });

  await Promise.all(
    tabs.map(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "THEME_CHANGED" });
      } catch (error) {
        if (!error?.message?.includes("Receiving end does not exist")) {
          console.warn("Failed to notify tab of theme change", {
            tabId: tab.id,
            error,
          });
        }
      }
    }),
  );
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isTargetUrl(tab?.url)) {
    executeContentScript(tabId, "tab-update");
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0 && isTargetUrl(details.url)) {
    executeContentScript(details.tabId, "navigation");
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync" || !changes.settings) return;
  const oldSettings = changes.settings.oldValue ?? {};
  const newSettings = changes.settings.newValue ?? {};
  const themeChanged = oldSettings.currentTheme !== newSettings.currentTheme;
  const oldOverrides = oldSettings.themeOverrides ?? {};
  const newOverrides = newSettings.themeOverrides ?? {};
  const overridesChanged =
    JSON.stringify(oldOverrides) !== JSON.stringify(newOverrides);
  if (!themeChanged && !overridesChanged) return;
  notifyThemeChange();
});

chrome.runtime.onInstalled.addListener(async () => {
  await Promise.all([ensureSyncSettings(), ensureLocalDefaults()]);
});

chrome.runtime.onStartup?.addListener(async () => {
  await Promise.all([ensureSyncSettings(), ensureLocalDefaults()]);
});
