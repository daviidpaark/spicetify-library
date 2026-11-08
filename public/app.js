// Mobile copy of the Random Library and Release List Spicetify apps. All data comes from the
// server in pages; albums and artists open in Spotify through open.spotify.com links.
const BATCH_SIZE = 60;
const MAX_PAGE_SIZE = 200;
const SYNC_RETRY_MS = 2000;
const SEARCH_DEBOUNCE_MS = 200;
const DAY_MS = 86400000;
const STORAGE_STATE = "spicetify-library:state";
const RELEASE_TYPES = ["album", "ep", "single"];
const TYPE_LABELS = { album: "ALBUM", ep: "EP", single: "SINGLE" };
const TYPE_PLURALS = { album: "Albums", ep: "EPs", single: "Singles" };
const DEFAULT_COLORS = {
  library: { album: "#8b5cf6", ep: "#38bdf8", single: "#10b981" },
  releases: { album: "#e0b766", ep: "#6ec6d8", single: "#bc8edd" },
};
const RANGES = [[7, "7 Days"], [14, "14 Days"], [30, "30 Days"], [60, "60 Days"], [90, "90 Days"], [0, "All Time"], [-1, "Custom"]];
const ALBUM_SORTS = [
  ["shuffle", "Shuffled"], ["name-asc", "Album A–Z"], ["name-desc", "Album Z–A"], ["artist-asc", "Artist A–Z"],
  ["artist-desc", "Artist Z–A"], ["date-desc", "Newest first"], ["date-asc", "Oldest first"],
];
const ARTIST_SORTS = [["shuffle", "Shuffled"], ["name-asc", "Artist A–Z"], ["name-desc", "Artist Z–A"]];
const MODES = {
  albums: { label: "Albums", search: "Search albums or artists…", random: "Random Album" },
  artists: { label: "Artists", search: "Search followed artists…", random: "Random Artist" },
  discover: { label: "Discover", search: "Search unsaved releases or artists…", random: "Random Album" },
};
const GROUP_MODES = [["date", "Day-by-Day Timeline"], ["date_type", "Day-by-Day with Type Subgroups"], ["type", "By Release Type (Albums, EPs, Singles)"]];
const GROUP_ORDERS = [["artist", "Artist Name (A-Z)"], ["album-group", "Album Type → Artist Name"], ["time", "Chronological (Time)"]];
const ARTIST_FILTERS = [
  ["all", "All"], ["saved", "✓ In Library"], ["album", "Albums"], ["ep", "EPs"], ["single", "Singles"], ["has_editions", "⚡ Alternative Editions"],
];

const ICONS = {
  check: '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M15.53 2.47a.75.75 0 0 1 0 1.06L4.907 14.153.47 9.716a.75.75 0 0 1 1.06-1.06l3.377 3.376L14.47 2.47a.75.75 0 0 1 1.06 0z"/></svg>',
  bolt: '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  gear: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
  shuffle: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 6.8l.7-.8C4.1 4.7 2.5 4 .9 4v1c1.3 0 2.6.6 3.5 1.6l.1.2zm7.5 4.7c-1.2 0-2.3-.5-3.2-1.3l-.6.8c1 1 2.4 1.5 3.8 1.5V14l3.5-2-3.5-2v1.5zm0-6V7l3.5-2L12 3v1.5c-1.6 0-3.2.7-4.2 2l-3.4 3.9c-.9 1-2.2 1.6-3.5 1.6v1c1.6 0 3.2-.7 4.2-2l3.4-3.9c.9-1 2.2-1.6 3.5-1.6z"/></svg>',
};

