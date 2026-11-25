# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hugo static site for **Herning Faldskærmsklub** (Herning Skydiving Club). All content is in Danish. Hosted on GitHub Pages at herningfk.dk.

## Build and Development Commands

```bash
# Local development server (with draft posts). --renderToMemory matters: without
# it, Hugo 0.170 writes development builds (localhost URLs) into ./docs/
hugo server --buildDrafts --renderToMemory

# Production build (outputs to ./docs/)
HUGO_ENV=production hugo
```

Requires Hugo, Dart Sass (the theme compiles its CSS with it) and Go (for Hugo Modules): `brew install hugo dart-sass go`.

## Deployment

There is no CI/CD. The site is built locally and the `docs/` directory is committed directly to git. GitHub Pages serves from the `docs/` folder on `main`. After making changes:

1. Run `HUGO_ENV=production hugo`
2. Commit the updated `docs/` directory along with source changes

The custom domain (`herningfk.dk`) is set via `docs/CNAME`.

## Architecture

- **Hugo config**: `hugo.toml` is the primary config. `config.toml` is a legacy leftover and can be ignored.
- **Theme**: Ananke v2.19.1 via Go Modules (`github.com/gohugo-ananke/ananke/v2` in `go.mod`; the theme moved there from `theNewDynamic/gohugo-theme-ananke` in April 2026). Update with `hugo mod get github.com/gohugo-ananke/ananke/v2@<version> && hugo mod tidy`. No git submodules despite `.gitmodules` existing (empty file).
- **Theme hooks** in `layouts/_partials/hooks/` (Ananke's hook system; prefer this over overriding theme partials):
  - `head-end.html` — adds `og:image`/`twitter:image` from `featured_image`, since Hugo's built-in Open Graph template only reads `images`
  - `article/section-link.html` — intentionally empty; hides the section label ("BLOG") above article titles
  - `header-after.html` — the leaderboard ticker directly under the header image, on the home page only
- **Custom CSS**: `assets/ananke/css/hfk.css`, registered via `[params.ananke] custom_css` in `hugo.toml` and bundled into the theme stylesheet. Styles the "Læs mere" link as a dark green pill button, and the leaderboard.
- **Leaderboard ("Årets springere")**: the year's most active jumpers, fetched in the browser from a separate leaderboard service (Connect RPC, `POST …/itadvice.leaderboard.v1alpha1.LeaderboardService/GetLeaderboard`). Two views, both rendered by `layouts/_partials/leaderboard.html` and filled in by `assets/js/leaderboard.js`:
  - **Ticker** on the home page, directly under the header image (`hooks/header-after.html`): the top ten scroll sideways, pause on hover, and the whole band links to `/rangliste/`. Narrow screens shorten the label to "🏆 2026". With reduced motion the list stands still.
  - **Podium** with confetti on `/rangliste/` (`content/da/rangliste.md`, via the `leaderboard` shortcode): the top three, with places 4–10 in a table below. If the lower entries are missing or malformed, only the table is left out.
  - Styles in `hfk.css`, settings in `[params.leaderboard]` in `hugo.toml`.
  - It must fail silently: the markup is rendered `hidden` and the script only reveals it once valid data has loaded. If the service is down, slow (5 s timeout), blocked by CORS or returns bad data, visitors see nothing. Keep it that way, and don't add a menu link (a static link would lead to an empty page when the service is down).
  - Public scope: the top ten, in both the ticker and on `/rangliste/` (ties included, so it can be a few more people). The full list is not published.
  - Until the new year has at least three jumpers, last year's leaderboard is shown.
  - `hugo server` uses `api_dev` (`http://localhost:9080`); production builds use `api`. The service's CORS config must allow `https://herningfk.dk` and `http://localhost:1313`.
- **Danish translations**: `i18n/da.toml`. Ananke ships no Danish strings, so without this file theme labels render empty or in English. When upgrading the theme, compare it with the theme's `i18n/en.toml` for new keys.
- **Template override**: `layouts/summary-with-image.html` is a copy of the theme's template with the hardcoded English "By" and image alt text translated. When upgrading the theme, diff it against the new theme version.
- **Content**: All under `content/da/` (single language, Danish). Uses YAML front matter (`---`). Posts are in `content/da/post/`.
- **Custom shortcodes** in `layouts/shortcodes/`:
  - `button.html` — styled button with `text` and `link` params
  - `hfkform.html` — contact form using Formspree
  - `leaderboard.html` — leaderboard podium (default) or `view="ticker"`; see Leaderboard above
  - `rawhtml.html` — raw HTML passthrough
- **Images**: Hosted externally on Cloudinary (`res.cloudinary.com/dzanurchx/`), not stored in the repo.
- **Static assets**: Favicons and PDFs (meeting minutes, bylaws) in `static/`.

## Content Conventions

- Front matter fields: `date`, `publishDate`, `lastmod`, `featured_image`, `author`, `tags`, `title`, `description`
- Use `<!--more-->` tag in posts for summary truncation
- The archetype (`archetypes/default.md`) uses TOML front matter, but existing content uses YAML — use YAML for consistency with existing posts
- External bookings link to Burble (`bookings.burblesoft.eu`)

## Commit and PR Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`
- PR titles must also follow semantic commit format (e.g. `feat: add new page`)
- NEVER include `Co-Authored-By` or any other mention of Claude/AI in commits
