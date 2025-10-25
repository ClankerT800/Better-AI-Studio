import { manifestMeta, loadUiConfig } from "./app-config.js";
import { getDefaultThemeId, getFavoriteThemeIds } from "./theme-loader.js";

const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

let presetDefaultsPromise;

export const getPresetDefaults = async () => {
  if (!presetDefaultsPromise) {
    presetDefaultsPromise = loadUiConfig().then((config) =>
      clone(config.presets?.defaults ?? {}),
    );
  }
  return clone(await presetDefaultsPromise);
};

export const getSyncDefaults = async () => {
  const [themeId, favorites, presetDefaults] = await Promise.all([
    getDefaultThemeId(),
    getFavoriteThemeIds(),
    getPresetDefaults(),
  ]);

  return {
    currentTheme: themeId,
    customThemes: {},
    preferences: {
      favoriteThemes: favorites,
      recentThemes: [],
      pinnedThemes: ["monochrome", "matrix", "midnight"],
    },
    presetSnapshot: presetDefaults,
    version: manifestMeta.version,
    lastUpdatedAt: Date.now(),
  };
};

export const DEFAULT_LOCAL_STATE = {
  presets: [],
  activePresetIndex: -1,
};
