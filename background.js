const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;
const lastAccessed = {};

chrome.tabs.onActivated.addListener(({ tabId }) => {
  lastAccessed[tabId] = Date.now();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete lastAccessed[tabId];
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const now = Date.now();
  for (const tab of tabs) {
    lastAccessed[tab.id] = now;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getLastAccessed") {
    sendResponse(lastAccessed);
  }
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "close-duplicates") return;

  const [tabs, [currentTab]] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    chrome.tabs.query({ active: true, currentWindow: true })
  ]);

  const now = Date.now();
  const currentTabId = currentTab?.id;
  const seen = new Map();
  const toClose = new Set();

  for (const tab of tabs) {
    if (tab.id === currentTabId) continue;
    const url = tab.url?.replace(/#$/, "").replace(/\/$/, "") || "";
    if (!url || url.startsWith("chrome://") || url.startsWith("edge://")) continue;

    if (seen.has(url)) {
      toClose.add(tab.id);
    } else {
      seen.set(url, tab.id);
    }

    const lastSeen = lastAccessed[tab.id];
    if (lastSeen && (now - lastSeen) > INACTIVITY_LIMIT_MS) {
      toClose.add(tab.id);
    }
  }

  if (toClose.size > 0) await chrome.tabs.remove([...toClose]);
});
