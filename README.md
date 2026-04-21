# irlrpgmap

A personal map that reveals the world as you explore it — like fog of war in an RPG, but for real life.

Log places you've been and watch your map come alive. The more you've explored a neighborhood, the more the fog lifts — down to its real boundary shape.

![irlrpgmap screenshot](https://www.irlrpgmap.live/screenshot.jpeg?v=2)

**[irlrpgmap.live](https://www.irlrpgmap.live)**

---

## How it works

Sign up, then use the **Wuz Here** button to add places you've been:

- **GPS** — one tap to mark your current location
- **Photo** — select photos from your camera roll; GPS and timestamps are read from EXIF metadata locally, clustered into places, and logged (nothing is uploaded)
- **Search** — find any place by name and pick the date you visited
- **Import** — bulk import your Google Maps Timeline export (JSON) for historical data

In the **World view**, each neighborhood you've visited appears as a soft fog reveal — brighter the more you've explored it. Click a neighborhood to enter the **Area view**, where the real neighborhood boundary becomes a dungeon wall and your visited spots clear the fog inside it.

---

## Stack

- **[SvelteKit](https://svelte.dev)** + Svelte 5 — frontend and server
- **[Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)** — map rendering and fog of war overlay
- **[Neon](https://neon.tech)** — serverless Postgres with PostGIS for neighborhood geometry
- **[Better Auth](https://better-auth.com)** — authentication
- **[PicoCSS](https://picocss.com)** — minimal styling
- **[Vercel](https://vercel.com)** — hosting

---

## Roadmap

- Granular familiarity levels (explored, searched, heard of)
- Map sharing
- Support for additional location history formats
- Re-geocode existing visits with null neighborhood (locality fallback added post-import)

---

## Local development

```sh
npm install
npm run dev
```

Requires a `.env` file with:

```
DATABASE_URL=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:5173
VITE_MAPBOX_TOKEN=...
GH_TOKEN=...
```

---

*Built with [Claude Code](https://claude.ai/code) by Anthropic.*
