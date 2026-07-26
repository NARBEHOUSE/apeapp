# APE — Aesthetic Physique Enthusiast Application

> **The only fitness app that lets you bring your own AI.**

APE is a free, ad-free PWA fitness tracker built for bodybuilders and physique athletes.
Track macros, log workouts, monitor progress, and get AI-powered coaching — using
whichever AI provider you already have.

No subscription. No ads. No data sold. **Your key. Your data. Your gains.**

🔗 [Live App](https://narbehouse.github.io/apeapp) · [Privacy Policy](https://narbehouse.github.io/apeapp/#/privacy) · [Support APE ☕](https://streamelements.com/bigbroacro/tip)

---

## Features

- **Macro & Nutrition Tracking** — USDA FoodData Central search, barcode scanning, AI food photo recognition, voice entry, recipe builder, meal plans
- **Workout Logging** — Built-in program library, custom program creator, auto-progression, rest timers, full history
- **AI Food Scanner** — Point your camera at any meal for instant macro estimates (uses your own API key)
- **AI Coach** — Weekly training and nutrition suggestions generated from your actual logged data (uses your own API key)
- **Coach Mode** — Share your data with a real coach via Google Drive; coaches can push macro targets and programs directly to your app
- **Progress Tracking** — Body measurements, progress photos with pose tagging, time-lapse comparisons, trend charts
- **Google Drive Sync** — All data syncs to your personal Google Drive. NARBE LLC never touches your data.
- **PWA** — Install on any device. Works fully offline. No app store required.
- **Free & Ad-Free** — Always.

---

## Bring Your Own AI Key

APE is the only fitness app that lets you supply your own AI API key. This means:

- **No AI subscription** — pay your provider directly, only for what you use
- **No lock-in** — switch providers anytime from Settings
- **Full privacy** — your key never leaves your device; API calls go directly from your browser to the provider
- **Model choice** — use the latest Claude, GPT-4o, Gemini, Llama, or any OpenRouter-compatible model

### Supported Providers

| Provider | Key Prefix | Vision/Image Support | Default Model |
|---|---|---|---|
| Anthropic (Claude) | `sk-ant-` | ✅ | claude-sonnet-4-6 |
| OpenAI | `sk-` | ✅ | gpt-4o |
| OpenRouter | `sk-or-` | ✅ | anthropic/claude-sonnet-4-6 |
| Groq | `gsk_` | ❌ | llama-3.3-70b-versatile |
| Google Gemini | `AIza` | ✅ | gemini-2.0-flash |

APE auto-detects your provider from the key prefix — no dropdown needed. Paste your key in Settings → AI & API.

Get a key: [Anthropic](https://console.anthropic.com) · [OpenAI](https://platform.openai.com) · [OpenRouter](https://openrouter.ai) · [Groq](https://console.groq.com) · [Google AI Studio](https://aistudio.google.com)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Local data | IndexedDB via idb, localStorage |
| Cloud sync | Google OAuth 2.0 + Google Drive API |
| AI proxy | None — direct browser-to-provider calls |
| Food data | USDA FoodData Central via Cloudflare Worker proxy |
| Hosting | GitHub Pages |
| PWA | Vite PWA plugin (Workbox) |

---

## Privacy

APE has no backend servers. All user data lives in your browser's local storage (IndexedDB / localStorage) or your own Google Drive account. NARBE LLC does not collect, store, access, or transmit any user data to its own servers.

AI API keys are stored only on your device and are explicitly excluded from Google Drive sync data.

→ [Full Privacy Policy](https://narbehouse.github.io/apeapp/#/privacy)

---

## Support

APE is free and ad-free. If it's helping your gains, a tip keeps it that way.

👉 **[Tip the creator](https://streamelements.com/bigbroacro/tip)**

---

## License

```
APE App — Source Available License
Copyright © 2025–2026 NARBE LLC. All rights reserved.
```

Source code is available for personal, non-commercial use and transparency.
Commercial use, redistribution, or derivative commercial products require written permission.

→ See [LICENSE](./LICENSE) for full terms
→ Commercial licensing: [narbehousellc@gmail.com](mailto:narbehousellc@gmail.com)

---

## Legal

APE is a personal fitness and nutrition tracking tool only. Nothing in this application
constitutes medical advice, diagnosis, or treatment. Always consult a qualified healthcare
professional before starting any diet, exercise, or supplementation program. NARBE LLC is
not responsible for any health outcomes resulting from use of the app.

AI-generated nutrition estimates and coaching suggestions are for informational purposes only
and do not replace professional dietary or medical guidance.

APE is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, Google, Groq,
or OpenRouter. All third-party trademarks are the property of their respective owners.

---

*Built by Ari Rosenberg / [NARBE LLC](mailto:narbehousellc@gmail.com)*
