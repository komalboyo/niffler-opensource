// Niffler Chrome Extension — content script
// Injects a save button into every tweet on X/Twitter

// Niffler logo as the button icon
const ICON_BRAIN = `<img src="chrome-extension://${chrome.runtime.id}/icon48.png" width="20" height="20" style="border-radius:4px">`;

const ICON_CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`;

const ICON_PULSE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity="0.3"><animate attributeName="r" from="6" to="11" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.5" to="0" dur="1s" repeatCount="indefinite"/></circle></svg>`;

const ICON_ERROR = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

function createSaveButton() {
  const btn = document.createElement("button");
  btn.className = "xbrain-save-btn";
  btn.innerHTML = `<span class="xbrain-icon">${ICON_BRAIN}</span><span class="xbrain-label">Niffler</span>`;
  btn.title = "Save to Niffler";
  return btn;
}

function getTweetUrl(article) {
  const timeLink = article.querySelector('a[href*="/status/"] time');
  if (timeLink) {
    const anchor = timeLink.closest("a");
    if (anchor) return anchor.href;
  }
  const statusLinks = article.querySelectorAll('a[href*="/status/"]');
  for (const link of statusLinks) {
    if (link.href.match(/\/status\/\d+$/)) return link.href;
  }
  return null;
}

function setState(btn, state, label) {
  btn.className = "xbrain-save-btn xbrain-" + state;
  const iconEl = btn.querySelector(".xbrain-icon");
  const labelEl = btn.querySelector(".xbrain-label");

  switch (state) {
    case "saving":
      iconEl.innerHTML = ICON_PULSE;
      labelEl.textContent = label || "Saving…";
      break;
    case "saved":
      iconEl.innerHTML = ICON_CHECK;
      labelEl.textContent = label || "Saved!";
      break;
    case "duplicate":
      iconEl.innerHTML = ICON_CHECK;
      labelEl.textContent = "In brain";
      break;
    case "error":
      iconEl.innerHTML = ICON_ERROR;
      labelEl.textContent = label || "Error";
      break;
    default:
      iconEl.innerHTML = ICON_BRAIN;
      labelEl.textContent = "Niffler";
  }
}

function showTagInput(url, btn, article) {
  // Check if tag popover already exists
  if (article.querySelector(".niffler-tag-popover")) return;

  const popover = document.createElement("div");
  popover.className = "niffler-tag-popover";
  popover.innerHTML = `
    <input type="text" class="niffler-tag-input" placeholder="tags (comma separated, optional)">
    <div class="niffler-tag-actions">
      <button class="niffler-save-now">Save</button>
      <button class="niffler-skip">Skip tags</button>
    </div>
  `;
  popover.onclick = (e) => e.stopPropagation();

  const input = popover.querySelector(".niffler-tag-input");
  const saveBtn = popover.querySelector(".niffler-save-now");
  const skipBtn = popover.querySelector(".niffler-skip");

  function doSave(withTags) {
    popover.remove();
    const tags = withTags
      ? input.value.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean)
      : undefined;
    saveTweet(url, btn, tags);
  }

  saveBtn.onclick = (e) => { e.stopPropagation(); doSave(true); };
  skipBtn.onclick = (e) => { e.stopPropagation(); doSave(false); };
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") doSave(true);
    if (e.key === "Escape") popover.remove();
  };

  // Position below the action bar
  const actionBar = article.querySelector('[role="group"]');
  if (actionBar) {
    actionBar.parentElement.appendChild(popover);
  } else {
    article.appendChild(popover);
  }
  setTimeout(() => input.focus(), 50);

  // Close on outside click
  const closeHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== btn) {
      popover.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 100);
}

async function saveTweet(url, btn, tags) {
  // Check if logged in first
  chrome.runtime.sendMessage({ type: "getUser" }, (res) => {
    if (!res || !res.token) {
      setState(btn, "error", "Sign in");
      btn.title = "Click the Niffler extension icon to sign in";
      setTimeout(() => { setState(btn, "default"); btn.title = "Save to Niffler"; }, 4000);
      return;
    }
    doSave(url, btn, tags);
  });
}

function doSave(url, btn, tags) {
  setState(btn, "saving");

  chrome.runtime.sendMessage({ type: "save", url, tags }, (res) => {
    if (!res || !res.ok) {
      const errMsg = res?.error || "Failed to fetch";
      if (errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError")) {
        setState(btn, "error", "Server off");
        btn.title = "Niffler server not running";
      } else {
        setState(btn, "error", "Failed");
        btn.title = errMsg;
      }
      setTimeout(() => { setState(btn, "default"); btn.title = "Save to Niffler"; }, 4000);
      return;
    }

    const data = res.data;
    if (data.error) {
      if (data.error === "Not authenticated") {
        setState(btn, "error", "Sign in");
        btn.title = "Click the Niffler extension icon to sign in";
      } else {
        setState(btn, "error", "Failed");
        btn.title = data.error;
      }
      setTimeout(() => { setState(btn, "default"); btn.title = "Save to Niffler"; }, 4000);
      return;
    }

    if (data.duplicate) {
      setState(btn, "duplicate");
    } else {
      setState(btn, "saved");
      setTimeout(() => setState(btn, "duplicate"), 2000);
    }
  });
}

function injectButtons() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');

  articles.forEach((article) => {
    if (article.querySelector(".xbrain-save-btn")) return;

    const actionBar = article.querySelector('[role="group"]');
    if (!actionBar) return;

    const tweetUrl = getTweetUrl(article);
    if (!tweetUrl) return;

    const btn = createSaveButton();
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!btn.classList.contains("xbrain-saving") && !btn.classList.contains("xbrain-duplicate")) {
        showTagInput(tweetUrl, btn, article);
      }
    });

    actionBar.appendChild(btn);

    // Check if this tweet is already saved
    chrome.runtime.sendMessage({ type: "check", query: tweetUrl.split("/status/")[1] || "" }, (res) => {
      if (res && res.ok && res.data.posts && res.data.posts.some(p => p.url === tweetUrl)) {
        setState(btn, "duplicate");
      }
    });
  });
}

// Watch for new tweets (infinite scroll)
const observer = new MutationObserver(() => {
  injectButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

setTimeout(injectButtons, 1000);
