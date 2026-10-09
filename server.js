// Spicetify Library: a browsable mobile copy of the Random Library and Release List
// Spicetify apps, built from snapshots those apps push on Refresh.
// PORT is read-only and safe to publish; SYNC_PORT also accepts pushes and stays on the LAN.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { version: APP_VERSION } = require("./package.json");

const PORT = Number(process.env.PORT) || 8080;
const SYNC_PORT = Number(process.env.SYNC_PORT) || 8081;
const DATA_DIR = process.env.DATA_DIR || "/data";
// Only Spotify's desktop client may push from a browser context, so a web page opened on a
// LAN device cannot overwrite the snapshots
const SYNC_ORIGIN = process.env.SYNC_ORIGIN || "https://xpui.app.spotify.com";
const PUBLIC_DIR = path.join(__dirname, "public");
const LIBRARY_FILE = path.join(DATA_DIR, "library.json");
const RELEASES_FILE = path.join(DATA_DIR, "releases.json");
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_PAGE_SIZE = 200;
const MAX_ORDER_CACHE = 8;
const EP_MIN_TRACKS = 4;
const DAY_MS = 86400000;
const RELEASE_TYPES = ["album", "ep", "single"];
// Release List's feed grouping and order-within-group settings; the first entry is the default
const GROUP_MODES = ["date", "date_type", "type"];
const GROUP_ORDERS = ["artist", "album-group", "time"];

function oneOf(value, allowed) {
  return allowed.includes(value) ? value : allowed[0];
}

const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/icon.svg": ["icon.svg", "image/svg+xml"],
};

// The Spicetify apps push from Spotify's own origin, so the sync port answers CORS preflights
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SYNC_ORIGIN,
  Vary: "Origin",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};

// ---------------------------------------------------------------------------
// Title and search normalization (kept identical to Random Library)
// ---------------------------------------------------------------------------
function normalizeAlbumTitle(title) {
  if (!title) return "";
  return String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['"’“”`]/g, "")
    .replace(/\s*[\(\[\{][^\)\]\}]*(deluxe|expanded|anniversary|remaster|special|bonus|clean|explicit|edition|re-?issue|reissue|mono|stereo|version|cut|box set|collector|live)[^\)\]\}]*[\)\]\}]/gi, "")
    .replace(/\s*-\s*.*(deluxe|expanded|anniversary|remaster|special|bonus|clean|explicit|edition|re-?issue|reissue|mono|stereo|version|cut|box set|collector).*/gi, "")
    .replace(/\s*[\(\[\{]\d{4}[\)\]\}]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getEditionInfo(name) {
  const lower = String(name || "").toLowerCase();
  const isDeluxe = /deluxe|director'?s cut|expanded|complete|special edition|bonus/.test(lower);
  const isRemaster = /remaster|anniversary|re-?issue|mix/.test(lower);
  return { isDeluxe, isRemaster };
}

function normalizeSearch(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\$/g, "s").trim();
}

function compactSearch(normalized) {
  return normalized.replace(/[^\p{L}\p{N}]/gu, "");
}

function createMatcher(rawQuery) {
  const query = normalizeSearch(rawQuery);
  if (!query) return null;
  const compact = compactSearch(query);
  return (item) => item._search.includes(query) || (compact !== "" && item._compact.includes(compact));
}

// ---------------------------------------------------------------------------
// Snapshot storage and derived indexes
// Index fields (prefixed with _) are added to the snapshot objects after they are written
// to disk, and are never serialized: responses pick their fields explicitly.
// ---------------------------------------------------------------------------
const ALBUM_FIELDS = ["uri", "name", "artist", "artistUri", "imageUrl", "type", "releaseDate", "trackCount"];

let library = { syncedAt: null, albums: [], artists: [], groupColors: null };
let releases = { syncedAt: null, items: [], settings: {} };
let index = null;
const orderCache = new Map();

function text(value) {
  return typeof value === "string" ? value : "";
}

// Entries can carry spotify:image: URIs, which only resolve inside the desktop client.
// Anything that is not an https address is dropped.
function imageUrl(value) {
  const url = text(value);
  if (url.startsWith("spotify:image:")) return "https://i.scdn.co/image/" + url.slice(14);
  return url.startsWith("https://") ? url : "";
}

