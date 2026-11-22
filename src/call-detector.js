// Only injected into the website explicitly selected and granted by the user.
if (!globalThis.__zaifDetectorInstalled) {
  globalThis.__zaifDetectorInstalled = true;
  let lastState = null;
  let timeout = 0;
  const evaluate = async () => {
    const { callSelector = "" } = await chrome.storage.local.get("callSelector");
    if (!callSelector.trim()) return;
    let inCall = false;
    try { inCall = Boolean(document.querySelector(callSelector)); }
    catch { return; } // Invalid CSS selector; dashboard must show an error.
    if (inCall === lastState) return;
    lastState = inCall;
    chrome.runtime.sendMessage({ type: "CALL_STATE", inCall }).catch(() => {});
  };
  const queue = () => { clearTimeout(timeout); timeout = setTimeout(evaluate, 350); };
  const observer = new MutationObserver(queue);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.callSelector) { lastState = null; queue(); }
  });
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "RECHECK_CALL") { lastState = null; queue(); }
  });
  queue();
}
