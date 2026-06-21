# pages-bff

Server-side proxy for **GeoGemini**, **speech-to-text**, and **gemini-mcp-maps**. Gateway API keys stay on Vercel only.

## Vercel env (production)

- `AI_API_URL` — `https://api.yucelgumus.dev`
- `GATEWAY_CLIENT_API_KEY` — gateway client key (server only)
- `PAGES_BFF_ALLOWED_ORIGINS` — comma-separated, e.g. `https://yucel-gumus.github.io`

## Routes

| Path | Gateway |
|------|---------|
| `/api/geo/recommend-place` | `/api/recommend-place` |
| `/api/speech/transcribe` | `/api/transcribe` |
| `/api/speech/polish` | `/api/polish` |
| `/api/maps/chat` | `/api/chat` (SSE) |

Static apps use `VITE_BFF_URL=https://pages-bff.vercel.app` (no API keys in bundle).