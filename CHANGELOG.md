# Changelog

All notable changes to `spicetify-library` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-09

### Added
- **Random Library:** Shuffled grid of saved albums, followed artists with discographies, and a Discover mode for releases that are not in the library, with search, sorting, edition grouping, and random album and artist picks.
- **Release List:** Chronological releases from followed artists grouped by day and release type, with range, type, and In Library filters.
- **Sync Endpoint:** Random Library and Release List push their library, followed artists, release catalog, badge colors, and grouping setting to a separate port (`8081`) meant for the local network. The website port (`8080`) is read-only.
- **Paged Loading:** The server keeps the snapshots in memory and serves filtered, sorted pages, so large catalogs stay fast on a phone.