// Library badge icons, the same as the Library Badges userscript. Navidrome, Plex, Tidarr and slskd:
// selfh.st/icons (CC BY 4.0). Jellyfin, Bandcamp and Deezer (for Deemix): Simple Icons (CC0).
const LIBRARY_ICONS = {
  n: { color: "#0084ff", viewBox: "0 0 512 512", path: "M256 0C114.8 0 0 114.8 0 256s114.8 256 256 256 256-114.8 256-256S397.2 0 256 0m0 491.3C126.3 491.3 20.7 385.7 20.7 256S126.3 20.7 256 20.7 491.3 126.3 491.3 256 385.7 491.3 256 491.3m0-137.9c-53.7 0-97.4-43.7-97.4-97.4s43.7-97.4 97.4-97.4 97.4 43.7 97.4 97.4-43.7 97.4-97.4 97.4m0-174.8c-42.7 0-77.4 34.7-77.4 77.4s34.7 77.4 77.4 77.4 77.4-34.7 77.4-77.4-34.7-77.4-77.4-77.4m0 235c-5.5 0-10-4.5-10-10s4.5-10 10-10c75.9 0 137.6-61.7 137.6-137.6 0-5.5 4.5-10 10-10s10 4.5 10 10c0 86.9-70.7 157.6-157.6 157.6M108.4 266c-5.5 0-10-4.5-10-10 0-86.9 70.7-157.6 157.6-157.6 5.5 0 10 4.5 10 10s-4.5 10-10 10c-75.9 0-137.6 61.7-137.6 137.6 0 5.5-4.5 10-10 10M256 459.8c-5.5 0-10-4.5-10-10s4.5-10 10-10c85.4 0 160.9-60.3 179.5-143.4 1.2-5.4 6.6-8.8 11.9-7.6 5.4 1.2 8.8 6.6 7.6 11.9-10 44.5-35.1 84.8-70.7 113.7-36.1 29.3-81.7 45.4-128.3 45.4m193.6-186.4h-.8c-5.5-.5-9.6-5.3-9.1-10.8.2-2 .2-4.3.2-6.6 0-5.5 4.5-10 10-10s10 4.5 10 10c0 2.5 0 5.4-.2 8.2-.5 5.3-4.9 9.2-10.1 9.2M62.2 266c-5.5 0-10-4.5-10-10 0-2.4 0-4.9.2-7.5.5-5.5 5.4-9.5 10.9-9.1 5.5.5 9.6 5.4 9.1 10.9-.2 1.7-.2 3.7-.2 5.7 0 5.5-4.5 10-10 10m3.8-38.6c-.7 0-1.3-.1-2-.2-5.4-1.1-8.9-6.4-7.8-11.8C75.4 120.8 159.5 52.2 256 52.2c5.5 0 10 4.5 10 10s-4.5 10-10 10c-87.1 0-162.9 61.9-180.2 147.2-1 4.7-5.2 8-9.8 8M256 284c-15.4 0-28-12.6-28-28s12.6-28 28-28 28 12.6 28 28-12.6 28-28 28m0-36c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8" },
  p: { color: "#e5a00d", viewBox: "0 0 512 512", path: "M256 70H148l108 186-108 186h108l108-186z" },
  j: { color: "#00A4DC", viewBox: "0 0 24 24", path: "M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z" },
  d: { color: "#A238FF", viewBox: "0 0 24 24", path: "M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z" },
  t: { color: "#90d8ff", viewBox: "0 0 512 512", path: "M245.3.1c-.2.1-4.2.4-9 .8-4.8.3-10.5.8-12.7 1.1-4 .5-24.4 4.2-27.7 5.1-36 9-67.8 24.4-97 47C89 61.7 85.5 64.9 73 77.5c-36.2 36.4-60.6 84.4-69.4 135.9C1.1 228.7.2 239.3.2 256.3c0 19.8 1 30.3 4.4 47.9C18.2 375.8 61.6 438 124 475.7c28.5 17.1 64.2 29.9 94.8 34 2.5.4 5.4.8 6.6 1 9.5 1.5 36.4 2 51.7 1 5-.4 9.4-.8 9.7-1s2.9-.5 5.8-.9c2.9-.3 10-1.6 15.8-2.7 14.1-3 12.8-2.6 22.8-5.8 74.6-23.4 134.3-78.5 162.9-150.4 8-20.1 12.6-37.9 16.2-62 2.3-15.5 2.3-47.2.1-64.1-6.5-49-24.2-90.4-55.2-129.5-8.5-10.7-26.4-28.7-36.5-36.8-4.1-3.2-8.3-6.6-9.2-7.4-4.6-3.8-23-15.5-32-20.3C346.9 14.3 314.4 4.4 278.9 1c-5.7-.6-33.2-1.3-33.6-.9m33.8 143.1c23.2 5.1 41.6 15.2 58.2 31.6 16.4 16.3 26.7 35.2 31.7 58.6 2.3 10.5 2.2 36.1-.1 46-3.6 15.8-9.4 29.2-18.2 42.3-7.6 11.2-24.4 27-35.5 33.3-12.6 7.1-23.5 11.3-35.7 13.9-23.4 4.7-47.5 2.5-68.4-6.7-14.8-6.5-25.2-13.5-36.4-24.8-19.1-19.1-29.7-40.8-33.3-68.2-.6-4.1-.7-20.5-.2-25 2.1-19.1 9-37.8 20-53.8 4.1-6.1 17.9-20.8 23.4-25.1 14.8-11.5 36.4-20.8 52.7-22.9 2.2-.3 4.1-.6 4.3-.9 1.2-1 31.2.3 37.5 1.7m-30.3 88.4c-6.7 2-12.3 6.9-16.2 14.1-2.5 4.7-2.4 16.7.4 22 8.3 15.5 29 18.8 41 6.4 15.9-16.4 4.2-43.6-18.6-43.2-2.3-.1-5.3.2-6.6.7" },
  k: { color: "#cbd5e1", viewBox: "0 0 512 512", path: "M484.8 60.8C459.2 45.2 424.8 37 385 37c-60.9 0-128 19.2-188.3 52.7l-.4-.2s-.1.3-.1.5c-18.3 10.1-35.9 21.4-52.6 34.1C45.8 198.5 18.4 286.9 41.5 334.2 16.2 377.3.6 422 0 475c48.6-92.7 77.8-167.8 236.3-294.2-45.2 9.7-123.5 55.7-176.2 125.6-5-40.9 27.3-106.8 99.3-161.5 9.1-6.9 18.6-13.4 28.2-19.5-7.5 23.5-5.1 17.7-20.8 50.6 23.2-21.9 38.5-35.4 61.3-73 29.7-14.6 60.6-25.5 91.2-32.1-5.1 16.8-14.7 45.2-27.8 67.8 0 0 33.1-7.1 60.5-5.5-14.9 16.5-28.4 34.4-42.1 52.7-18.7 25-38 50.9-62.8 74.9-3 2.9-5.9 5.5-8.7 8.3-38-3.7-63.2 10.6-86.7 35.7 18.6-8.7 43.5-15.8 59.1-11.5-28.8 23.3-74.1 54.2-111.4 51.7-7.1 10.8-7.5 11.1-15.3 24.1 60.5 15 136.5-46.4 181.1-89.9 26.2-25.5 46.2-52.1 65.5-77.9 39.7-53.2 74.1-99.1 150.3-116.5l31-7.1z" },
  c: { color: "#629AA9", viewBox: "0 0 24 24", path: "M0 18.75l7.437-13.5H24l-7.438 13.5H0z" },
};

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const FULL_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
const SYNC_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const $ = (id) => document.getElementById(id);
const view = $("view");
const grid = $("grid");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
// False on a device that has never changed a Release List filter; it then starts from the
// range, sorting and release types set in the desktop app
let hasSavedFilters = false;

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_STATE)) || {};
  } catch {}
  hasSavedFilters = Boolean(saved.rel);
  return {
    mode: MODES[saved.mode] ? saved.mode : "albums",
    seed: saved.seed || newSeed(),
    sort: { albums: "shuffle", artists: "shuffle", discover: "shuffle", ...saved.sort },
    discoverTypes: Array.isArray(saved.discoverTypes) && saved.discoverTypes.length ? saved.discoverTypes : ["album", "ep"],
    discoverSaved: saved.discoverSaved === true,
    artistFilter: saved.artistFilter || "all",
    rel: { days: 30, from: "", to: "", types: [...RELEASE_TYPES], saved: false, sort: "newest", ...saved.rel },
    // View settings for this device; null follows what the Spicetify apps synced
    settings: { groupBy: null, releasesOrder: null, colors: null, badges: false, ...saved.settings },
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_STATE, JSON.stringify(state));
  } catch {}
}

