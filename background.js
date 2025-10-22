const TARGET_URL = 'https://aistudio.google.com/';

function injectContentScript(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js'],
  }).catch(error => console.log(`Inject failed: ${error.message}`));
}

function isTargetPage(url) {
  return url && url.startsWith(TARGET_URL);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isTargetPage(tab.url)) {
    injectContentScript(tabId);
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (isTargetPage(details.url) && details.frameId === 0) {
    injectContentScript(details.tabId);
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    const oldTheme = changes.settings.oldValue?.currentTheme;
    const newTheme = changes.settings.newValue?.currentTheme;
    if (oldTheme !== newTheme) {
      notifyAllTabsOfThemeChange();
    }
  }
});

async function notifyAllTabsOfThemeChange() {
  try {
    const tabs = await chrome.tabs.query({ url: `${TARGET_URL}*` });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'THEME_CHANGED' })
        .catch(error => {
          if (!error.message.includes('Receiving end does not exist')) {
            console.log(`Message error: ${error.message}`);
          }
        });
    }
  } catch (error) {
    console.log(`Query error: ${error.message}`);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const defaultSettings = {
    currentTheme: 'monochrome',
    customThemes: {},
    preferences: {
      favoriteThemes: ['midnight', 'monochrome', 'matrix'],
      recentThemes: []
    },
    version: '1.1.2'
  };

  if (details.reason === 'install') {
    await chrome.storage.sync.set({ settings: defaultSettings });
    await chrome.storage.local.set({
        presets: [],
        activePresetIndex: -1
    });
  } else if (details.reason === 'update') {
    const data = await chrome.storage.sync.get('settings');
    const existingSettings = data.settings || {};
    const newSettings = {
      ...defaultSettings,
      ...existingSettings,
      preferences: {
        ...defaultSettings.preferences,
        ...(existingSettings.preferences || {}),
      },
      version: defaultSettings.version
    };
    await chrome.storage.sync.set({ settings: newSettings });
  }
});