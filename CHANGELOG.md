# Changelog

All notable changes to `spicetify-library` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