function newSeed() {
  return (Math.random() * 2 ** 32) >>> 0 || 1;
}

const state = loadState();
const queries = { albums: "", artists: "", discover: "", artist: "", releases: "" };
const artistHistory = { stack: [], index: -1 };
let meta = { library: { albums: 0, artists: 0 }, releases: { count: 0, settings: {} } };
let colors = DEFAULT_COLORS;
let feed = null;
let currentLoad = null;
let pendingRestore = null;
let lastPick = null;
let openMenu = null;
let openMenuOwner = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, label, onClick, icon) {
  const node = el("button", className);
  if (icon) node.innerHTML = icon;
  node.append(label);
  node.addEventListener("click", onClick);
  return node;
}

function showBadges() {
  return Boolean(state.settings.badges && meta.badges?.enabled);
}

async function api(path, params = {}) {
  const query = new URLSearchParams(showBadges() ? { ...params, badges: 1 } : params);
  const res = await fetch(`api/${path}?${query}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function spotifyLink(uri) {
  const [, kind, id] = String(uri || "").split(":");
  return id ? `https://open.spotify.com/${kind}/${id}` : "";
}

function contrastColor(hex) {
  const value = parseInt(hex.slice(1), 16);
  const yiq = (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

function typeBadge(type, palette) {
  const badge = el("span", "rl-type-badge", TYPE_LABELS[type]);
  badge.style.backgroundColor = palette[type];
  badge.style.color = contrastColor(palette[type]);
  return badge;
}

function syncedSuffix(syncedAt) {
  return syncedAt ? ` · synced ${SYNC_DATE_FORMAT.format(new Date(syncedAt))}` : "";
}

// Same headings as Release List: Today, Yesterday, a weekday within the last week, then the full date
function dayHeader(dateStr) {
  const [year, month = 1, day = 1] = dateStr.split("-").map(Number);
  if (!year) return "Unknown date";
  const target = new Date(year, month - 1, day);
  const now = new Date();
  const diffDays = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - target) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 6) return WEEKDAY_FORMAT.format(target);
  return FULL_DATE_FORMAT.format(target);
}

function debounce(fn) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), SEARCH_DEBOUNCE_MS);
  };
}

function searchInput(key, placeholder, onChange) {
  const input = el("input", "rl-search");
  input.type = "search";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.value = queries[key];
  input.addEventListener("input", debounce(() => {
    queries[key] = input.value;
    onChange();
  }));
  return input;
}

function sortSelect(options, value, onChange) {
  const select = el("select", "rl-sort");
  select.setAttribute("aria-label", "Sort");
  for (const [key, label] of options) select.add(new Option(label, key));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
function artwork(item, className) {
  const wrapper = el("a", className);
  wrapper.href = spotifyLink(item.uri);
  if (item.imageUrl) {
    const img = el("img", "rl-card-artwork");
    img.src = item.imageUrl;
    img.alt = item.name;
    img.loading = "lazy";
    img.decoding = "async";
    wrapper.appendChild(img);
  }
  return wrapper;
}

function closeEditionMenu() {
  openMenu?.remove();
  openMenu = null;
  openMenuOwner = null;
}

function toggleMenu(card, owner, className, rows) {
  const wasOpenHere = openMenuOwner === owner;
  closeEditionMenu();
  if (wasOpenHere) return;
  openMenu = el("div", className);
  openMenu.append(...rows);
  openMenuOwner = owner;
  card.appendChild(openMenu);
}

function toggleEditionMenu(card, owner, album) {
  const rows = album.editions.map((edition) => {
    const row = el("a", "rl-edition-item");
    row.href = spotifyLink(edition.uri);
    row.append(el("span", "", edition.name), el("span", "", edition.isSaved ? "✓" : ""));
    return row;
  });
  toggleMenu(card, owner, "rl-edition-menu", rows);
}

function libraryIcon(code) {
  const icon = LIBRARY_ICONS[code];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", icon.viewBox);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", icon.path);
  path.setAttribute("fill", icon.color);
  svg.appendChild(path);
  return svg;
}

function libraryLink(link, className, text) {
  const a = el("a", className);
  if (link.href) {
    a.href = link.href;
    a.target = "_blank";
    a.rel = "noopener";
  }
  a.title = link.title;
  a.setAttribute("aria-label", link.title);
  if (text) a.append(text);
  a.appendChild(libraryIcon(link.code));
  return a;
}

