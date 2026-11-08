const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { createBadges, readConfig } = require("../badges.js");

const NAVIDROME_ALBUMS = [
  { id: "nd1", name: "First Album (Deluxe Edition)", artist: "Artist One", artists: [{ name: "Artist One" }] },
  { id: "nd2", name: "Vanities", artist: "Artist Three" },
];
const PLEX_ALBUMS = [{ ratingKey: "101", title: "Plex Only", parentTitle: "Artist Two" }];
const JELLYFIN_ALBUMS = [{ Id: "jf1", Name: "First Album", AlbumArtist: "Artist One", AlbumArtists: [{ Name: "Artist One" }] }];

let fake;
let base;
let plexDown = false;

function json(res, value) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

before(async () => {
  fake = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const q = url.searchParams;
    if (url.pathname.startsWith("/rest/")) {
      const valid = q.get("u") === "user" && q.get("t") === crypto.createHash("md5").update("secret" + q.get("s")).digest("hex");
      if (!valid) return json(res, { "subsonic-response": { status: "failed", error: { message: "Wrong username or password" } } });
      const albums = q.get("type") === "newest" ? NAVIDROME_ALBUMS.slice(-1) : NAVIDROME_ALBUMS;
      return json(res, { "subsonic-response": { status: "ok", albumList2: { album: albums } } });
    }
    if (url.pathname.startsWith("/plex/")) {
      if (plexDown) {
        res.writeHead(500);
        return res.end();
      }
      if (req.headers["x-plex-token"] !== "token") {
        res.writeHead(401);
        return res.end();
      }
      const route = url.pathname.slice(5);
      if (route === "/identity") return json(res, { MediaContainer: { machineIdentifier: "machine1" } });
      if (route === "/library/sections") return json(res, { MediaContainer: { Directory: [{ key: "1", type: "artist" }, { key: "2", type: "movie" }] } });
      if (route === "/library/sections/1/all") return json(res, { MediaContainer: { Metadata: PLEX_ALBUMS } });
    }
    if (url.pathname === "/jellyfin/Items" && req.headers.authorization === 'MediaBrowser Token="key"') {
      return json(res, { Items: JELLYFIN_ALBUMS });
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => fake.listen(0, resolve));
  base = `http://localhost:${fake.address().port}`;
});

after(() => fake.close());

function config(extra = {}) {
  return readConfig({
    NAVIDROME_URL: base + "/",
    NAVIDROME_LINK_URL: "http://navidrome.example.com:4533",
    NAVIDROME_USER: "user",
    NAVIDROME_PASSWORD: "secret",
    PLEX_URL: base + "/plex",
    PLEX_TOKEN: "token",
    JELLYFIN_URL: base + "/jellyfin",
    JELLYFIN_API_KEY: "key",
    DEEMIX_URL: "http://deemix.example.com:6595",
    TIDARR_URL: "http://tidarr.example.com:8484",
    BANDCAMP_SEARCH: "on",
    ...extra,
  });
}

const album = (id, name, artist, extra = {}) => ({ uri: "spotify:album:" + id, name, artist, artistNames: [artist], ...extra });

test("defaults: no library servers configured means no badges", async () => {
  for (const badges of [createBadges(), createBadges(readConfig({}))]) {
    assert.equal(typeof badges.enabled, "boolean");
    badges.setSpotifyAlbums([]);
    if (!badges.enabled) assert.equal(badges.forAlbum(album("a", "Anything", "Anyone")), null);
    badges.stop();
  }
  const empty = createBadges(readConfig({}));
  assert.equal(empty.enabled, false);
  assert.deepEqual(empty.status(), { enabled: false, builtAt: null, failed: [] });
});

test("albums in a library get its icon with a link, matched across editions", async () => {
  const badges = createBadges(config());
  badges.setSpotifyAlbums([album("saved1", "First Album", "Artist One")]);
  await badges.rebuild();
  const found = badges.forAlbum(album("saved1", "First Album", "Artist One"));
  assert.deepEqual(found.have.map((link) => link.code), ["n", "j"]);
  assert.equal(found.have[0].href, "http://navidrome.example.com:4533/app/#/album/nd1/show");
  assert.equal(found.have[1].href, `${base}/jellyfin/web/#/details?id=jf1`);
  assert.equal(found.get, undefined);
  assert.ok(badges.status().builtAt);
});

test("albums Navidrome lacks get download links, with the preferred downloader first", async () => {
  const badges = createBadges(config({ MUSIC_DOWNLOADER: "t" }));
  await badges.rebuild();
  const plexOnly = badges.forAlbum(album("x1", "Plex Only", "Artist Two"));
  assert.deepEqual(plexOnly.have.map((link) => link.code), ["p"]);
  assert.match(plexOnly.have[0].href, /^https:\/\/app\.plex\.tv\/desktop\/#!\/server\/machine1\/details\?key=%2Flibrary%2Fmetadata%2F101$/);
  assert.deepEqual(plexOnly.get.map((link) => link.code), ["t", "d", "c"]);
  assert.equal(plexOnly.get[0].href, "http://tidarr.example.com:8484/search/Artist%20Two%20Plex%20Only");

  const missing = badges.forAlbum(album("x2", "Nowhere", "Nobody"));
  assert.equal(missing.have, undefined);
  assert.equal(missing.get[1].href, "http://deemix.example.com:6595/search?term=Nobody%20Nowhere");
});

test("a likely Navidrome copy under a longer title is offered as not sure", async () => {
  const badges = createBadges(config());
  await badges.rebuild();
  const found = badges.forAlbum(album("x3", "Vanities (Extended)", "Artist Three"));
  assert.equal(found.maybe.code, "n");
  assert.match(found.maybe.href, /\/album\/nd2\/show$/);
});

test("a server that fails keeps its last list and is reported", async () => {
  const badges = createBadges(config());
  await badges.rebuild();
  plexDown = true;
  try {
    await badges.rebuild();
  } finally {
    plexDown = false;
  }
  assert.deepEqual(badges.status().failed, ["Plex"]);
  assert.deepEqual(badges.forAlbum(album("x1", "Plex Only", "Artist Two")).have.map((link) => link.code), ["p"]);
});

test("wrong Navidrome credentials are reported without breaking the other servers", async () => {
  const badges = createBadges(config({ NAVIDROME_PASSWORD: "wrong" }));
  await badges.rebuild();
  assert.deepEqual(badges.status().failed, ["Navidrome"]);
  assert.deepEqual(badges.forAlbum(album("saved1", "First Album", "Artist One")).have.map((link) => link.code), ["j"]);
});
