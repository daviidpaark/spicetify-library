# Spicetify Library

A small self-hosted website that mirrors the [Random Library](https://github.com/daviidpaark/random-library) and [Release List](https://github.com/daviidpaark/release-list) Spicetify apps, so you can browse your saved albums, followed artists, and new releases from a phone or any other browser.

The two Spicetify apps push a snapshot of what they already have loaded. The website only reads that snapshot: it makes no Spotify API calls and needs no Spotify login. Tapping an album or artist opens it in Spotify through an `open.spotify.com` link.

## Features

- **Random Library**: shuffled grid of saved albums, followed artists with their discographies, and a Discover mode for releases that are not in your library. Includes search, sorting, edition grouping, and random album and artist picks.
- **Release List**: chronological releases from followed artists, grouped by day, with range, type, and In Library filters.
- **Settings**: default filter range, release date sorting, included release types, feed grouping, order within groups, and release type colors follow the Spicetify apps by default and can be changed per device. Also shows what is stored on the server and when it was last synced.
- **Library Badges**: optionally marks albums that are also in your Navidrome, Plex or Jellyfin library, with links to download the ones Navidrome doesn't have, like the [Library Badges](https://github.com/daviidpaark/library-badges) userscript but with no browser extension. See [Library Badges](#library-badges).
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

## Library Badges

The server can mark albums that are also in your music libraries, so a phone without browser extensions gets the same icons as the [Library Badges](https://github.com/daviidpaark/library-badges) userscript. The server holds the logins and does the matching; pages only receive the resulting links, so no login ever reaches a browser. Badges are off until at least one library server is configured, and each device turns them on under **Settings → Library Badges**.

Albums in a library get its icon in the cover's corner, linking to the album there. Albums Navidrome doesn't have get a **↓** to your chosen downloader (**▾** lists the others), and a **?** when Navidrome probably has them under another title or credit. Only music is matched, and the Spotify copy is left out because the In Library check already shows it.

The server fetches every album list when it starts and every six hours, and checks each library's newest album every five minutes to pick up additions sooner. A server that can't be reached keeps its last list, and Settings names it.

| Variable | Description |
| --- | --- |
| `NAVIDROME_URL` | Navidrome address the server reaches, for example `http://navidrome:4533` |
| `NAVIDROME_LINK_URL` | Navidrome address in links on the page, if it differs from `NAVIDROME_URL` |
| `NAVIDROME_USER`, `NAVIDROME_PASSWORD` | Navidrome login (a non-admin user is enough) |
| `PLEX_URL`, `PLEX_TOKEN` | Plex server address and token. Links open the album in Plex Web |
| `JELLYFIN_URL`, `JELLYFIN_API_KEY` | Jellyfin address and API key |
| `JELLYFIN_LINK_URL` | Jellyfin address in links on the page, if it differs from `JELLYFIN_URL` |
| `DEEMIX_URL`, `TIDARR_URL`, `SLSKD_URL` | Downloader addresses for the **↓** links, as you open them from your devices |
| `BANDCAMP_SEARCH` | `on` adds a Bandcamp search link |
| `MUSIC_DOWNLOADER` | Which link **↓** opens: `d` Deemix (default), `t` Tidarr, `k` slskd or `c` Bandcamp |

Badges and their links show on both ports, so anyone who can open the read-only site can see which of your albums are in your libraries and the addresses in those links. Links to addresses on your local network only open from devices on it.

## Syncing From Spotify

1. Open **Settings** in Random Library or Release List inside Spotify.
2. Enter the sync address, for example `http://192.168.1.100:8081`. The address is shared between the two apps.
3. Press **Sync Now** (Random Library) or **Sync to Web Now** (Release List).

After that, each app also pushes automatically whenever you press its **Refresh** button. Random Library sends saved albums and followed artists; Release List sends its release catalog. Random Library also pushes in the background whenever Spotify is open and you save or remove an album or follow or unfollow an artist, even when its page is closed.

Open pages update on their own: the server announces each push on `GET /api/events`, and the page reloads the current view in place, keeping filters, search and scroll position. Reverse proxies need to pass that event stream through unbuffered; Caddy and nginx (which honors the `X-Accel-Buffering: no` header) do by default.

## Development

```bash
node server.js
```

Set `DATA_DIR` to a local folder when running outside Docker. There are no dependencies to install. Run the tests with `node --test`.

## Icons

Library badge icons are the same as the Library Badges userscript's: Navidrome, Plex, Tidarr and slskd from [selfh.st/icons](https://selfh.st/icons/) (CC BY 4.0); Jellyfin, Bandcamp and Deezer (for Deemix) from [Simple Icons](https://simpleicons.org/) (CC0).

Icons come from [Material Icons](https://github.com/google/material-design-icons) (Apache 2.0), [Feather](https://github.com/feathericons/feather) (MIT), and the glyph set Spotify's desktop client exposes through Spicetify (`Spicetify.SVGIcons`). The app icon is the Spicetify shuffle glyph on the page background.

## Disclaimer

This project is an independent, open-source project and is not affiliated with, sponsored by, or endorsed by Spotify. Spotify is a registered trademark of Spotify AB.

## AI Disclosure

> [!NOTE]
> This is a personal homelab project developed with the assistance of **Claude Code (Claude Opus)**. It is shared publicly for other Spotify and Spicetify users.

## License

[MIT License](LICENSE) © 2026 David Park
