const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "spicetify-library-"));
process.env.DATA_DIR = dataDir;
const { createServer, loadSnapshots } = require("../server.js");

const ARTIST = { uri: "spotify:artist:artist1", name: "Artist One", imageUrl: "spotify:image:abc" };
const LIBRARY = {
  albums: [
    { uri: "spotify:album:saved1", name: "First Album", artist: "Artist One", artistUri: ARTIST.uri, type: "album", releaseDate: "2020-05-01", trackCount: 10 },
    { uri: "spotify:album:saved2", name: "Long Single", artist: "Artist Two", type: "single", releaseDate: "2021-01-01", trackCount: 5, imageUrl: "http://example.com/tracker.png" },
    { uri: "spotify:playlist:nope", name: "Not an album" },
  ],
  artists: [ARTIST],
  groupColors: { album: "#112233", ep: "not-a-color" },
};
const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const release = (id, name, extra = {}) => ({
  uri: "spotify:album:" + id, name, artist: "Artist One", artistUri: ARTIST.uri, type: "album", releaseDate: "2019-03-01", trackCount: 9, ...extra,
});
const RELEASES = {
  items: [
    release("saved1", "First Album", { releaseDate: "2020-05-01", trackCount: 10 }),
    release("deluxe1", "First Album (Deluxe Edition)", { releaseDate: "2021-05-01", trackCount: 15 }),
    release("second", "Second Album"),
    release("secondRemaster", "Second Album (2022 Remaster)", { releaseDate: "2022-03-01" }),
    release("new1", "Brand New", { type: "single", releaseDate: todayStr, trackCount: 1 }),
  ],
  settings: { groupColors: { single: "#abcdef" }, groupBy: "date_type" },
};

let publicUrl;
let syncUrl;
const servers = [];

async function listen(allowWrite) {
  const server = createServer(allowWrite);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, resolve));
  return `http://localhost:${server.address().port}`;
}

const get = async (base, route) => {
  const res = await fetch(base + route);
  assert.equal(res.status, 200, route);
  return res.json();
};
const put = (base, route, body) => fetch(base + route, { method: "PUT", body: JSON.stringify(body) });

before(async () => {
  loadSnapshots();
  publicUrl = await listen(false);
  syncUrl = await listen(true);
});

