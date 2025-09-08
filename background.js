chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.url.startsWith('https://aistudio.google.com') && !details.url.includes('model=gemini-1.5-flash-preview')) {
        chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            files: ['content.js']
        });
    }
});