function cleanAlbums(input) {
  if (!Array.isArray(input)) return [];
  const albums = [];
  for (const entry of input) {
    if (!entry || !text(entry.uri).startsWith("spotify:album:")) continue;
    const trackCount = Number(entry.trackCount) || 0;
    let type = RELEASE_TYPES.includes(entry.type) ? entry.type : "album";
    if (type === "single" && trackCount >= EP_MIN_TRACKS) type = "ep";
    albums.push({
      uri: entry.uri,
      name: text(entry.name),
      artist: text(entry.artist),
      artistNames: Array.isArray(entry.artistNames) ? entry.artistNames.filter((n) => typeof n === "string") : [],
      artistUri: text(entry.artistUri),
      imageUrl: imageUrl(entry.imageUrl),
      type,
      releaseDate: text(entry.releaseDate) || text(entry.year),
      trackCount,
    });
  }
  return albums;
}

function cleanArtists(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry) => entry && text(entry.uri).startsWith("spotify:artist:"))
    .map((entry) => ({ uri: entry.uri, name: text(entry.name), imageUrl: imageUrl(entry.imageUrl) }));
}

function cleanColors(input) {
  if (!input || typeof input !== "object") return null;
  const colors = {};
  for (const type of RELEASE_TYPES) {
    if (/^#[0-9a-f]{6}$/i.test(input[type])) colors[type] = input[type];
  }
  return colors;
}

function parseDate(dateStr) {
  const [year, month = 1, day = 1] = dateStr.split("-").map(Number);
  return year > 0 ? new Date(year, month - 1, day).getTime() : 0;
}

function withSearch(item, searchText) {
  item._search = normalizeSearch(searchText);
  item._compact = compactSearch(item._search);
  return item;
}

function rebuildIndex() {
  orderCache.clear();

  const savedUris = new Set();
  const savedNames = new Set(); // "artist:normalized title", matches any edition
  const savedExactNames = new Set(); // "artist:exact title"
  const albums = library.albums.map((a) => withSearch(a, `${a.name} ${a.artist}`));
  for (const a of albums) {
    savedUris.add(a.uri);
    const normTitle = normalizeAlbumTitle(a.name);
    const artistKeys = [...new Set([a.artist, ...a.artistNames])].map(normalizeAlbumTitle).filter(Boolean);
    for (const key of artistKeys) {
      if (normTitle) savedNames.add(`${key}:${normTitle}`);
      if (a.name) savedExactNames.add(`${key}:${a.name.toLowerCase().trim()}`);
    }
  }

  const artists = library.artists.map((a) => withSearch(a, a.name));

  // Artist lookups fall back to the name for snapshots that carry no artist URI
  const byArtist = new Map();
  const addByArtist = (key, item) => {
    if (!key) return;
    const list = byArtist.get(key);
    if (list) list.push(item);
    else byArtist.set(key, [item]);
  };
  const artistKeyCache = new Map();
  const artistKeyOf = (name) => {
    let key = artistKeyCache.get(name);
    if (key === undefined) {
      key = normalizeAlbumTitle(name);
      artistKeyCache.set(name, key);
    }
    return key;
  };

  const items = releases.items.map((r) => {
    const item = withSearch(r, `${r.name} ${r.artist}`);
    item._time = parseDate(r.releaseDate);
    item._artistKey = artistKeyOf(r.artist);
    item._savedKey = `${item._artistKey}:${normalizeAlbumTitle(r.name) || r.name.toLowerCase().trim()}`;
    addByArtist(r.artistUri || "name:" + item._artistKey, item);
    return item;
  });

  index = { albums, artists, items, byArtist, savedUris, savedNames, savedExactNames, artistKeyOf, discover: null };
}

// Discover pool: catalog releases with no edition saved, editions of one title grouped
function getDiscover() {
  if (index.discover) return index.discover;
  const groups = new Map();
  for (const item of index.items) {
    if (!item.name) continue;
    const group = groups.get(item._savedKey);
    if (group) group.push(item);
    else groups.set(item._savedKey, [item]);
  }

  const pool = [];
  for (const [savedKey, editions] of groups) {
    if (index.savedNames.has(savedKey) || editions.some((e) => index.savedUris.has(e.uri))) continue;
    if (editions.length === 1) {
      pool.push(editions[0]);
      continue;
    }
    // Same preference as the artist view: deluxe, then remaster, then newest
    const ranked = editions
      .map((release) => ({ release, info: getEditionInfo(release.name) }))
      .sort((a, b) => {
        if (a.info.isDeluxe !== b.info.isDeluxe) return a.info.isDeluxe ? -1 : 1;
        if (a.info.isRemaster !== b.info.isRemaster) return a.info.isRemaster ? -1 : 1;
        return b.release.releaseDate.localeCompare(a.release.releaseDate);
      });
    pool.push({
      ...ranked[0].release,
      type: editions.some((e) => e.type === "album") ? "album" : ranked[0].release.type,
      editions: ranked.map(({ release }) => ({ uri: release.uri, name: release.name, isSaved: false })),
    });
  }
  index.discover = pool;
  return pool;
}

// Artist discography with editions of one title merged; the saved edition wins, otherwise
// deluxe, then remaster, then newest
function getDiscography(artist) {
  const artistKey = index.artistKeyOf(artist.name);
  const source = new Map();
  for (const item of index.byArtist.get(artist.uri) || []) source.set(item.uri, item);
  for (const item of index.byArtist.get("name:" + artistKey) || []) source.set(item.uri, item);
  for (const album of index.albums) {
    if (album.artistUri === artist.uri && !source.has(album.uri)) source.set(album.uri, album);
  }

  const groups = new Map();
  for (const album of source.values()) {
    const key = normalizeAlbumTitle(album.name) || album.name.toLowerCase().trim();
    const info = getEditionInfo(album.name);
    const edition = {
      uri: album.uri,
      name: album.name,
      imageUrl: album.imageUrl,
      releaseDate: album.releaseDate,
      isDeluxe: info.isDeluxe,
      isRemaster: info.isRemaster,
      isSaved: index.savedUris.has(album.uri) || index.savedExactNames.has(`${artistKey}:${album.name.toLowerCase().trim()}`),
    };
    const group = groups.get(key);
    if (!group) groups.set(key, { album, type: album.type, editions: [edition] });
    else {
      group.editions.push(edition);
      if (album.type === "album") group.type = "album";
    }
  }

  const discography = [];
  for (const { album, type, editions } of groups.values()) {
    const savedEdition = editions.find((e) => e.isSaved);
    const selected =
      savedEdition ||
      [...editions].sort((a, b) => {
        if (a.isDeluxe !== b.isDeluxe) return a.isDeluxe ? -1 : 1;
        if (a.isRemaster !== b.isRemaster) return a.isRemaster ? -1 : 1;
        return b.releaseDate.localeCompare(a.releaseDate);
      })[0];
    const hasEditions = editions.length > 1;
    const savedIsDeluxe = savedEdition && (savedEdition.isDeluxe || savedEdition.isRemaster);
    discography.push(
      withSearch(
        {
          ...album,
          uri: selected.uri,
          name: selected.name,
          imageUrl: selected.imageUrl || album.imageUrl,
          type,
          isSaved: Boolean(savedEdition),
          hasUpgradeAvailable:
            hasEditions && Boolean(savedEdition) && !savedIsDeluxe && editions.some((e) => e.isDeluxe || e.isRemaster),
          editions: hasEditions ? editions.map((e) => ({ uri: e.uri, name: e.name, isSaved: e.isSaved })) : undefined,
        },
        selected.name
      )
    );
  }
  return discography.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
}

// ---------------------------------------------------------------------------
// Ordering, shuffling and paging
// ---------------------------------------------------------------------------
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, seed) {
  const random = seededRandom(seed);
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Shuffle that gives every artist equal weight: each artist's Nth album, EP and single
// land in round N, so a large discography does not crowd the top of the grid
function shuffleByArtist(list, seed) {
  const nextRound = new Map();
  const keyed = shuffle(list, seed).map((release) => {
    const key = `${release.artistUri || release.artist}|${release.type}`;
    const round = nextRound.get(key) || 0;
    nextRound.set(key, round + 1);
    return { release, round };
  });
  keyed.sort((a, b) => a.round - b.round);
  return keyed.map((k) => k.release);
}

function sortList(list, sort) {
  const sorted = [...list];
  if (sort === "date-desc" || sort === "date-asc") {
    // Undated entries go last in both directions
    const dir = sort === "date-desc" ? -1 : 1;
    sorted.sort((a, b) => {
      if (!a.releaseDate) return b.releaseDate ? 1 : 0;
      if (!b.releaseDate) return -1;
      return dir * a.releaseDate.localeCompare(b.releaseDate);
    });
  } else if (sort === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "name-desc") sorted.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === "artist-asc") sorted.sort((a, b) => a.artist.localeCompare(b.artist));
  else if (sort === "artist-desc") sorted.sort((a, b) => b.artist.localeCompare(a.artist));
  return sorted;
}

