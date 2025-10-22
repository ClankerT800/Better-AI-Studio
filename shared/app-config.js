const manifest = chrome.runtime.getManifest();

const hostPermissions = manifest.host_permissions ?? [];

const toOrigin = (pattern) => {
  if (!pattern) return null;
  let normalized = pattern;

  if (normalized.endsWith("*")) {
    normalized = normalized.slice(0, -1);
  }

  if (!/^https?:\/\//.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    const origin = url.origin;
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return `${origin}${path}`.replace(/\/{2,}$/u, "/");
  } catch (error) {
    console.error("Failed to normalize host permission pattern", {
      pattern,
      error,
    });
    return null;
  }
};

const targetOrigins = hostPermissions
  .map(toOrigin)
  .filter((origin) => origin !== null);

const DEFAULT_TARGET = "https://aistudio.google.com/";

let uiConfigPromise;

const defaultUiConfig = {
  links: {
    social: [],
    support: [],
  },
  presets: {
    defaults: {
      temperature: 1,
      topP: 0.95,
      systemInstructions: "",
      tools: {
        codeExecution: false,
        search: true,
        urlContext: false,
      },
    },
  },
  themes: {
    default: "monochrome",
    favorites: ["midnight", "monochrome", "matrix"],
  },
  timing: {
    presetApplyMaxAttempts: 12,
    elementDiscoveryTimeoutMs: 2500,
  },
};

const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const mergeUiConfig = (config = {}) => {
  const merged = {
    ...defaultUiConfig,
    ...config,
    links: {
      social: config.links?.social ?? defaultUiConfig.links.social,
      support: config.links?.support ?? defaultUiConfig.links.support,
    },
    presets: {
      ...defaultUiConfig.presets,
      ...(config.presets ?? {}),
      defaults: {
        ...defaultUiConfig.presets.defaults,
        ...(config.presets?.defaults ?? {}),
      },
    },
    themes: {
      ...defaultUiConfig.themes,
      ...(config.themes ?? {}),
    },
    timing: {
      ...defaultUiConfig.timing,
      ...(config.timing ?? {}),
    },
  };

  return merged;
};

export const manifestMeta = {
  name: manifest.name,
  description: manifest.description,
  version: manifest.version,
};

export const TARGET_ORIGINS =
  targetOrigins.length > 0 ? targetOrigins : [DEFAULT_TARGET];

export const PRIMARY_TARGET = TARGET_ORIGINS[0];

export const getTargetOrigins = () => [...TARGET_ORIGINS];

export const isTargetUrl = (url) => {
  if (!url) return false;
  return TARGET_ORIGINS.some((origin) => url.startsWith(origin));
};

export const loadUiConfig = async () => {
  if (!uiConfigPromise) {
    uiConfigPromise = fetch(chrome.runtime.getURL("config/ui-config.json"))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ui-config.json: ${response.status}`);
        }
        return response.json();
      })
      .then((config) => mergeUiConfig(config))
      .catch((error) => {
        console.error(
          "Unable to load UI config, falling back to defaults.",
          error,
        );
        return clone(defaultUiConfig);
      });
  }

  return clone(await uiConfigPromise);
};

export const getTimingConfig = async () => {
  const config = await loadUiConfig();
  return {
    ...defaultUiConfig.timing,
    ...(config.timing ?? {}),
  };
};