after(() => {
  for (const server of servers) server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("defaults: an empty data folder serves empty results and the page", async () => {
  const meta = await get(publicUrl, "/api/meta");
  assert.equal(meta.library.albums, 0);
  assert.equal(meta.releases.count, 0);
  assert.match(meta.version, /^\d+\.\d+\.\d+$/);
  for (const route of ["/api/albums", "/api/artists", "/api/discover", "/api/releases"]) {
    assert.equal((await get(publicUrl, route)).total, 0, route);
  }
  assert.equal((await fetch(publicUrl + "/api/random")).status, 404);
  assert.match(await (await fetch(publicUrl + "/")).text(), /<title>Spotify Library<\/title>/);
  assert.equal((await fetch(publicUrl + "/server.js")).status, 404);

  const manifest = await get(publicUrl, "/manifest.webmanifest");
  for (const icon of manifest.icons) {
    const res = await fetch(`${publicUrl}/${icon.src}`);
    assert.equal(res.status, 200, icon.src);
    assert.equal(res.headers.get("content-type"), icon.type);
  }
});

test("the public port rejects pushes", async () => {
  assert.equal((await put(publicUrl, "/api/library", LIBRARY)).status, 405);
  assert.equal((await fetch(publicUrl + "/api/library", { method: "OPTIONS" })).status, 405);
  assert.equal((await get(publicUrl, "/api/meta")).library.albums, 0);
});

test("the sync port validates and stores pushes", async () => {
  const preflight = await fetch(syncUrl + "/api/library", { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://xpui.app.spotify.com");
  assert.equal((await fetch(publicUrl + "/api/meta")).headers.get("access-control-allow-origin"), null);
  assert.equal((await fetch(syncUrl + "/api/library", { method: "PUT", body: "not json" })).status, 400);
  assert.deepEqual(await (await put(syncUrl, "/api/library", LIBRARY)).json(), { albums: 2, artists: 1 });
  assert.deepEqual(await (await put(syncUrl, "/api/releases", RELEASES)).json(), { items: 5 });

  const meta = await get(publicUrl, "/api/meta");
  assert.equal(meta.library.albums, 2);
  assert.deepEqual(meta.library.groupColors, { album: "#112233" });
  assert.equal(meta.releases.settings.groupBy, "date_type");
  assert.ok(fs.existsSync(path.join(dataDir, "library.json")));
});

test("albums are searchable, sortable and paged, and long singles become EPs", async () => {
  const sorted = await get(publicUrl, "/api/albums?sort=name-asc&limit=1");
  assert.equal(sorted.total, 2);
  assert.deepEqual(sorted.items.map((a) => a.name), ["First Album"]);
  const second = await get(publicUrl, "/api/albums?sort=name-asc&limit=1&offset=1");
  assert.equal(second.items[0].type, "ep");
  assert.equal(second.items[0].imageUrl, "", "only https image addresses are kept");
  assert.equal("_search" in second.items[0], false, "index fields stay private");
  assert.equal((await get(publicUrl, "/api/albums?q=artist+two")).total, 1);

  const shuffled = await get(publicUrl, "/api/albums?seed=7");
  assert.deepEqual(shuffled.items, (await get(publicUrl, "/api/albums?seed=7")).items);
});

test("artist images are rewritten and discographies merge editions", async () => {
  const artists = await get(publicUrl, "/api/artists");
  assert.equal(artists.items[0].imageUrl, "https://i.scdn.co/image/abc");

  const data = await get(publicUrl, "/api/artist?uri=" + ARTIST.uri);
  assert.equal(data.counts.all, 3);
  assert.equal(data.counts.saved, 1);
  assert.equal(data.counts.has_editions, 2);
  const first = data.items.find((a) => a.name.startsWith("First Album"));
  assert.equal(first.uri, "spotify:album:saved1", "the saved edition is shown");
  assert.equal(first.hasUpgradeAvailable, true);
  const second = data.items.find((a) => a.name.startsWith("Second Album"));
  assert.equal(second.uri, "spotify:album:secondRemaster", "the remaster is preferred when none is saved");
  assert.equal((await get(publicUrl, `/api/artist?uri=${ARTIST.uri}&filter=saved`)).total, 1);
  assert.equal((await fetch(publicUrl + "/api/artist?uri=spotify:artist:missing")).status, 404);
});

test("discover leaves out titles saved in any edition", async () => {
  const data = await get(publicUrl, "/api/discover?types=album,ep,single&sort=name-asc");
  assert.deepEqual(data.items.map((r) => r.name), ["Brand New", "Second Album (2022 Remaster)"]);
  assert.equal(data.items[1].editions.length, 2);
  assert.equal((await get(publicUrl, "/api/discover?types=album")).total, 1);
  assert.equal((await get(publicUrl, "/api/random?kind=discover&types=single")).album.name, "Brand New");
});

test("releases filter by range, type and library, with day counts", async () => {
  const all = await get(publicUrl, "/api/releases");
  assert.equal(all.total, 5);
  assert.equal(all.items[0].name, "Brand New");
  assert.deepEqual(all.dayCounts[todayStr], { total: 1, single: 1 });

  assert.equal((await get(publicUrl, "/api/releases?days=7")).total, 1);
  assert.equal((await get(publicUrl, "/api/releases?types=album")).total, 4);
  assert.equal((await get(publicUrl, "/api/releases?from=2020-01-01&to=2021-12-31")).total, 2);
  const saved = await get(publicUrl, "/api/releases?saved=1");
  assert.deepEqual(saved.items.map((r) => [r.uri, r.isSaved]), [["spotify:album:saved1", true]]);
  assert.equal((await get(publicUrl, "/api/releases?sort=oldest")).items[0].releaseDate, "2019-03-01");
});

test("release grouping follows the synced setting unless the request overrides it", async () => {
  const synced = await get(publicUrl, "/api/releases");
  assert.equal(synced.group, "date_type");
  assert.deepEqual(synced.typeCounts, { single: 1, album: 4 });

  const byType = await get(publicUrl, "/api/releases?group=type");
  assert.equal(byType.group, "type");
  assert.deepEqual(byType.items.map((r) => r.type), ["album", "album", "album", "album", "single"]);
  assert.equal(byType.items[0].releaseDate, "2022-03-01", "newest first inside a type");

  assert.equal((await get(publicUrl, "/api/releases?group=nonsense&order=nonsense")).group, "date");
  assert.equal((await get(publicUrl, "/api/meta")).releases.settings.releasesOrder, "artist");
});

test("snapshots are reloaded from disk", async () => {
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, "releases.json"), "utf8"), /_search|_time/);
  loadSnapshots();
  const meta = await get(publicUrl, "/api/meta");
  assert.equal(meta.library.albums, 2);
  assert.equal(meta.releases.count, 5);
  assert.equal(meta.releases.settings.groupBy, "date_type");
});
