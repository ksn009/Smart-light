const STORAGE_KEY = "smart_light_aio_config";

const defaults = {
  username: "",
  feed: "",
  key: ""
};

function getConfig() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  const cfg = {
    username: document.getElementById("aioUser").value.trim(),
    feed: document.getElementById("aioFeed").value.trim(),
    key: document.getElementById("aioKey").value.trim()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  alert("Settings saved!");
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
  const cfg = getConfig();
  if (!cfg.username || !cfg.feed || !cfg.key) {
    setBadge("Add AIO Key", false);
    return;
  }

  const url = `https://io.adafruit.com/api/v2/${encodeURIComponent(cfg.username)}/feeds/${encodeURIComponent(cfg.feed)}/data/last`;
  try {
    const res = await fetch(url, {
      headers: { "X-AIO-Key": cfg.key }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const val = String(data.value || "").trim().toUpperCase();
    renderState(val === "ON" || val === "1", "Adafruit IO");
    setBadge("Online", true);
  } catch (err) {
    setBadge("Sync Error", false);
  }
}

async function setLight(turnOn) {
  const cfg = getConfig();
  if (!cfg.username || !cfg.feed || !cfg.key) {
    alert("Please enter your Adafruit IO credentials in Settings first.");
    switchTab("settings");
    return;
  }

  renderState(turnOn, "Sending...");
  const url = `https://io.adafruit.com/api/v2/${encodeURIComponent(cfg.username)}/feeds/${encodeURIComponent(cfg.feed)}/data`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AIO-Key": cfg.key
      },
      body: JSON.stringify({ value: turnOn ? "ON" : "OFF" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderState(turnOn, "Synced");
    setBadge("Online", true);
  } catch (err) {
    setBadge("Send Failed", false);
    alert("Failed to send command to Adafruit IO.");
  }
}

function onToggleChanged() {
  const checked = document.getElementById("manualToggle").checked;
  setLight(checked);
}

window.addEventListener("DOMContentLoaded", () => {
  const cfg = getConfig();
  document.getElementById("aioUser").value = cfg.username;
  document.getElementById("aioFeed").value = cfg.feed;
  document.getElementById("aioKey").value = cfg.key;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  fetchLatestState();
  setInterval(fetchLatestState, 5000);
});