// Badges the server matched: icons for the libraries that have the album, and for one Navidrome doesn't have, a
// "not sure" link to a possible match and a ↓ to download it (▾ lists the other downloaders)
function libraryBadges(card, badges) {
  const box = el("div", "rl-lib-badges");
  if (badges.have) {
    const owned = el("span", "rl-lib-pill");
    for (const link of badges.have) owned.appendChild(libraryLink(link));
    box.appendChild(owned);
  }
  if (badges.maybe || badges.get) {
    const get = el("span", "rl-lib-pill rl-lib-get");
    if (badges.maybe) get.appendChild(libraryLink(badges.maybe, "rl-lib-maybe")).append("?");
    if (badges.get) {
      get.appendChild(libraryLink(badges.get[0], "", "↓"));
      if (badges.get.length > 1) {
        const more = button("rl-lib-more", "▾", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rows = badges.get.slice(1).map((link) => {
            const row = libraryLink(link, "rl-edition-item rl-lib-menu-item");
            row.appendChild(el("span", "", link.title));
            return row;
          });
          toggleMenu(card, more, "rl-edition-menu rl-lib-menu", rows);
        });
        more.title = "Other downloaders";
        get.appendChild(more);
      }
    }
    box.appendChild(get);
  }
  return box;
}

function albumCard(album, palette) {
  const card = el("div", "rl-card");
  const link = spotifyLink(album.uri);

  const art = artwork(album, "rl-card-artwork-wrapper");
  if (album.isSaved) {
    const badge = el("div", "rl-in-library-badge");
    badge.title = "In your Library";
    badge.innerHTML = ICONS.check;
    art.appendChild(badge);
  }

  const title = el("a", "rl-card-title", album.name);
  title.href = link;
  title.title = album.name;

  const artistRow = el("div", "rl-card-artist-row");
  const artistLink = spotifyLink(album.artistUri);
  const artist = el(artistLink ? "a" : "span", "rl-card-artist", album.artist);
  if (artistLink) artist.href = artistLink;
  artistRow.appendChild(artist);
  if (album.editions) {
    const badge = button(
      "rl-edition-badge" + (album.hasUpgradeAvailable ? " upgrade" : ""),
      album.hasUpgradeAvailable ? "Deluxe" : `${album.editions.length} Eds ▾`,
      (e) => {
        e.stopPropagation();
        toggleEditionMenu(card, badge, album);
      },
      ICONS.bolt
    );
    artistRow.appendChild(badge);
  }

  const meta = el("div", "rl-card-meta");
  const left = el("div", "rl-card-meta-left");
  left.appendChild(typeBadge(album.type, palette));
  if (album.trackCount > 1) left.appendChild(el("span", "rl-card-tracks", `${album.trackCount} tracks`));
  meta.append(left, el("span", "rl-card-date", album.releaseDate));

  card.append(art, title, artistRow, meta);
  if (album.badges && showBadges()) card.appendChild(libraryBadges(card, album.badges));
  return card;
}

function artistCard(artist) {
  const card = el("div", "rl-card");
  const art = artwork(artist, "rl-card-artwork-wrapper avatar");
  art.href = "#/library/artist/" + artist.uri.split(":").pop();
  art.addEventListener("click", () => recordArtist(artist));
  card.append(art, el("div", "rl-artist-name", artist.name), el("div", "rl-artist-label", "Artist"));
  return card;
}

// ---------------------------------------------------------------------------
// Paged feed with infinite scroll
// ---------------------------------------------------------------------------
// A restore reloads the feed in place after a sync: the old cards stay until the new ones
// arrive, as many items as were loaded come back, and the scroll position is kept
function startFeed(path, params, onPage) {
  closeEditionMenu();
  const restore = pendingRestore;
  pendingRestore = null;
  if (!restore) grid.textContent = "";
  $("empty").hidden = true;
  feed = { path, params, onPage, offset: 0, done: false, loading: false, restore };
  loadMore();
}

async function loadMore() {
  const current = feed;
  if (!current || current.loading || current.done) return;
  current.loading = true;
  const restore = current.restore;
  const limit = restore ? Math.min(MAX_PAGE_SIZE, Math.max(BATCH_SIZE, restore.count - current.offset)) : BATCH_SIZE;
  let data;
  try {
    data = await api(current.path, { ...current.params, offset: current.offset, limit });
  } catch {
    if (current === feed && !restore) showEmpty("Could not reach the server.");
    return;
  }
  if (current !== feed) return;

  const first = current.offset === 0;
  if (first && restore) grid.textContent = "";
  current.offset += data.items.length;
  current.done = data.items.length === 0 || current.offset >= data.total;
  current.loading = false;
  current.onPage(data, first);
  if (first && data.total === 0) showEmpty(current.emptyText || "Nothing matches.");
  if (restore && (current.done || current.offset >= restore.count)) {
    current.restore = null;
    window.scrollTo(0, restore.scrollY);
  }
  if (current.restore || $("sentinel").getBoundingClientRect().top < innerHeight + 800) loadMore();
}

// Pick up pushes from the desktop apps while the page is open: the server announces each push
// on an event stream, which stays closed while the tab is hidden
let events = null;
let syncRetry = null;

async function checkForSync() {
  clearTimeout(syncRetry);
  if (document.hidden) return;
  const busy = () => !currentLoad || !feed || feed.loading || openMenu;
  if (busy()) {
    syncRetry = setTimeout(checkForSync, SYNC_RETRY_MS);
    return;
  }
  const data = await api("meta").catch(() => null);
  if (!data) return;
  const badgesChanged = showBadges() && data.badges?.builtAt !== meta.badges?.builtAt;
  if (data.library.syncedAt === meta.library.syncedAt && data.releases.syncedAt === meta.releases.syncedAt && !badgesChanged) return;
  if (busy()) {
    syncRetry = setTimeout(checkForSync, SYNC_RETRY_MS);
    return;
  }
  meta = data;
  applyColors();
  pendingRestore = { count: feed.offset, scrollY: window.scrollY };
  currentLoad();
}

