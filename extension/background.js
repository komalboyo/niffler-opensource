const XBRAIN_API = "http://localhost:3333";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "save") {
    const body = { url: msg.url };
    if (msg.tags && msg.tags.length > 0) body.tags = msg.tags;

    fetch(`${XBRAIN_API}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "check") {
    fetch(`${XBRAIN_API}/api/posts?q=${encodeURIComponent(msg.query)}`)
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