// Orderings are cached so paging through one view does not re-sort the whole list
function cachedOrder(key, build) {
  let ordered = orderCache.get(key);
  if (!ordered) {
    ordered = build();
    if (orderCache.size >= MAX_ORDER_CACHE) orderCache.delete(orderCache.keys().next().value);
    orderCache.set(key, ordered);
  }
  return ordered;
}

function orderedList(name, list, params, shuffler = shuffle) {
  const sort = params.get("sort") || "shuffle";
  if (sort === "shuffle") {
    const seed = Number(params.get("seed")) || 1;
    return cachedOrder(`${name}:shuffle:${seed}`, () => shuffler(list, seed));
  }
  return cachedOrder(`${name}:${sort}`, () => sortList(list, sort));
}

function publicAlbum(item, isSaved) {
  const album = {};
  for (const field of ALBUM_FIELDS) album[field] = item[field];
  if (isSaved) album.isSaved = true;
  if (item.editions) album.editions = item.editions;
  if (item.hasUpgradeAvailable) album.hasUpgradeAvailable = true;
  return album;
}

function publicArtist(artist) {
  return { uri: artist.uri, name: artist.name, imageUrl: artist.imageUrl };
}

function page(list, params, map) {
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(params.get("limit")) || 60));
  return { total: list.length, items: list.slice(offset, offset + limit).map(map) };
}

