chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.url.startsWith('https://aistudio.google.com')) {
        chrome.scripting.executeScript({
            target: { tabId: details.tabId, frameId: 0 },
            files: ['content.js']
        });
    }
});