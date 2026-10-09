// Mobile copy of the Random Library and Release List Spicetify apps. All data comes from the
// server in pages; albums and artists open in Spotify through open.spotify.com links.
const BATCH_SIZE = 60;
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
    artistFilter: saved.artistFilter || "all",
    rel: { days: 30, from: "", to: "", types: [...RELEASE_TYPES], saved: false, sort: "newest", ...saved.rel },
    // View settings for this device; null follows what the Spicetify apps synced
    settings: { groupBy: null, releasesOrder: null, colors: null, ...saved.settings },
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
let lastPick = null;
let openMenu = null;

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

async function api(path, params = {}) {
  const res = await fetch(`api/${path}?${new URLSearchParams(params)}`);
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
}

function toggleEditionMenu(card, album) {
  const wasOpenHere = openMenu?.parentElement === card;
  closeEditionMenu();
  if (wasOpenHere) return;
  openMenu = el("div", "rl-edition-menu");
  for (const edition of album.editions) {
    const row = el("a", "rl-edition-item");
    row.href = spotifyLink(edition.uri);
    row.append(el("span", "", edition.name), el("span", "", edition.isSaved ? "✓" : ""));
    openMenu.appendChild(row);
  }
  card.appendChild(openMenu);
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
        toggleEditionMenu(card, album);
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
function startFeed(path, params, onPage) {
  closeEditionMenu();
  grid.textContent = "";
  $("empty").hidden = true;
  feed = { path, params, onPage, offset: 0, done: false, loading: false };
  loadMore();
}

async function loadMore() {
  const current = feed;
  if (!current || current.loading || current.done) return;
  current.loading = true;
  let data;
  try {
    data = await api(current.path, { ...current.params, offset: current.offset, limit: BATCH_SIZE });
  } catch {
    if (current === feed) showEmpty("Could not reach the server.");
    return;
  }
  if (current !== feed) return;

  const first = current.offset === 0;
  current.offset += data.items.length;
  current.done = data.items.length === 0 || current.offset >= data.total;
  current.loading = false;
  current.onPage(data, first);
  if (first && data.total === 0) showEmpty(current.emptyText || "Nothing matches.");
  if ($("sentinel").getBoundingClientRect().top < innerHeight + 800) loadMore();
}

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
    view.appendChild(pills);
  }

  const load = () => {
    const params = { q: queries[mode], sort: state.sort[mode], seed: state.seed };
    if (mode === "discover") params.types = state.discoverTypes.join(",");
    const shuffled = state.sort[mode] === "shuffle" ? " shuffled" : "";
    startFeed(mode, params, (data, first) => {
      if (first) {
        const noun = { albums: "saved albums", artists: "followed artists", discover: "releases not in your library" }[mode];
        subtitle.textContent = `${data.total} ${noun}${shuffled}${syncedSuffix(mode === "discover" ? meta.releases.syncedAt : meta.library.syncedAt)}`;
        for (const type of RELEASE_TYPES) if (typePills[type]) typePills[type].textContent = data.counts?.[type] || 0;
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
    searchInput(mode, MODES[mode].search, load),
    sortSelect(mode === "artists" ? ARTIST_SORTS : ALBUM_SORTS, state.sort[mode], (value) => {
      state.sort[mode] = value;
      saveState();
      load();
    })
  );
  view.appendChild(toolbar);
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
  lastPick = state.mode === "discover" ? { kind: "discover", types: state.discoverTypes.join(",") } : { kind: "album" };
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
  card.append(general, grouping, included, colorSection, status, footer);
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
  if (openMenu && !e.target.closest(".rl-edition-menu, .rl-edition-badge")) closeEditionMenu();
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
  .finally(render);
