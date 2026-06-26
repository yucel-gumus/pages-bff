# pages-bff

GitHub Pages üzerinde barınan statik SPA’lar için **sunucu tarafı BFF (Backend-for-Frontend)**. Gemini Gateway (`python_backend` / `https://api.yucelgumus.dev`) API anahtarlarını tarayıcı bundle’ına sızdırmadan, Vercel üzerinde güvenli proxy sağlar.

**Canlı:** [pages-bff.vercel.app](https://pages-bff.vercel.app)  
**GitHub:** [yucel-gumus/pages-bff](https://github.com/yucel-gumus/pages-bff)

---

## Hangi uygulamalar kullanır?

| SPA (GitHub Pages) | BFF path | Gateway upstream |
|--------------------|----------|------------------|
| [GeoGemini](https://yucel-gumus.github.io/GeoGemini/) | `POST /api/geo/recommend-place` | `POST /api/recommend-place` |
| [speech-to-text](https://yucel-gumus.github.io/speech-to-text/) | `POST /api/speech/transcribe` | `POST /api/transcribe` |
| | `POST /api/speech/polish` | `POST /api/polish` |
| [gemini-mcp-maps](https://yucel-gumus.github.io/gemini-mcp-maps/) | `POST /api/maps/chat` (SSE) | `POST /api/chat` |

Statik uygulamalarda:

```env
VITE_BFF_URL=https://pages-bff.vercel.app
```

Client tarafında **yalnızca BFF origin**; `GATEWAY_CLIENT_API_KEY` yalnızca Vercel server env’de.

---

## Mimari

```
GitHub Pages SPA (no secrets)
        │  fetch(VITE_BFF_URL + /api/...)
        ▼
Next.js Route Handlers (pages-bff @ Vercel)
        │  gatewayFetch + X-API-Key (server)
        ▼
api.yucelgumus.dev (FastAPI Gateway)
        │
        ▼
Google Gemini / araçlar
```

CORS: `PAGES_BFF_ALLOWED_ORIGINS` ile izin verilen GitHub Pages origin’leri (`https://yucel-gumus.github.io` vb.).

---

## Vercel ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `AI_API_URL` | Evet | `https://api.yucelgumus.dev` |
| `GATEWAY_CLIENT_API_KEY` | Evet | Gateway `CLIENT_API_KEYS` içinden **düz metin** değer (base64 değil) |
| `PAGES_BFF_ALLOWED_ORIGINS` | Evet | Virgülle ayrılmış origin listesi |

Yerel geliştirme: `.env.example` kopyalayın.

---

## Route implementasyonu

Tüm route’lar `lib/gateway.ts` üzerinden:

- `gatewayFetch(path, init)` — upstream’e `X-API-Key` ekler
- `jsonWithCors` / `corsPreflight` — tarayıcı CORS yanıtları

Örnek: `app/api/geo/recommend-place/route.ts` gövdeyi JSON olarak gateway’e iletir ve yanıtı CORS başlıklarıyla döner.

Harita sohbeti (`/api/maps/chat`) SSE akışını gateway’den istemciye aktarır.

---

## Yerel geliştirme

```bash
npm install
cp .env.example .env.local
npm run dev
```

Test için curl:

```bash
curl -X POST http://localhost:3000/api/geo/recommend-place \
  -H "Content-Type: application/json" \
  -H "Origin: https://yucel-gumus.github.io" \
  -d '{"category":"antik","visited":[]}'
```

---

## Güvenlik notları

- Client API key **asla** `VITE_*` ile statik siteye konmamalı
- `GATEWAY_CLIENT_API_KEY` rotasyonunda yalnızca Vercel env güncellenir
- Gateway 403 alıyorsanız: key’in base64 encode edilmediğinden emin olun

---

## Deploy

```bash
git push origin main
# veya: vercel --prod
```

---

## Teknoloji

- Next.js App Router
- TypeScript
- Vercel serverless functions

---

## Lisans

Apache-2.0 veya repo ile aynı lisans.