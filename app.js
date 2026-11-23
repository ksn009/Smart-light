const STORAGE_KEY = "smart_light_aio_config";
const POLL_INTERVAL_MS = 10000;

const defaults = {
  username: "",
  feed: "",
  key: ""
};

let currentState = false;
let isSending = false;
let requestSeq = 0;
let pollTimer = null;

function getConfig() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  const username = document.getElementById("aioUser").value.trim();
  const feed = document.getElementById("aioFeed").value.trim().toLowerCase();
  const key = document.getElementById("aioKey").value.trim();

  if (!username || !feed || !key) {
    alert("Please fill in Username, Feed Key, and Active Key.");
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, feed, key }));
  document.getElementById("aioFeed").value = feed;
  alert("Settings saved!");
  switchTab("main");
  fetchLatestState();
}

function switchTab(tab) {
  const isMain = tab === "main";
  document.getElementById("mainView").style.display = isMain ? "block" : "none";
  document.getElementById("settingsView").style.display = isMain ? "none" : "block";
  document.getElementById("navMain").classList.toggle("active", isMain);
  document.getElementById("navSettings").classList.toggle("active", !isMain);
}

function renderState(isOn, sourceText = "") {
  const toggle = document.getElementById("manualToggle");
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("stateLabel");
  const sync = document.getElementById("lastSync");

  toggle.checked = Boolean(isOn);
  dot.classList.toggle("on", Boolean(isOn));
  label.textContent = isOn ? "Light is ON" : "Light is OFF";
  sync.textContent = `Last updated: ${new Date().toLocaleTimeString()}${sourceText ? " (" + sourceText + ")" : ""}`;
}

function setBadge(text, ok) {
  const badge = document.getElementById("connBadge");
  badge.textContent = text;
  badge.classList.toggle("ok", Boolean(ok));
}

async function fetchLatestState() {
  if (isSending || document.hidden) return;

  const cfg = getConfig();
  if (!cfg.username || !cfg.feed || !cfg.key) {
    setBadge("Add AIO Key", false);
    return;
  }

  const seq = ++requestSeq;
  const url = `https://io.adafruit.com/api/v2/${encodeURIComponent(cfg.username)}/feeds/${encodeURIComponent(cfg.feed)}/data/last`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "X-AIO-Key": cfg.key }
    });

    // Drop stale response if a newer write/poll happened while in flight
    if (seq !== requestSeq || isSending) return;

    if (res.status === 401 || res.status === 403) {
      setBadge("Invalid Key", false);
      return;
    }
    if (res.status === 429) {
      setBadge("Rate Limited", false);
      return;
    }
    if (res.status === 404) {
      setBadge("No Data Yet", true);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const val = String(data.value || "").trim().toUpperCase();
    currentState = val === "ON" || val === "1";
    renderState(currentState, "Adafruit IO");
    setBadge("Online", true);
  } catch {
    if (seq === requestSeq) {
      setBadge("Sync Error", false);
    }
  }
}

async function setLight(turnOn) {
  if (isSending) return;

  const cfg = getConfig();
  if (!cfg.username || !cfg.feed || !cfg.key) {
    alert("Please enter your Adafruit IO credentials in Settings first.");
    renderState(currentState);
    switchTab("settings");
    return;
  }

  const prevState = currentState;
  isSending = true;
  requestSeq++; // Invalidate any in-flight poll
  document.getElementById("manualToggle").disabled = true;
  renderState(turnOn, "Sending...");

  const url = `https://io.adafruit.com/api/v2/${encodeURIComponent(cfg.username)}/feeds/${encodeURIComponent(cfg.feed)}/data`;
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-AIO-Key": cfg.key
      },
      body: JSON.stringify({ value: turnOn ? "ON" : "OFF" })
    });

    if (res.status === 401 || res.status === 403) throw new Error("Invalid Adafruit IO key");
    if (res.status === 429) throw new Error("Rate limit exceeded");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    currentState = Boolean(turnOn);
    renderState(currentState, "Synced");
    setBadge("Online", true);
  } catch (err) {
    currentState = prevState;
    renderState(prevState, "Reverted");
    setBadge("Send Failed", false);
    alert(`Failed to send command: ${err.message}`);
  } finally {
    isSending = false;
    document.getElementById("manualToggle").disabled = false;
  }
}

function onToggleChanged() {
  const checked = document.getElementById("manualToggle").checked;
  setLight(checked);
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchLatestState, POLL_INTERVAL_MS);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    fetchLatestState();
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const cfg = getConfig();
  document.getElementById("aioUser").value = cfg.username;
  document.getElementById("aioFeed").value = cfg.feed;
  document.getElementById("aioKey").value = cfg.key;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  fetchLatestState();
  startPolling();
});