function connectEvents() {
  if (events || document.hidden || !window.EventSource) return;
  events = new EventSource("api/events");
  events.addEventListener("sync", checkForSync);
  // Also fires on every reconnect, covering pushes missed while disconnected
  events.addEventListener("open", checkForSync);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return connectEvents();
  events?.close();
  events = null;
  clearTimeout(syncRetry);
});

function showEmpty(text) {
  $("empty").textContent = text;
  $("empty").hidden = false;
}

new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) loadMore();
}, { rootMargin: "800px" }).observe($("sentinel"));

// ---------------------------------------------------------------------------
// Random Library
// ---------------------------------------------------------------------------
function libraryHeader(subtitle) {
  const header = el("div", "rl-header");
  const titleBlock = el("div");
  const titleRow = el("div", "rl-title-row");
  const toggle = el("div", "rl-mode-toggle");
  for (const [key, mode] of Object.entries(MODES)) {
    toggle.appendChild(
      button("rl-mode-btn" + (state.mode === key ? " active" : ""), mode.label, () => {
        state.mode = key;
        saveState();
        artistHistory.stack = [];
        artistHistory.index = -1;
        if (location.hash === "#/library") render();
        else location.hash = "#/library";
      })
    );
  }
  titleRow.append(el("div", "rl-title", "Random Library"), toggle);
  titleBlock.append(titleRow, subtitle);

  const controls = el("div", "rl-controls");
  controls.appendChild(button("rl-btn", MODES[state.mode].random, randomPick));
  controls.appendChild(
    button("rl-btn primary", "Shuffle", () => {
      state.seed = newSeed();
      state.sort[state.mode] = "shuffle";
      saveState();
      render();
    }, ICONS.shuffle)
  );
  controls.appendChild(button("rl-btn", "Settings", openSettings, ICONS.gear));
  header.append(titleBlock, controls);
  return header;
}

function renderLibrary() {
  const mode = state.mode;
  const subtitle = el("div", "rl-subtitle", "Loading…");
  view.appendChild(libraryHeader(subtitle));

  const typePills = {};
  if (mode === "discover") {
    const pills = el("div", "rl-pills");
    for (const type of RELEASE_TYPES) {
      const pill = button("rl-filter-pill" + (state.discoverTypes.includes(type) ? " active" : ""), TYPE_PLURALS[type], () => {
        const next = state.discoverTypes.includes(type) ? state.discoverTypes.filter((t) => t !== type) : [...state.discoverTypes, type];
        if (next.length === 0) return;
        state.discoverTypes = next;
        saveState();
        render();
      });
      typePills[type] = pill.appendChild(el("span", "rl-pill-count"));
      pills.appendChild(pill);
    }
    const savedPill = button("rl-filter-pill saved" + (state.discoverSaved ? " active" : ""), "✓ In Library", () => {
      state.discoverSaved = !state.discoverSaved;
      saveState();
      render();
    });
    typePills.saved = savedPill.appendChild(el("span", "rl-pill-count"));
    pills.appendChild(savedPill);
    view.appendChild(pills);
  }

  const load = () => {
    const params = { q: queries[mode], sort: state.sort[mode], seed: state.seed };
    if (mode === "discover") {
      params.types = state.discoverTypes.join(",");
      if (state.discoverSaved) params.saved = 1;
    }
    const shuffled = state.sort[mode] === "shuffle" ? " shuffled" : "";
    startFeed(mode, params, (data, first) => {
      if (first) {
        const noun = {
          albums: "saved albums",
          artists: "followed artists",
          discover: state.discoverSaved ? "releases" : "releases not in your library",
        }[mode];
        subtitle.textContent = `${data.total} ${noun}${shuffled}${syncedSuffix(mode === "discover" ? meta.releases.syncedAt : meta.library.syncedAt)}`;
        for (const key in typePills) typePills[key].textContent = data.counts?.[key] || 0;
      }
      const fragment = document.createDocumentFragment();
      for (const item of data.items) fragment.appendChild(mode === "artists" ? artistCard(item) : albumCard(item, colors.library));
      grid.appendChild(fragment);
    });
    const source = mode === "discover" ? meta.releases.count : meta.library[mode];
    if (!source) feed.emptyText = `Nothing synced yet. Press Refresh in ${mode === "discover" ? "Release List" : "Random Library"} on the desktop.`;
  };

  const toolbar = el("div", "rl-toolbar");
  toolbar.append(
    searchInput(mode, mode === "discover" && state.discoverSaved ? "Search releases or artists…" : MODES[mode].search, load),
    sortSelect(mode === "artists" ? ARTIST_SORTS : ALBUM_SORTS, state.sort[mode], (value) => {
      state.sort[mode] = value;
      saveState();
      load();
    })
  );
  view.appendChild(toolbar);
  currentLoad = load;
  load();
}

function recordArtist(artist) {
  artistHistory.stack = [...artistHistory.stack.slice(0, artistHistory.index + 1), artist];
  artistHistory.index = artistHistory.stack.length - 1;
}

function stepArtist(delta) {
  const next = artistHistory.stack[artistHistory.index + delta];
  if (!next) return;
  artistHistory.index += delta;
  location.hash = "#/library/artist/" + next.uri.split(":").pop();
}

