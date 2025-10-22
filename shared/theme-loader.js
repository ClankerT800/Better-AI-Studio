const FALLBACK_THEME_ID = "monochrome";

const FALLBACK_THEME = {
  id: FALLBACK_THEME_ID,
  name: "Monochrome",
  type: "preset",
  mode: "dark",
  base: {
    primary: "#A1A1AA",
    background: "#18181B",
    surface: "#09090B",
    text: "#FAFAFA",
  },
  radius: "6px",
  borderWidth: "1px",
};

const FALLBACK_CONFIG = {
  version: "fallback",
  css: {
    baseVariables: "",
    popupStyles: "",
    websiteOverrides: "",
    selectors: {},
  },
  defaults: {
    theme: FALLBACK_THEME_ID,
    favorites: ["midnight", FALLBACK_THEME_ID, "matrix"],
  },
  themes: {
    [FALLBACK_THEME_ID]: FALLBACK_THEME,
  },
};

const tokenizeTheme = (theme) => {
  const base = theme?.base ?? {};
  return {
    primary: base.primary ?? FALLBACK_THEME.base.primary,
    background: base.background ?? FALLBACK_THEME.base.background,
    surface: base.surface ?? FALLBACK_THEME.base.surface,
    text: base.text ?? FALLBACK_THEME.base.text,
    radius: theme?.radius ?? FALLBACK_THEME.radius,
    borderWidth: theme?.borderWidth ?? FALLBACK_THEME.borderWidth,
  };
};

const applyTokens = (template, tokens) =>
  typeof template === "string"
    ? template.replace(/\$\{(\w+)\}/g, (match, token) => tokens[token] ?? match)
    : "";

let themeConfigPromise;

export const loadThemeConfig = async () => {
  if (!themeConfigPromise) {
    themeConfigPromise = fetch(
      chrome.runtime.getURL("themes/theme-config.json"),
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load theme-config.json: ${response.status}`,
          );
        }
        return response.json();
      })
      .catch((error) => {
        console.error(
          "Unable to load theme config, falling back to defaults.",
          error,
        );
        return FALLBACK_CONFIG;
      });
  }
  return themeConfigPromise;
};

export const getDefaultThemeId = async () => {
  const config = await loadThemeConfig();
  return config.defaults?.theme ?? FALLBACK_THEME_ID;
};

const resolveTheme = async (themeId) => {
  const config = await loadThemeConfig();
  const themes = config.themes ?? {};
  const resolvedId =
    themeId && themes[themeId]
      ? themeId
      : (config.defaults?.theme ?? FALLBACK_THEME_ID);
  const theme = themes[resolvedId] ?? FALLBACK_THEME;
  const tokens = tokenizeTheme(theme);
  return {
    config,
    id: resolvedId,
    theme,
    tokens,
  };
};

export const getTheme = async (themeId) => {
  const { theme } = await resolveTheme(themeId);
  return theme;
};

export const getThemeTokens = async (themeId) => {
  const { tokens } = await resolveTheme(themeId);
  return tokens;
};

export const getPopupCss = async (themeId) => {
  const { config, tokens } = await resolveTheme(themeId);
  return applyTokens(config.css?.popupStyles, tokens);
};

export const getWebsiteCss = async (themeId) => {
  const { config, tokens } = await resolveTheme(themeId);
  const base = applyTokens(config.css?.baseVariables, tokens);
  const overrides = config.css?.websiteOverrides ?? "";
  const selectors = Object.values(config.css?.selectors ?? {}).join("\n\n");
  return [base, overrides, selectors].filter(Boolean).join("\n\n");
};

export const getFavoriteThemeIds = async () => {
  const config = await loadThemeConfig();
  return config.defaults?.favorites ?? FALLBACK_CONFIG.defaults.favorites;
};
