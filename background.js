chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.url.startsWith('https://aistudio.google.com/prompts/new_chat')) {
        chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            files: ['content.js']
        });
    }
});