function renderArtist(artistId) {
  const uri = "spotify:artist:" + artistId;
  const subtitle = el("div", "rl-subtitle", "Loading…");
  view.appendChild(libraryHeader(subtitle));

  view.appendChild(
    button("rl-back", "← Back to Artists", () => {
      artistHistory.stack = [];
      artistHistory.index = -1;
      location.hash = "#/library";
    })
  );

  if (artistHistory.stack.length > 1) {
    const history = el("div", "rl-history");
    const previous = button("rl-btn", "◀ Previous", () => stepArtist(-1));
    const next = button("rl-btn", "Next ▶", () => stepArtist(1));
    previous.disabled = artistHistory.index <= 0;
    next.disabled = artistHistory.index >= artistHistory.stack.length - 1;
    history.append(previous, `${artistHistory.index + 1} of ${artistHistory.stack.length}`, next);
    view.appendChild(history);
  }

  const banner = el("div", "rl-banner");
  const avatar = el("img", "rl-banner-avatar");
  avatar.alt = "";
  const info = el("div", "rl-banner-info");
  const name = el("div", "rl-banner-name");
  const available = el("div", "rl-subtitle");
  info.append(name, available);
  const artistPage = el("a", "rl-btn", "Artist Page");
  artistPage.href = spotifyLink(uri);
  banner.append(avatar, info, artistPage);
  view.appendChild(banner);

  const pillCounts = {};
  const pills = el("div", "rl-pills");
  for (const [key, label] of ARTIST_FILTERS) {
    const pill = button(
      "rl-filter-pill" + (key === "has_editions" ? " editions" : "") + (state.artistFilter === key ? " active" : ""),
      label,
      () => {
        state.artistFilter = key;
        saveState();
        render();
      }
    );
    pillCounts[key] = pill.appendChild(el("span", "rl-pill-count"));
    pills.appendChild(pill);
  }
  view.appendChild(pills);

  const search = searchInput("artist", "Search releases…", () => load());
  const toolbar = el("div", "rl-toolbar");
  toolbar.appendChild(search);
  view.appendChild(toolbar);

  const load = () => {
    startFeed("artist", { uri, filter: state.artistFilter, q: queries.artist }, (data, first) => {
      if (first) {
        name.textContent = data.artist.name;
        if (data.artist.imageUrl) avatar.src = data.artist.imageUrl;
        available.textContent = `${data.counts.all} releases available`;
        subtitle.textContent = `${data.counts.all} releases for ${data.artist.name}`;
        search.placeholder = `Search in ${data.artist.name} releases…`;
        for (const [key] of ARTIST_FILTERS) pillCounts[key].textContent = data.counts[key] || 0;
      }
      const fragment = document.createDocumentFragment();
      for (const item of data.items) fragment.appendChild(albumCard(item, colors.library));
      grid.appendChild(fragment);
    });
    feed.emptyText = "No releases found for this artist.";
  };
  currentLoad = load;
  load();
}

// Random Album and Random Release show the pick before leaving for Spotify
async function randomPick() {
  if (state.mode === "artists") {
    const data = await api("random", { kind: "artist" }).catch(() => null);
    if (!data) return;
    recordArtist(data.artist);
    location.hash = "#/library/artist/" + data.artist.uri.split(":").pop();
    return;
  }
  lastPick =
    state.mode === "discover"
      ? { kind: "discover", types: state.discoverTypes.join(","), ...(state.discoverSaved ? { saved: 1 } : {}) }
      : { kind: "album" };
  showPick();
}

async function showPick() {
  const data = await api("random", lastPick).catch(() => null);
  if (!data) return;
  const album = data.album;
  const art = $("pickArt");
  art.textContent = "";
  if (album.imageUrl) {
    const img = el("img", "rl-card-artwork");
    img.src = album.imageUrl;
    img.alt = album.name;
    art.appendChild(img);
  }
  $("pickTitle").textContent = album.name;
  $("pickArtist").textContent = album.artist + (album.releaseDate ? " · " + album.releaseDate.slice(0, 4) : "");
  $("pickOpen").href = spotifyLink(album.uri);
  $("pickModal").hidden = false;
}