function typeSet(params) {
  const requested = (params.get("types") || "").split(",").filter((t) => RELEASE_TYPES.includes(t));
  return new Set(requested.length ? requested : RELEASE_TYPES);
}

function countTypes(list) {
  const counts = {};
  for (const item of list) counts[item.type] = (counts[item.type] || 0) + 1;
  return counts;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ---------------------------------------------------------------------------
// Query endpoints
// ---------------------------------------------------------------------------
const QUERIES = {
  "/api/meta": () => ({
    version: APP_VERSION,
    library: { syncedAt: library.syncedAt, albums: index.albums.length, artists: index.artists.length, groupColors: library.groupColors },
    releases: { syncedAt: releases.syncedAt, count: index.items.length, settings: releases.settings },
  }),

  "/api/albums": (params) => {
    let list = orderedList("albums", index.albums, params);
    const matcher = createMatcher(params.get("q"));
    if (matcher) list = list.filter(matcher);
    return page(list, params, (a) => publicAlbum(a, true));
  },

  "/api/artists": (params) => {
    const sort = params.get("sort") === "name-desc" ? "name-desc" : params.get("sort") === "name-asc" ? "name-asc" : "shuffle";
    const sortParams = new URLSearchParams({ sort, seed: params.get("seed") || "1" });
    let list = orderedList("artists", index.artists, sortParams);
    const matcher = createMatcher(params.get("q"));
    if (matcher) list = list.filter(matcher);
    return page(list, params, publicArtist);
  },

  "/api/artist": (params) => {
    const uri = params.get("uri") || "";
    const artist = index.artists.find((a) => a.uri === uri);
    if (!artist) return null;
    const discography = cachedOrder(`artist:${uri}`, () => getDiscography(artist));

    const counts = { all: discography.length, saved: 0, has_editions: 0, ...countTypes(discography) };
    for (const a of discography) {
      if (a.isSaved) counts.saved++;
      if (a.editions) counts.has_editions++;
    }

    const filter = params.get("filter") || "all";
    let list = discography;
    if (filter === "saved") list = list.filter((a) => a.isSaved);
    else if (filter === "has_editions") list = list.filter((a) => a.editions);
    else if (filter !== "all") list = list.filter((a) => a.type === filter);
    const matcher = createMatcher(params.get("q"));
    if (matcher) list = list.filter(matcher);

    return { artist: publicArtist(artist), counts, ...page(list, params, (a) => publicAlbum(a, a.isSaved)) };
  },

  "/api/discover": (params) => {
    const types = typeSet(params);
    const typesKey = [...types].sort().join(",");
    const pool = getDiscover();
    const filtered = cachedOrder(`discover-types:${typesKey}`, () => pool.filter((r) => types.has(r.type)));
    let list = orderedList(`discover:${typesKey}`, filtered, params, shuffleByArtist);
    const matcher = createMatcher(params.get("q"));
    if (matcher) list = list.filter(matcher);
    return { counts: countTypes(pool), ...page(list, params, (r) => publicAlbum(r, false)) };
  },

  "/api/releases": (params) => {
    const newestFirst = params.get("sort") !== "oldest";
    // Grouping and order default to the Release List settings that were synced
    const group = oneOf(params.get("group") || releases.settings.groupBy, GROUP_MODES);
    const order = oneOf(params.get("order") || releases.settings.releasesOrder, GROUP_ORDERS);
    const ordered = cachedOrder(`releases:${newestFirst}:${group}:${order}`, () => {
      const byDate = (a, b) => (newestFirst ? b._time - a._time : a._time - b._time);
      const byType = (a, b) => RELEASE_TYPES.indexOf(a.type) - RELEASE_TYPES.indexOf(b.type);
      const byArtist = (a, b) => a.artist.localeCompare(b.artist);
      const within = order === "artist" ? [byArtist] : order === "album-group" ? [byType, byArtist] : [];
      const chain = group === "type" ? [byType, byDate, ...within] : group === "date_type" ? [byDate, byType, ...within] : [byDate, ...within];
      return [...index.items].sort((a, b) => {
        for (const compare of chain) {
          const diff = compare(a, b);
          if (diff) return diff;
        }
        return 0;
      });
    });

    const types = typeSet(params);
    const onlySaved = params.get("saved") === "1";
    const days = Number(params.get("days")) || 0;
    const cutoff = days > 0 ? Date.now() - days * DAY_MS : 0;
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const matcher = createMatcher(params.get("q"));

    const list = ordered.filter(
      (r) =>
        types.has(r.type) &&
        r._time >= cutoff &&
        (!from || r.releaseDate >= from) &&
        (!to || r.releaseDate <= to) &&
        (!onlySaved || index.savedUris.has(r.uri)) &&
        (!matcher || matcher(r))
    );

    const result = page(list, params, (r) => publicAlbum(r, index.savedUris.has(r.uri)));
    // Day and type totals for the headings of the days on this page
    const wanted = new Set(result.items.map((r) => r.releaseDate));
    result.group = group;
    result.typeCounts = countTypes(list);
    result.dayCounts = {};
    for (const r of list) {
      if (!wanted.has(r.releaseDate)) continue;
      const counts = (result.dayCounts[r.releaseDate] ||= { total: 0 });
      counts.total++;
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
    return result;
  },

  "/api/random": (params) => {
    const kind = params.get("kind");
    if (kind === "artist") return index.artists.length ? { artist: publicArtist(pick(index.artists)) } : null;
    if (kind === "discover") {
      // Pick an artist first so a large discography is not favored, then one of their releases
      const types = typeSet(params);
      const byArtist = new Map();
      for (const r of getDiscover()) {
        if (!types.has(r.type)) continue;
        const key = r.artistUri || r.artist;
        const list = byArtist.get(key);
        if (list) list.push(r);
        else byArtist.set(key, [r]);
      }
      if (byArtist.size === 0) return null;
      return { album: publicAlbum(pick(pick([...byArtist.values()])), false) };
    }
    return index.albums.length ? { album: publicAlbum(pick(index.albums), true) } : null;
  },
};

// ---------------------------------------------------------------------------
// Sync endpoints (SYNC_PORT only)
// ---------------------------------------------------------------------------
async function writeSnapshot(file, snapshot) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(file + ".tmp", JSON.stringify(snapshot));
  await fs.promises.rename(file + ".tmp", file);
}

// A bare array is accepted too, which is the shape of Random Library's JSON export
const SYNCS = {
  "/api/library": async (body) => {
    const input = Array.isArray(body) ? { albums: body } : body;
    library = {
      syncedAt: new Date().toISOString(),
      albums: cleanAlbums(input.albums),
      artists: cleanArtists(input.artists),
      groupColors: cleanColors(input.groupColors),
    };
    await writeSnapshot(LIBRARY_FILE, library);
    return { albums: library.albums.length, artists: library.artists.length };
  },
  "/api/releases": async (body) => {
    const input = Array.isArray(body) ? { items: body } : body;
    const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
    releases = {
      syncedAt: new Date().toISOString(),
      items: cleanAlbums(input.items),
      settings: {
        groupColors: cleanColors(settings.groupColors),
        groupBy: oneOf(settings.groupBy, GROUP_MODES),
        releasesOrder: oneOf(settings.releasesOrder, GROUP_ORDERS),
      },
    };
    await writeSnapshot(RELEASES_FILE, releases);
    return { items: releases.items.length };
  },
};

function readSnapshot(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function loadSnapshots() {
  const lib = readSnapshot(LIBRARY_FILE);
  if (lib) {
    const input = Array.isArray(lib) ? { albums: lib } : lib;
    library = {
      syncedAt: input.syncedAt || null,
      albums: cleanAlbums(input.albums),
      artists: cleanArtists(input.artists),
      groupColors: cleanColors(input.groupColors),
    };
  }
  const rel = readSnapshot(RELEASES_FILE);
  if (rel) {
    const input = Array.isArray(rel) ? { items: rel } : rel;
    releases = { syncedAt: input.syncedAt || null, items: cleanAlbums(input.items), settings: input.settings || {} };
  }
  rebuildIndex();
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function send(req, res, status, body, headers = {}) {
  const all = { "Cache-Control": "no-cache", ...headers };
  if (body.length > 1024 && /gzip/.test(req.headers["accept-encoding"] || "")) {
    body = zlib.gzipSync(body);
    all["Content-Encoding"] = "gzip";
    all.Vary = "Accept-Encoding";
  }
  res.writeHead(status, all);
  res.end(body);
}

function sendJson(req, res, status, value, headers) {
  send(req, res, status, JSON.stringify(value), { "Content-Type": "application/json", ...headers });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleSync(req, res, sync) {
  if (req.method === "OPTIONS") return send(req, res, 204, "", CORS_HEADERS);
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") return send(req, res, 400, "expected a JSON snapshot", CORS_HEADERS);
  const result = await sync(body);
  rebuildIndex();
  sendJson(req, res, 200, result, CORS_HEADERS);
}

function createServer(allowWrite) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method !== "GET") {
      const sync = allowWrite && (req.method === "PUT" || req.method === "OPTIONS") ? SYNCS[url.pathname] : null;
      if (!sync) return send(req, res, 405, "read-only");
      handleSync(req, res, sync).catch((err) => {
        console.error("sync failed:", err);
        if (!res.headersSent) send(req, res, 500, "internal error", CORS_HEADERS);
      });
      return;
    }

    const query = QUERIES[url.pathname];
    if (query) {
      try {
        const result = query(url.searchParams);
        return result ? sendJson(req, res, 200, result) : send(req, res, 404, "not found");
      } catch (err) {
        console.error("query failed:", err);
        return send(req, res, 500, "internal error");
      }
    }

    const entry = STATIC_FILES[url.pathname];
    if (!entry) return send(req, res, 404, "not found");
    fs.readFile(path.join(PUBLIC_DIR, entry[0]), (err, data) => {
      if (err) return send(req, res, 404, "not found");
      send(req, res, 200, data, { "Content-Type": entry[1] });
    });
  });
}

if (require.main === module) {
  loadSnapshots();
  const servers = [
    createServer(false).listen(PORT, () => console.log(`Spicetify Library v${APP_VERSION}: read-only site listening on :${PORT}`)),
    createServer(true).listen(SYNC_PORT, () => console.log(`sync endpoint listening on :${SYNC_PORT} (data: ${DATA_DIR})`)),
  ];

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      let open = servers.length;
      for (const server of servers) {
        server.close(() => --open === 0 && process.exit(0));
        server.closeIdleConnections();
      }
    });
  }
}

module.exports = { createServer, loadSnapshots };
