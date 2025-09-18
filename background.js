const TARGET_PAGE = 'https://aistudio.google.com/';

const injectScript = (tabId) => {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
    });
};

const isTargetPage = (url) => url && url.startsWith(TARGET_PAGE);

chrome.webNavigation.onCompleted.addListener((details) => {
    if (isTargetPage(details.url) && details.frameId === 0) {
        injectScript(details.tabId);
    }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (isTargetPage(details.url) && details.frameId === 0) {
        injectScript(details.tabId);
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isTargetPage(tab.url)) {
        injectScript(tabId);
    }
});