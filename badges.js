// Library badges: which albums are also in Navidrome, Plex or Jellyfin, and where to download the rest.
// The server holds the logins and does the matching, so pages only receive links. Matching mirrors the music
// matching of the Library Badges userscript (github.com/daviidpaark/library-badges); change them together.
const crypto = require("node:crypto");

const INDEX_PAGE = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const CHECK_MS = 5 * 60 * 1000;
const FULL_REBUILD_MS = 6 * 60 * 60 * 1000;
const SOURCES = ["n", "p", "j", "s"];
const NAMES = { n: "Navidrome", p: "Plex", j: "Jellyfin", s: "Spotify", d: "Deemix", t: "Tidarr", k: "slskd", c: "Bandcamp" };
const DOWNLOADERS = ["d", "t", "k", "c"];

function readConfig(env = process.env) {
  const value = (key) => String(env[key] || "").trim();
  const url = (key) => value(key).replace(/\/+$/, "");
  return {
    navidromeUrl: url("NAVIDROME_URL"),
    navidromeLinkUrl: url("NAVIDROME_LINK_URL") || url("NAVIDROME_URL"),
    navidromeUser: value("NAVIDROME_USER"),
    navidromePassword: value("NAVIDROME_PASSWORD"),
    plexUrl: url("PLEX_URL"),
    plexToken: value("PLEX_TOKEN"),
    jellyfinUrl: url("JELLYFIN_URL"),
    jellyfinLinkUrl: url("JELLYFIN_LINK_URL") || url("JELLYFIN_URL"),
    jellyfinApiKey: value("JELLYFIN_API_KEY"),
    deemixUrl: url("DEEMIX_URL"),
    tidarrUrl: url("TIDARR_URL"),
    slskdUrl: url("SLSKD_URL"),
    bandcampSearch: value("BANDCAMP_SEARCH").toLowerCase() === "on",
    musicDownloader: DOWNLOADERS.includes(value("MUSIC_DOWNLOADER")) ? value("MUSIC_DOWNLOADER") : "d",
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
function normalizeTitle(title, keepLive = false) {
  return String(title || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['"’“”`]/g, "")
    .replace(/([^\s([{])([([{])/g, "$1 $2")
    .replace(/\s*[([{][^)\]}]*\b(?:deluxe|expanded|anniversary|remaster(?:ed|s)?|special|bonus|clean|explicit|editions?|re-?issue|mono|stereo|versions?|cuts?|box set|collectors?|b[\s-]?sides?|ep|feat|ft|with|dj\s+mix)\b[^)\]}]*[)\]}]/gi, "")
    .replace(/\s*[([{]\s*(?:the\s+)?(?:original\s+|official\s+)?(?:(?:video\s+)?game\s+|motion\s+picture\s+|television\s+|tv\s+|series\s+)?(?:soundtrack|score|ost)(?:\s+album)?\s*[)\]}]/gi, "")
    .replace(/\s*[([{]\s*(?:ost|original\s+soundtrack)\s+from\b[^)\]}]*[)\]}]/gi, "")
    .replace(/\s*[([{]\s*(?:original\s+)?music\s+(?:from|for)\s+(?:and\s+inspired\s+by\s+)?(?:the\s+)?(?:original\s+)?(?:motion\s+picture|film|series|game)\b[^)\]}]*[)\]}]/gi, "")
    .replace(/(\S)\s+(?:original\s+)?(?:(?:video\s+)?game\s+|motion\s+picture\s+)?soundtrack\s*$/i, "$1")
    .replace(/(\S)\s+original\s+(?:motion\s+picture\s+)?score\s*$/i, "$1")
    .replace(/\s*[-:–—]\s*[^-:–—]*\b(?:deluxe|expanded|anniversary|remaster(?:ed|s)?|editions?|re-?issue|b[\s-]?sides?)\b[^-:–—]*$/gi, "")
    .replace(/\s*[([{]\d{4}[)\]}]/g, "")
    .replace(/(^|[-:–—]\s*)(?:recorded\s+)?live\s+(?:at|from|in)\s+(?:the\s+)?/gi, (wording, separator) => (keepLive ? wording : separator))
    .replace(/\s*\+\s*/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\b(?:pt|part)\s+(\d+|[ivx]+)\b/g, "$1")
    .replace(/(\S)\s+(?:original\s+)?(?:(?:video\s+)?game\s+|motion\s+picture\s+)?soundtrack\s*$/, "$1")
    .replace(/\s+(?:\d+(?:st|nd|rd|th)\s+anniversary|(?:super\s+)?deluxe|expanded|(?:\d{4}\s+)?remastered)(?:\s+(?:edition|version))?\s*$/, "")
    .replace(/\s+ep\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKey(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&|\band\b/g, " ")
    .replace(/^\s*the\s+/, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

// Names made only of symbols ("÷", "×", "!!!") have no letters to compare, so they keep their symbols.
function symbolKey(text) {
  const raw = String(text || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  return matchKey(text) || (raw && `~${raw}`);
}

// Title keys for matching, with and without a leading artist name.
function titleKeys(artist, title) {
  const key = matchKey(normalizeTitle(title)) || symbolKey(title);
  const prefix = matchKey(artist);
  return prefix && key.length > prefix.length && key.startsWith(prefix) ? [key, key.slice(prefix.length)] : [key];
}

function albumKeys(artist, title) {
  return titleKeys(artist, title).map((key) => `${symbolKey(artist)}|${key}`);
}

function artistVariants(album) {
  const names = [album.artist, ...(album.artists || [])].filter(Boolean);
  for (const name of [...names]) names.push(...name.split(/\s*(?:,|;|\/|&|\bfeat\.?|\bft\.?|\bwith\b)\s*/i));
  // A disambiguation suffix ("Ugly (UK)") that sites leave off.
  for (const name of [...names]) names.push(name.replace(/\s*\([^)]*\)\s*$/, ""));
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

function recordKeys(item) {
  const keys = artistVariants(item).flatMap((artist) => albumKeys(artist, item.title));
  const ids = [item.releaseId, item.groupId].filter(Boolean).map((id) => `mb:${id}`);
  return [...new Set([...keys, ...ids, ...(item.spotifyIds || []).map((id) => `spotify:${id}`)])];
}

// Copies are grouped by a shared artist and title, a shared MusicBrainz ID, or a title that only one album has on
// each service, when one of them is credited to "Various Artists" or they share an artist.
function sharedCredit(a, b) {
  const open = (record) => !record.artists.length || record.artists.some((artist) => /^various(?:artists)?$/.test(artist));
  return open(a) || open(b) || a.artists.some((artist) => b.artists.includes(artist));
}

// Groups each album's copies across services, so a match on any service's naming shows every service.
function groupAlbums(itemsBySource) {
  const records = [];
  for (const code of SOURCES) {
    for (const item of itemsBySource[code] || []) {
      records.push({
        code,
        id: item.id,
        keys: recordKeys(item),
        ids: [item.releaseId, item.groupId].filter(Boolean),
        title: matchKey(normalizeTitle(item.title)),
        name: normalizeTitle(item.title, true),
        artists: [...new Set(artistVariants(item).map(matchKey))],
        label: `${item.artist || "Unknown artist"} — ${item.title}`,
      });
    }
  }

  const parent = records.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const linkBy = (keysOf) => {
    const first = new Map();
    records.forEach((record, i) => {
      for (const key of keysOf(record)) {
        if (first.has(key)) parent[find(i)] = find(first.get(key));
        else first.set(key, i);
      }
    });
  };
  linkBy((record) => record.keys);
  linkBy((record) => record.ids);
  const byTitle = new Map();
  records.forEach((record, i) => {
    if (record.title.length < 6) return;
    if (!byTitle.has(record.title)) byTitle.set(record.title, []);
    byTitle.get(record.title).push(i);
  });
  for (const list of byTitle.values()) {
    const codes = list.map((i) => records[i].code);
    if (list.length < 2 || new Set(codes).size !== codes.length) continue;
    list.forEach((i, position) => {
      for (const j of list.slice(position + 1)) if (sharedCredit(records[i], records[j])) parent[find(j)] = find(i);
    });
  }

  const groups = [];
  const groupOf = new Map();
  const entries = new Map();
  const titlesByArtist = new Map();
  records.forEach((record, i) => {
    const root = find(i);
    if (!groupOf.has(root)) {
      groupOf.set(root, groups.length);
      groups.push({ _: record.label });
    }
    const group = groupOf.get(root);
    if (!groups[group][record.code]) groups[group][record.code] = record.id;
    for (const key of record.keys) if (!entries.has(key)) entries.set(key, group);
    for (const artist of record.artists) {
      if (!titlesByArtist.has(artist)) titlesByArtist.set(artist, []);
      const titles = titlesByArtist.get(artist);
      if (!titles.some(([name, g]) => name === record.name && g === group)) titles.push([record.name, group]);
    }
  });

  const byTitleKey = new Map();
  for (const [key, group] of entries) {
    const split = key.indexOf("|");
    if (split < 1 || key.includes(":")) continue;
    const title = key.slice(split + 1);
    if (!byTitleKey.has(title)) byTitleKey.set(title, []);
    byTitleKey.get(title).push([key.slice(0, split), group]);
  }
  return { groups, entries, titlesByArtist, byTitle: byTitleKey };
}

function lookupGroup(index, keys) {
  for (const key of keys) if (index.entries.has(key)) return index.groups[index.entries.get(key)];
  return null;
}

// An ID match finds the copy that carries the ID (an album saved on Spotify), which the index may not have grouped
// with a Navidrome copy credited or titled differently, so the artist and title match fills in what it's missing.
function addTitleMatch(byId, byTitle) {
  return byId && byTitle && byId !== byTitle && !byId.n ? { ...byTitle, ...byId } : byId || byTitle;
}

const COMPANION_ONLY = /^(?:the\s+)?(?:remix(?:es|ed)?|instrumentals?|a\s*cappellas?|acapellas?|live\b.*|demos?)(?:\s+(?:album|version|edition|mix(?:es)?))?$|^(?:(?:part|pt|vol|volume|disc|book|chapter)\s+)?(?:\d+|[ivx]+)(?:\s.*)?$/;

function artistTitles(index, artist) {
  return index.titlesByArtist.get(matchKey(artist)) || [];
}

// Matches by artist and title. When no title matches exactly, a library album by the same artist whose title
// continues the release's title counts too, but a separate remix, instrumental or numbered album never stands in for
// the original. A title of two or more words also finds one the library's title ends with.
function lookupAlbum(index, artists, titles, parts = true) {
  const exact = lookupGroup(index, artists.flatMap((artist) => titles.flatMap((title) => albumKeys(artist, title))));
  if (exact) return exact;
  for (const artist of artists) {
    const albums = artistTitles(index, artist);
    for (const title of titles) {
      const name = normalizeTitle(title, true);
      if (name.length < 3) continue;
      const hits = albums.filter(([other]) => (other.startsWith(`${name} `) && !COMPANION_ONLY.test(other.slice(name.length + 1))) || (name.includes(" ") && other.endsWith(` ${name}`)));
      if (hits.length && hits.every(([, group]) => group === hits[0][1])) return index.groups[hits[0][1]];
    }
  }
  const variant = lookupNameVariant(index, artists, titles);
  if (variant || !parts) return variant;
  // A release that combines two ("Towards The End / Where To Find Me", "Folklore I & II") counts when you have either
  // part, and a Portuguese or Spanish "e" or "y" reads as "&".
  const alternatives = titles.flatMap((title) => {
    const pieces = title.split(/\s+[/&+]\s+/);
    const numbered = pieces.map((piece, i) => (i > 0 && /^(?:[ivx]+|\d+)$/i.test(piece) ? pieces[0].replace(/\s+(?:[ivx]+|\d+)$/i, ` ${piece}`) : piece));
    const conjunction = title.replace(/\s+[ey]\s+/gi, " & ");
    return [...(pieces.length > 1 ? numbered : []), ...(conjunction !== title ? [conjunction] : [])];
  }).filter((title) => title.length > 2);
  return alternatives.length ? lookupAlbum(index, artists, alternatives, false) : null;
}

// A full name where the library has a shorter one, or family name first, still matches the same title; compilations
// credited to "Various" match a title only one album in the library has.
function lookupNameVariant(index, artists, titles) {
  for (const artist of artists) {
    const titleHits = (title) => titleKeys(artist, title).flatMap((key) => index.byTitle.get(key) || []);
    if (/^various(?:\s+artists)?$/i.test(artist.trim())) {
      for (const title of titles) {
        const groups = new Set(titleHits(title).map(([, group]) => group));
        if (groups.size === 1) return index.groups[[...groups][0]];
      }
      continue;
    }
    const words = artist.split(/\s+/).map(matchKey).filter(Boolean);
    if (words.length < 2 || words.length > 6) continue;
    const names = new Set([words[0]]);
    if (words.length === 2) names.add(`${words[1]}${words[0]}`);
    for (let mask = 0; mask < 1 << (words.length - 2); mask++) {
      const middle = words.slice(1, -1).filter((_, i) => mask & (1 << i));
      if (middle.length < words.length - 2) names.add([words[0], ...middle, words.at(-1)].join(""));
    }
    for (const title of titles) {
      const hit = titleHits(title).find(([name]) => names.has(name));
      if (hit) return index.groups[hit[1]];
    }
  }
  return null;
}

// An album Navidrome probably has under another credit or title, shown as "not sure" rather than missing.
function possibleAlbum(index, artists, title) {
  const keys = new Set((artists.length ? artists : [""]).flatMap((artist) => titleKeys(artist, title)));
  const groups = new Set([...keys].filter((key) => key.length >= 12).flatMap((key) => (index.byTitle.get(key) || []).map(([, group]) => group)));
  const inNavidrome = [...groups].filter((group) => index.groups[group].n);
  if (inNavidrome.length === 1) return index.groups[inNavidrome[0]];
  const name = normalizeTitle(title, true);
  for (const artist of artists) {
    const hits = artistTitles(index, artist).filter(([other, group]) => index.groups[group].n && other.length >= 4 && name.length >= 4 && (name.startsWith(`${other} `) || other.startsWith(`${name} `)));
    if (hits.length && hits.every(([, group]) => group === hits[0][1])) return index.groups[hits[0][1]];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Library servers
// ---------------------------------------------------------------------------
async function request(url, headers = {}) {
  const host = new URL(url).host;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new Error(err.name === "TimeoutError" ? `${host} timed out` : `could not reach ${host}`);
  }
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${host} answered HTTP ${res.status}`);
  }
  return res.json();
}

const navidrome = {
  configured: (c) => Boolean(c.navidromeUrl && c.navidromeUser && c.navidromePassword),
  async call(c, method, params) {
    const salt = crypto.randomBytes(8).toString("hex");
    const token = crypto.createHash("md5").update(c.navidromePassword + salt).digest("hex");
    const query = new URLSearchParams({ u: c.navidromeUser, t: token, s: salt, v: "1.16.1", c: "spicetify-library", f: "json", ...params });
    const body = (await request(`${c.navidromeUrl}/rest/${method}?${query}`))?.["subsonic-response"];
    if (!body || body.status !== "ok") throw new Error(body?.error?.message || `Navidrome ${method} failed`);
    return body;
  },
  async albums(c) {
    const albums = [];
    for (let offset = 0; ; offset += 500) {
      const body = await this.call(c, "getAlbumList2", { type: "alphabeticalByName", size: "500", offset: String(offset) });
      const page = body.albumList2?.album || [];
      for (const a of page) albums.push({ id: a.id, title: a.name, artist: a.artist, artists: (a.artists || []).map((x) => x.name), releaseId: a.musicBrainzId });
      if (page.length < 500) return albums;
    }
  },
  async latest(c) {
    return (await this.call(c, "getAlbumList2", { type: "newest", size: "1" })).albumList2?.album?.[0]?.id ?? null;
  },
};

const plex = {
  configured: (c) => Boolean(c.plexUrl && c.plexToken),
  get(c, route) {
    return request(`${c.plexUrl}${route}`, { "X-Plex-Token": c.plexToken });
  },
  async sections(c) {
    const data = await this.get(c, "/library/sections");
    return (data?.MediaContainer?.Directory || []).filter((d) => d.type === "artist").map((d) => d.key);
  },
  async machine(c) {
    return (await this.get(c, "/identity"))?.MediaContainer?.machineIdentifier || "";
  },
  async albums(c) {
    const albums = [];
    for (const key of await this.sections(c)) {
      for (let start = 0; ; start += INDEX_PAGE) {
        const data = await this.get(c, `/library/sections/${key}/all?type=9&includeGuids=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${INDEX_PAGE}`);
        const page = data?.MediaContainer?.Metadata || [];
        for (const m of page) {
          const mbid = (m.Guid || []).map((g) => g.id).find((id) => id.startsWith("mbid://"));
          albums.push({ id: m.ratingKey, title: m.title, artist: m.parentTitle, releaseId: mbid ? mbid.slice(7) : null });
        }
        if (page.length < INDEX_PAGE) break;
      }
    }
    return albums;
  },
  async latest(c) {
    const added = await Promise.all((await this.sections(c)).map((key) => this.get(c, `/library/sections/${key}/all?type=9&sort=addedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=1`)));
    return added.map((data) => data?.MediaContainer?.Metadata?.[0]?.ratingKey || "").join(",");
  },
};

const jellyfin = {
  configured: (c) => Boolean(c.jellyfinUrl && c.jellyfinApiKey),
  async items(c, params) {
    const query = new URLSearchParams({ Recursive: "true", IncludeItemTypes: "MusicAlbum", Fields: "ProviderIds", EnableImages: "false", EnableUserData: "false", ...params });
    return (await request(`${c.jellyfinUrl}/Items?${query}`, { Authorization: `MediaBrowser Token="${c.jellyfinApiKey}"` }))?.Items || [];
  },
  async albums(c) {
    const albums = [];
    for (let start = 0; ; start += INDEX_PAGE) {
      const page = await this.items(c, { StartIndex: String(start), Limit: String(INDEX_PAGE) });
      for (const i of page) {
        albums.push({
          id: i.Id,
          title: i.Name,
          artist: i.AlbumArtist,
          artists: (i.AlbumArtists || []).map((a) => a.Name),
          releaseId: i.ProviderIds?.MusicBrainzAlbum || null,
          groupId: i.ProviderIds?.MusicBrainzReleaseGroup || null,
        });
      }
      if (page.length < INDEX_PAGE) return albums;
    }
  },
  async latest(c) {
    return (await this.items(c, { SortBy: "DateCreated", SortOrder: "Descending", Limit: "1" }))[0]?.Id ?? null;
  },
};

const SERVERS = { n: navidrome, p: plex, j: jellyfin };

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
function ownedLink(c, code, id, machine) {
  if (code === "n") return `${c.navidromeLinkUrl}/app/#/album/${encodeURIComponent(id)}/show`;
  if (code === "j") return `${c.jellyfinLinkUrl}/web/#/details?id=${encodeURIComponent(id)}`;
  if (code === "p" && machine) return `https://app.plex.tv/desktop/#!/server/${machine}/details?key=${encodeURIComponent(`/library/metadata/${id}`)}`;
  return "";
}

function downloadLinks(c, artists, title) {
  const query = `${artists[0] || ""} ${title}`.trim();
  const links = {
    d: c.deemixUrl && { href: `${c.deemixUrl}/search?term=${encodeURIComponent(query)}`, title: `Download "${query}" with Deemix` },
    t: c.tidarrUrl && { href: `${c.tidarrUrl}/search/${encodeURIComponent(query)}`, title: `Download "${query}" with Tidarr` },
    k: c.slskdUrl && { href: `${c.slskdUrl}/searches`, title: "Open slskd's search page" },
    c: c.bandcampSearch && { href: `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=a`, title: `Buy "${query}" on Bandcamp` },
  };
  return DOWNLOADERS.filter((code) => links[code])
    .sort((a, b) => (b === c.musicDownloader) - (a === c.musicDownloader))
    .map((code) => ({ code, ...links[code] }));
}

// ---------------------------------------------------------------------------
// Index lifecycle
// ---------------------------------------------------------------------------
function createBadges(config = readConfig(), { onUpdate = () => {} } = {}) {
  const servers = Object.keys(SERVERS).filter((code) => SERVERS[code].configured(config));
  const items = { s: [] };
  const latest = {};
  const errors = {};
  let machine = "";
  let index = null;
  let builtAt = null;
  let building = null;
  let timer = null;
  const results = new Map();

  function regroup() {
    index = groupAlbums(items);
    results.clear();
  }

  async function rebuild() {
    if (building) return building;
    building = (async () => {
      const [fetched, markers] = await Promise.all([
        Promise.allSettled(servers.map((code) => SERVERS[code].albums(config))),
        Promise.all(servers.map((code) => SERVERS[code].latest(config).catch(() => null))),
      ]);
      if (servers.includes("p")) machine = (await plex.machine(config).catch(() => "")) || machine;
      fetched.forEach((result, i) => {
        const code = servers[i];
        // A server that can't be reached right now keeps its last good list
        if (result.status === "fulfilled") {
          items[code] = result.value;
          latest[code] = markers[i];
          delete errors[code];
        } else {
          errors[code] = result.reason.message;
          console.warn(`library badges: ${NAMES[code]} failed: ${result.reason.message}`);
        }
      });
      builtAt = new Date().toISOString();
      regroup();
      onUpdate();
    })().finally(() => {
      building = null;
    });
    return building;
  }

  // Every few minutes a cheap check of each server's newest album decides whether to fetch the full lists again
  async function check() {
    if (building) return;
    const stale = !builtAt || Date.now() - Date.parse(builtAt) > FULL_REBUILD_MS || Object.keys(errors).length > 0;
    if (!stale) {
      const markers = await Promise.all(servers.map((code) => SERVERS[code].latest(config).catch(() => null)));
      if (!markers.some((marker, i) => marker !== null && marker !== latest[servers[i]])) return;
    }
    await rebuild().catch((err) => console.warn(`library badges: rebuild failed: ${err.message}`));
  }

  function forAlbum(album) {
    if (!index || !album?.uri) return null;
    if (results.has(album.uri)) return results.get(album.uri);
    const artists = [...new Set([album.artist, ...(album.artistNames || [])].filter(Boolean))];
    const spotifyId = album.uri.replace("spotify:album:", "");
    const bySpotify = lookupGroup(index, [`spotify:${spotifyId}`]);
    const group = addTitleMatch(bySpotify, lookupAlbum(index, artists, [album.name]));
    const how = bySpotify ? "Spotify album ID" : "artist and title";
    const have = servers
      .filter((code) => group?.[code])
      .map((code) => ({ code, href: ownedLink(config, code, group[code], machine), title: `In ${NAMES[code]} (matched by ${how})` }));
    const missing = servers.includes("n") ? !group?.n : have.length === 0;
    const result = {};
    if (have.length) result.have = have;
    if (missing) {
      const possible = servers.includes("n") && album.name ? possibleAlbum(index, artists, album.name) : null;
      if (possible) result.maybe = { code: "n", href: ownedLink(config, "n", possible.n), title: `Not sure: Navidrome may have this as "${possible._}". Open it to check.` };
      const get = downloadLinks(config, artists, album.name);
      if (get.length) result.get = get;
    }
    const value = Object.keys(result).length ? result : null;
    results.set(album.uri, value);
    return value;
  }

  return {
    enabled: servers.length > 0,
    status: () => ({ enabled: servers.length > 0, builtAt, failed: Object.keys(errors).map((code) => NAMES[code]) }),
    setSpotifyAlbums(albums) {
      items.s = albums.map((a) => ({ id: a.uri, title: a.name, artist: a.artist, artists: a.artistNames, spotifyIds: [a.uri.replace("spotify:album:", "")] }));
      if (index) regroup();
    },
    forAlbum,
    rebuild,
    check,
    start() {
      if (!servers.length || timer) return;
      check();
      timer = setInterval(check, CHECK_MS);
      timer.unref();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { createBadges, readConfig, normalizeTitle, matchKey };
