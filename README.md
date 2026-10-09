# Spicetify Library

A small self-hosted website that mirrors the [Random Library](https://github.com/daviidpaark/random-library) and [Release List](https://github.com/daviidpaark/release-list) Spicetify apps, so you can browse your saved albums, followed artists, and new releases from a phone or any other browser.

The two Spicetify apps push a snapshot of what they already have loaded. The website only reads that snapshot: it makes no Spotify API calls and needs no Spotify login. Tapping an album or artist opens it in Spotify through an `open.spotify.com` link.

## Features

- **Random Library**: shuffled grid of saved albums, followed artists with their discographies, and a Discover mode for releases that are not in your library. Includes search, sorting, edition grouping, and random album and artist picks.
- **Release List**: chronological releases from followed artists, grouped by day, with range, type, and In Library filters.
- **Settings**: feed grouping, order within groups, and release type colors follow the Spicetify apps by default and can be overridden per device. Also shows what is stored on the server and when it was last synced.
- Pages load from the server on demand, so a large catalog stays fast on a phone.
- Installable as an app: in Chrome on Android use **Install app** (or **Add to Home screen**) from the menu; in Safari on iOS use **Share → Add to Home Screen**. Installing needs the site served over HTTPS.

Artist discographies and Discover are built from the catalog Release List has synced, so they cover the releases inside its sync window.

## How It Works

The container listens on two ports:

| Port | Purpose |
| --- | --- |
| `8080` | Read-only website. Safe to put behind a reverse proxy. |
| `8081` | Same website plus the sync endpoint the Spicetify apps push to. Keep this on your local network. |

Anything on your network that can reach the sync port can replace the stored snapshot, so do not expose it publicly. Web pages other than Spotify's desktop client are refused by the browser. The read-only port has no authentication; anyone who can reach it can see your library.

## Install

### Docker Compose

```yaml
services:
  spicetify-library:
    image: ghcr.io/daviidpaark/spicetify-library:latest
    container_name: spicetify-library
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "8081:8081"
    volumes:
      - ./data:/data
```

```bash
docker compose up -d
```

The snapshot is stored in the `/data` volume and survives restarts. The container runs as UID `1000`, so the mounted folder must be writable by that user.

Behind a reverse proxy on the same Docker network, proxy your public hostname to `spicetify-library:8080` and publish only port `8081` to the host.

To build the image yourself, replace `image:` with `build: .` in a clone of this repository.

### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Read-only website port |
| `SYNC_PORT` | `8081` | Website and sync endpoint port |
| `DATA_DIR` | `/data` | Where snapshots are stored |
| `SYNC_ORIGIN` | `https://xpui.app.spotify.com` | Browser origin allowed to push to the sync port (Spotify's desktop client) |

## Syncing From Spotify

1. Open **Settings** in Random Library or Release List inside Spotify.
2. Enter the sync address, for example `http://192.168.1.100:8081`. The address is shared between the two apps.
3. Press **Sync Now** (Random Library) or **Sync to Web Now** (Release List).

After that, each app also pushes automatically whenever you press its **Refresh** button. Random Library sends saved albums and followed artists; Release List sends its release catalog.

## Development

```bash
node server.js
```

Set `DATA_DIR` to a local folder when running outside Docker. There are no dependencies to install. Run the tests with `node --test`.

## Disclaimer

This project is an independent, open-source project and is not affiliated with, sponsored by, or endorsed by Spotify. Spotify is a registered trademark of Spotify AB.

## AI Disclosure

> [!NOTE]
> This is a personal homelab project developed with the assistance of **Claude Code (Claude Opus)**. It is shared publicly for other Spotify and Spicetify users.

## License

[MIT License](LICENSE) © 2026 David Park
