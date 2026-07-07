# 🛡️ pages-bff (Secure Backend-for-Frontend Gateway Proxy)

pages-bff; GitHub Pages üzerinde barındırılan statik Tek Sayfa Uygulamalarının (SPA), API anahtarlarını tarayıcı tarafına (client bundle) ifşa etmeden merkezi yapay zeka sunucusu (Gemini Gateway) ile güvenli bir şekilde iletişim kurmasını sağlayan, **Next.js 15 & React 19** tabanlı bir **Backend-for-Frontend (BFF)** proxy uygulamasıdır.

---

## 🌟 Neden BFF? (Tasarım Deseni ve Güvenlik)

GitHub Pages gibi statik hosting platformları, çevresel değişkenleri (`.env`) sadece derleme (build-time) aşamasında okuyabilir. Bu durum, istemci koduna gömülen tüm API anahtarlarının tarayıcı geliştirici araçları (Chrome DevTools Network tab) üzerinden kolayca çalınabilmesine yol açar.

`pages-bff`, bu güvenlik zafiyetini ortadan kaldırır:
1. İstemci (tarayıcı), doğrudan Gemini API Gateway'e istek göndermek yerine **BFF** sunucusuna istek gönderir.
2. Vercel üzerinde çalışan BFF, server-side env içinde saklanan `GATEWAY_CLIENT_API_KEY` değerini isteğin başlığına (`X-API-Key`) ekler.
3. İsteği asıl API sunucusuna (`https://api.yucelgumus.dev`) iletir ve yanıtı istemciye döndürür.

---

## 📦 Desteklenen Uygulamalar ve Rotalar

| Statik Uygulama (GitHub Pages) | BFF Rota Path | API Gateway Upstream Path |
|--------------------------------|----------------|---------------------------|
| 🗺️ [GeoGemini](https://yucel-gumus.github.io/GeoGemini/) | `POST /api/geo/recommend-place` | `POST /api/recommend-place` |
| 🎤 [speech-to-text](https://yucel-gumus.github.io/speech-to-text/) | `POST /api/speech/transcribe` | `POST /api/transcribe` |
| 🎤 [speech-to-text](https://yucel-gumus.github.io/speech-to-text/) | `POST /api/speech/polish` | `POST /api/polish` |
| 🗺️ [gemini-mcp-maps](https://yucel-gumus.github.io/gemini-mcp-maps/) | `POST /api/maps/chat` *(SSE Stream)* | `POST /api/chat` |

---

## 🏗️ Mimarî ve Güvenlik Altyapısı

### 1. CORS Origin Doğrulama & Whitelisting
BFF, `PAGES_BFF_ALLOWED_ORIGINS` değişkeninde tanımlı olmayan kökenlerden (origins) gelen istekleri anında reddeder. Next.js Route Handlers içinde `OPTIONS` (preflight) istekleri ve CORS başlıkları dinamik olarak yönetilir.

### 2. Akışkan SSE (Server-Sent Events) Stream Relay
`gemini-mcp-maps` projesindeki yapay zeka cevapları haritaya SSE akışı olarak akar. BFF, gelen akışı belleğe biriktirmeden (non-buffering) anlık olarak tarayıcıya iletir:

```
[ Tarayıcı (Lit / SSE) ] ◄──(Relayed Stream)──► [ Next.js Route Handler (Vercel) ]
                                                            │
                                                   (Appends X-API-Key)
                                                            ▼
[ Gemini LLM API ] ◄──(EventSource Stream)── [ Python API Gateway (FastAPI) ]
```

---

## 📂 Proje Klasör Yapısı

```
pages-bff/
├── app/
│   ├── api/
│   │   ├── geo/
│   │   │   └── recommend-place/route.ts   # GeoGemini proxy rotası
│   │   ├── maps/
│   │   │   └── chat/route.ts              # SSE destekli Harita sohbet proxy'si
│   │   └── speech/
│   │       ├── transcribe/route.ts        # Ses transkripsiyon proxy'si
│   │       └── polish/route.ts            # Metin düzenleme proxy'si
├── lib/
│   └── gateway.ts                         # Ortak proxy Fetch ve CORS yardımcı fonksiyonları
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 Kurulum ve Yerel Çalıştırma

### 1. Bağımlılıkları Yükleyin
```bash
git clone https://github.com/yucel-gumus/pages-bff.git
cd pages-bff
npm install
```

### 2. Ortam Değişkenleri (`.env.local`)
Kök dizinde `.env.local` oluşturun:

```env
# API Sunucu Adresi
AI_API_URL=https://api.yucelgumus.dev

# API Sunucu Erişim Anahtarı (Plain text olmalıdır, base64 değil)
GATEWAY_CLIENT_API_KEY=your_client_api_key

# İzin verilen istemci kökenleri (CORS whitelist)
PAGES_BFF_ALLOWED_ORIGINS=https://yucel-gumus.github.io,http://localhost:5173,http://localhost:3000
```

### 3. Geliştirme Sunucusunu Başlatma
```bash
# BFF yerel olarak 3099 portunda başlar (diğer projelerle çakışmaması için)
npm run dev
```

---

## 🔗 Canlı Bağlantılar
* **Canlı BFF Adresi:** [https://pages-bff.vercel.app](https://pages-bff.vercel.app)
* **API Gateway Kaynak Kodu:** [yucel-gumus/llm_api](https://github.com/yucel-gumus/llm_api)