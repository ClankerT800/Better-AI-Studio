const TARGET = 'https://aistudio.google.com/';

const inject = (tabId) => {
    chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
    });
};

const isTarget = (url) => url?.startsWith(TARGET);

chrome.webNavigation.onCompleted.addListener((details) => {
    if (isTarget(details.url) && details.frameId === 0) inject(details.tabId);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (isTarget(details.url) && details.frameId === 0) inject(details.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isTarget(tab.url)) inject(tabId);
});
