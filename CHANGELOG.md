# Changelog

All notable changes to `spicetify-library` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2026-11-08

### Added
- **Library Badges:** Albums can be marked with the Navidrome, Plex and Jellyfin libraries that have them, linking to the album there, like the Library Badges userscript but with no browser extension, so it works on a phone. Albums Navidrome doesn't have get a **↓** to download them with Deemix, Tidarr, slskd or Bandcamp, and a **?** when Navidrome probably has them under another title. The server holds the logins and does the matching; pages only receive links. Configured with the new `NAVIDROME_*`, `PLEX_*`, `JELLYFIN_*`, `DEEMIX_URL`, `TIDARR_URL`, `SLSKD_URL`, `BANDCAMP_SEARCH` and `MUSIC_DOWNLOADER` variables, and turned on per device under **Settings → Library Badges**.
- Album endpoints take `badges=1` to include each album's badges, and `GET /api/meta` reports whether badges are configured, when they were last updated and which servers failed.

## [0.1.7] - 2026-11-06

### Security
- **Sync Port:** Pushes sent from a browser with any origin other than `SYNC_ORIGIN` are refused with `403`. This also stops a web page from reaching the sync port through DNS rebinding, which CORS alone does not block. Pushes without an `Origin` header (`curl`, scripts) still work.
- **Security Headers:** Responses send a `Content-Security-Policy`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`.

## [0.1.6] - 2026-11-06

### Added
- **Live Updates:** Open pages update on their own. The server announces each push from Random Library or Release List on a new `GET /api/events` stream, and the page reloads the current view within a second or two, keeping filters, search and scroll position. The stream closes while the tab is hidden and reconnects, checking for missed pushes, when you come back.

## [0.1.5] - 2026-10-14

### Added
- **Discover In Library Toggle:** Discover has an **In Library** pill, as in Random Library. Turning it on shows the full catalog, with saved releases marked by the In Library badge; Random Album follows the same selection.

### Changed
- `GET /api/discover` and `GET /api/random?kind=discover` take `saved=1` to include saved releases. Discover counts include `saved`, the number of saved releases for the selected types.

## [0.1.4] - 2026-10-09

### Added
- **Release List Defaults:** Settings now includes Default Filter Range, Release Date Sorting, and Included Release Types, as in the desktop app. They change the same values as the filter chips. A device that has not changed a filter yet starts from the values set in the desktop app, which Release List now syncs.

### Fixed
- **Release List Order:** With the day-with-type-subgroups or by-release-type grouping, releases inside each group were re-sorted by artist name. Release List only applies the order-within-groups setting to the plain day timeline and otherwise keeps the catalog order, so the website now does the same and the two lists match.
- **Range Boundary:** The 7 to 90 day ranges were cut off using the server's clock and time zone. The page now works out the first day of the range in the viewer's time zone, using the same midday rule as Release List.
- **Partial Dates:** A release dated only by year or month is grouped with the first day of that period instead of getting its own heading.

### Changed
- `GET /api/releases` takes `from` and `to` days instead of `days`, and returns a normalized `day` for each release.

## [0.1.3] - 2026-10-09

### Changed
- **Icons:** Every icon now comes from a published icon set. The app icon and favicon, the tab bar icons, and the Shuffle button use the same shuffle and calendar icons as the Random Library and Release List sidebar entries, and the In Library check mark is Spotify's own. Sources are credited in the README.

## [0.1.2] - 2026-10-09

### Added
- **Install as an App:** PNG icons and the meta tags phones look for, so the site installs to the home screen with its own icon and opens without browser chrome on Android and iOS.

### Changed
- **Three-Column Grid on Phones:** Screens narrower than 600px always show three cards per row, with a tighter card (smaller text, no track count, edition badge under the artist). The editions list opens as a sheet above the tab bar there.

## [0.1.1] - 2026-10-09

### Added
- **Settings:** A Settings dialog on both screens with Release List's feed grouping (day, day with type subgroups, or release type) and order within groups, release type color pickers, and a Library Status section showing the stored album, artist, and release counts, last sync times, and server version. Choices are kept per device and default to what the Spicetify apps synced.
- **By Release Type Grouping:** Release List can now be grouped by release type alone, matching the desktop app.

### Fixed
- **Sync Origin:** The sync port answered cross-origin requests from any website, so a page opened on a device in the local network could overwrite the snapshots. It now only allows Spotify's desktop client (`SYNC_ORIGIN`).
- **Image Addresses:** Synced image addresses that are not `https` are dropped.
- **Memory:** The catalog is no longer held twice in memory.
- **Shutdown:** Idle connections are closed on stop, so the container exits promptly.

### Changed
- `GET /api/releases` accepts `group` and `order` and reports `group` and `typeCounts`. Release List now also syncs its order-within-groups setting.

## [0.1.0] - 2026-10-09

### Added
- **Random Library:** Shuffled grid of saved albums, followed artists with discographies, and a Discover mode for releases that are not in the library, with search, sorting, edition grouping, and random album and artist picks.
- **Release List:** Chronological releases from followed artists grouped by day and release type, with range, type, and In Library filters.
- **Sync Endpoint:** Random Library and Release List push their library, followed artists, release catalog, badge colors, and grouping setting to a separate port (`8081`) meant for the local network. The website port (`8080`) is read-only.
- **Paged Loading:** The server keeps the snapshots in memory and serves filtered, sorted pages, so large catalogs stay fast on a phone.
