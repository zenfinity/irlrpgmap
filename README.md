# irlrpgmap

A personal map that reveals the world as you explore it — like fog of war in an RPG, but for real life.

Import your location history from Google Takeout and watch your map come alive with the places you've actually been. The more you've explored, the more your map reveals.

![irlrpgmap screenshot](https://www.irlrpgmap.live/screenshot.jpeg)

**[irlrpgmap.live](https://www.irlrpgmap.live)**

---

## How it works

1. Sign up and sign in
2. Export your Timeline from the Google Maps mobile app (since 2024, Timeline is stored on-device, not in the cloud):
   - **Android:** Phone Settings → Location → Timeline → Export Timeline Data
   - **iPhone:** Google Maps → profile icon → Timeline → Export Timeline Data
3. Transfer the exported JSON file to your computer
4. Import it below — repeat for as many exports as you like
5. Your map populates with places you've visited, sized and shaded by familiarity

---

## Stack

- **[SvelteKit](https://svelte.dev)** + Svelte 5 — frontend and server
- **[Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)** — map rendering and fog of war overlay
- **[Neon](https://neon.tech)** — serverless Postgres
- **[Better Auth](https://better-auth.com)** — authentication
- **[PicoCSS](https://picocss.com)** — minimal styling
- **[Vercel](https://vercel.com)** — hosting

---

## Roadmap

- Live location tracking
- Manual place entry
- Granular familiarity levels (explored, searched, heard of)
- Map sharing
- Support for additional location history formats

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
```

---

*Built with [Claude Code](https://claude.ai/code) by Anthropic.*
