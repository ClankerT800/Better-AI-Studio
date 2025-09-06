const targetUrl = "https://aistudio.google.com/prompts/new_chat";

function injectScript(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
    });
}

chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.url.startsWith(targetUrl)) {
        injectScript(details.tabId);
    }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.url.startsWith(targetUrl)) {
        injectScript(details.tabId);
    }
});