// ---------------------------------------------------------------------------
// Release List
// ---------------------------------------------------------------------------
// First day inside an N-day range. Release List dates a release at midday local time and
// keeps it when that is within the last N days, so the cut-off day depends on the time of day.
function rangeStart(days) {
  const cutoff = new Date(Date.now() - days * DAY_MS);
  if (cutoff.getHours() >= 12 && (cutoff.getHours() > 12 || cutoff.getMinutes() > 0 || cutoff.getSeconds() > 0)) {
    cutoff.setDate(cutoff.getDate() + 1);
  }
  const pad = (value) => String(value).padStart(2, "0");
  return `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;
}

function releaseCount(count) {
  return count === 1 ? "1 release" : `${count || 0} releases`;
}

function chipRow(label) {
  const row = el("div", "rl-chip-row");
  row.appendChild(el("span", "rl-chip-label", label));
  return row;
}

function renderReleases() {
  const rel = state.rel;
  const update = (changes) => {
    Object.assign(rel, changes);
    saveState();
    render();
  };

  const header = el("div", "rl-header");
  const titleBlock = el("div");
  const subtitle = el("div", "rl-subtitle", "Loading…");
  titleBlock.append(el("div", "rl-title", "Release List"), subtitle);
  const controls = el("div", "rl-controls");
  controls.appendChild(button("rl-btn", "Settings", openSettings, ICONS.gear));
  header.append(titleBlock, controls);
  view.appendChild(header);

  const panel = el("div", "rl-panel");
  const toolbar = el("div", "rl-toolbar");
  toolbar.append(
    searchInput("releases", "Search releases by artist or title…", () => load()),
    button("rl-btn", rel.sort === "oldest" ? "Oldest First ▾" : "Newest First ▾", () => update({ sort: rel.sort === "oldest" ? "newest" : "oldest" }))
  );
  panel.appendChild(toolbar);

  const ranges = chipRow("Range:");
  for (const [days, label] of RANGES) {
    ranges.appendChild(button("rl-chip" + (rel.days === days ? " active" : ""), label, () => update({ days })));
  }
  panel.appendChild(ranges);

  if (rel.days === -1) {
    const custom = chipRow("From:");
    for (const key of ["from", "to"]) {
      const input = el("input", "rl-date");
      input.type = "date";
      input.value = rel[key];
      input.addEventListener("change", () => update({ [key]: input.value }));
      custom.appendChild(input);
      if (key === "from") custom.appendChild(el("span", "rl-chip-label", "To:"));
    }
    panel.appendChild(custom);
  }

  const types = chipRow("Types:");
  for (const type of RELEASE_TYPES) {
    const active = rel.types.includes(type);
    types.appendChild(
      button("rl-chip" + (active ? " active" : ""), (active ? "✓ " : "") + TYPE_PLURALS[type], () => {
        const next = active ? rel.types.filter((t) => t !== type) : [...rel.types, type];
        if (next.length) update({ types: next });
      })
    );
  }
  types.appendChild(button("rl-chip saved" + (rel.saved ? " active" : ""), "✓ In Library", () => update({ saved: !rel.saved })));
  panel.appendChild(types);
  view.appendChild(panel);

  const load = () => {
    const params = { q: queries.releases, sort: rel.sort, types: rel.types.join(",") };
    if (rel.days > 0) params.from = rangeStart(rel.days);
    if (rel.days === -1) Object.assign(params, { from: rel.from, to: rel.to });
    if (rel.saved) params.saved = 1;
    if (state.settings.groupBy) params.group = state.settings.groupBy;
    if (state.settings.releasesOrder) params.order = state.settings.releasesOrder;

    let lastDate = null;
    let lastType = null;
    startFeed("releases", params, (data, first) => {
      if (first) subtitle.textContent = `${data.total} releases${syncedSuffix(meta.releases.syncedAt)}`;
      const fragment = document.createDocumentFragment();
      for (const item of data.items) {
        const counts = data.dayCounts[item.day] || {};
        if (data.group === "type") {
          // One section per release type, with no day headings
          if (item.type !== lastType) {
            lastType = item.type;
            const group = el("div", "rl-group-header");
            group.append(typeBadge(item.type, colors.releases), el("span", "rl-group-count", releaseCount(data.typeCounts[item.type])));
            fragment.appendChild(group);
          }
        } else {
          if (item.day !== lastDate) {
            lastDate = item.day;
            lastType = null;
            const group = el("div", "rl-group-header", dayHeader(item.day));
            group.appendChild(el("span", "rl-group-count", releaseCount(counts.total)));
            fragment.appendChild(group);
          }
          if (data.group === "date_type" && item.type !== lastType) {
            lastType = item.type;
            const subgroup = el("div", "rl-subgroup-header");
            subgroup.append(typeBadge(item.type, colors.releases), `(${counts[item.type] || 0})`);
            fragment.appendChild(subgroup);
          }
        }
        fragment.appendChild(albumCard(item, colors.releases));
      }
      grid.appendChild(fragment);
    });
    if (!meta.releases.count) feed.emptyText = "Nothing synced yet. Press Refresh in Release List on the desktop.";
  };
  currentLoad = load;
  load();
}

// ---------------------------------------------------------------------------
// Settings (kept on this device; unset values follow what the Spicetify apps synced)
// ---------------------------------------------------------------------------
function applyColors() {
  const custom = state.settings.colors;
  colors = {
    library: { ...DEFAULT_COLORS.library, ...meta.library.groupColors, ...custom },
    releases: { ...DEFAULT_COLORS.releases, ...meta.releases.settings?.groupColors, ...custom },
  };
}

function updateFilters(changes) {
  Object.assign(state.rel, changes);
  saveState();
  render();
}

function settingsSection(title) {
  const section = el("div", "rl-settings-section");
  section.appendChild(el("div", "rl-settings-title", title));
  return section;
}

function settingsSelect(label, options, key) {
  const field = el("label", "rl-settings-field", label);
  const synced = meta.releases.settings?.[key] || options[0][0];
  const select = el("select", "rl-sort");
  for (const [value, text] of options) select.add(new Option(text, value));
  select.value = state.settings[key] || synced;
  select.addEventListener("change", () => {
    state.settings[key] = select.value === synced ? null : select.value;
    saveState();
    render();
  });
  field.appendChild(select);
  return field;
}

function settingsRow(label, value) {
  const row = el("label", "rl-settings-row");
  row.append(label, value);
  return row;
}

function syncedTime(value) {
  return value ? new Date(value).toLocaleString() : "never";
}

function openSettings() {
  const card = $("settingsCard");
  card.textContent = "";
  card.appendChild(el("div", "rl-pick-title", "Settings"));

  const general = settingsSection("General");
  const range = el("label", "rl-settings-field", "Default Filter Range");
  const rangeSelect = el("select", "rl-sort");
  for (const [days, label] of RANGES) {
    // Custom is picked from the range chips, where its dates are entered
    if (days !== -1 || state.rel.days === -1) rangeSelect.add(new Option(label, days));
  }
  rangeSelect.value = state.rel.days;
  rangeSelect.addEventListener("change", () => updateFilters({ days: Number(rangeSelect.value) }));
  range.appendChild(rangeSelect);
  const sorting = el("label", "rl-settings-field", "Release Date Sorting");
  const sortingSelect = el("select", "rl-sort");
  sortingSelect.add(new Option("Newest Releases First", "newest"));
  sortingSelect.add(new Option("Oldest Releases First", "oldest"));
  sortingSelect.value = state.rel.sort === "oldest" ? "oldest" : "newest";
  sortingSelect.addEventListener("change", () => updateFilters({ sort: sortingSelect.value }));
  sorting.appendChild(sortingSelect);
  general.append(range, sorting, el("div", "rl-settings-note", "What Release List opens with on this device. The filter chips change the same values."));

  const included = settingsSection("Included Release Types");
  const includedRow = el("div", "rl-chip-row");
  for (const type of RELEASE_TYPES) {
    const active = state.rel.types.includes(type);
    includedRow.appendChild(
      button("rl-chip" + (active ? " active" : ""), (active ? "✓ " : "") + TYPE_PLURALS[type], () => {
        const next = active ? state.rel.types.filter((t) => t !== type) : [...state.rel.types, type];
        if (next.length === 0) return;
        updateFilters({ types: next });
        openSettings();
      })
    );
  }
  included.appendChild(includedRow);

  const grouping = settingsSection("Feed Grouping");
  grouping.append(
    settingsSelect("Group Feed By:", GROUP_MODES, "groupBy"),
    settingsSelect("Order Within Groups:", GROUP_ORDERS, "releasesOrder"),
    el("div", "rl-settings-note", "Defaults follow the desktop app.")
  );

  const colorSection = settingsSection("Release Type Colors");
  for (const type of RELEASE_TYPES) {
    const picker = el("input", "rl-color-picker");
    picker.type = "color";
    picker.value = colors.releases[type];
    const badge = el("span");
    badge.appendChild(typeBadge(type, colors.releases));
    picker.addEventListener("change", () => {
      state.settings.colors = { ...colors.releases, [type]: picker.value };
      saveState();
      applyColors();
      render();
      openSettings();
    });
    colorSection.appendChild(settingsRow(badge, picker));
  }
  const reset = button("rl-btn", "Use Synced Colors", () => {
    state.settings.colors = null;
    saveState();
    applyColors();
    render();
    openSettings();
  });
  reset.disabled = !state.settings.colors;
  colorSection.append(
    reset,
    el("div", "rl-settings-note", state.settings.colors ? "Using custom colors on this device." : "Following the colors set in the desktop apps.")
  );

  let badgeSection = null;
  if (meta.badges?.enabled) {
    badgeSection = settingsSection("Library Badges");
    const field = el("label", "rl-settings-field", "Navidrome, Plex and Jellyfin Badges");
    const select = el("select", "rl-sort");
    select.add(new Option("Show", "on"));
    select.add(new Option("Hide", "off"));
    select.value = state.settings.badges ? "on" : "off";
    select.addEventListener("change", () => {
      state.settings.badges = select.value === "on";
      saveState();
      render();
    });
    field.appendChild(select);
    const failed = meta.badges.failed?.length ? ` Could not reach ${meta.badges.failed.join(", ")} on the last update.` : "";
    badgeSection.append(
      field,
      el("div", "rl-settings-note", `Marks albums that are in your libraries, with links to download the ones Navidrome doesn't have. Matched on the server, last updated ${syncedTime(meta.badges.builtAt)}.${failed}`)
    );
  }

  const status = settingsSection("Library Status");
  const rows = [
    ["Saved albums", meta.library.albums],
    ["Followed artists", meta.library.artists],
    ["Library synced", syncedTime(meta.library.syncedAt)],
    ["Releases", meta.releases.count],
    ["Releases synced", syncedTime(meta.releases.syncedAt)],
    ["Server version", meta.version ? "v" + meta.version : "unknown"],
  ];
  for (const [label, value] of rows) status.appendChild(settingsRow(label, el("span", "rl-settings-value", String(value))));

  const footer = el("div", "rl-pick-actions");
  footer.appendChild(button("rl-btn primary", "Done", () => ($("settingsModal").hidden = true)));
  card.append(general, grouping, included, colorSection, ...(badgeSection ? [badgeSection] : []), status, footer);
  $("settingsModal").hidden = false;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function render() {
  const [, tab, section, id] = location.hash.split("/");
  const releasesTab = tab === "releases";
  for (const link of $("tabbar").children) link.classList.toggle("active", (link.dataset.tab === "releases") === releasesTab);
  view.textContent = "";
  currentLoad = null;
  if (releasesTab) renderReleases();
  else if (section === "artist" && id) {
    state.mode = "artists";
    renderArtist(id);
  } else renderLibrary();
}

window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  render();
});
document.addEventListener("click", (e) => {
  if (openMenu && !e.target.closest(".rl-edition-menu, .rl-edition-badge, .rl-lib-more")) closeEditionMenu();
});
$("pickAgain").addEventListener("click", showPick);
for (const modal of [$("pickModal"), $("settingsModal")]) {
  modal.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) modal.hidden = true;
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  $("pickModal").hidden = true;
  $("settingsModal").hidden = true;
});

api("meta")
  .then((data) => {
    meta = data;
    applyColors();
    const synced = data.releases.settings || {};
    if (!hasSavedFilters) {
      if (RANGES.some(([days]) => days === synced.defaultRange)) state.rel.days = synced.defaultRange;
      if (synced.sortOrder) state.rel.sort = synced.sortOrder;
      if (Array.isArray(synced.allowedTypes) && synced.allowedTypes.length) state.rel.types = synced.allowedTypes;
    }
  })
  .catch(() => {})
  .finally(() => {
    render();
    connectEvents();
  });
