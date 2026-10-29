# Nova — AI-Powered Conversational Delivery Platform

Nova is a full-stack conversational campus delivery platform for **Food, Groceries, Laundry Pickup, and Parcel Dispatch**, built with **React 19 + TypeScript + Vite**, **Vercel Serverless Gemini AI (`/api/chat`)**, **Zero-Token On-Device NLP**, **Wake-Word Voice Control (`"Hey Nova"` / `"Hi Nova"`)**, **Multimodal Camera & Receipt Uploads**, and **Supabase Cloud Sync**.

## Core Capabilities

1. **Hybrid Zero-Token NLP + Gemini 2.5 Flash AI**:
   - **Tier 1 (`src/lib/nlpEngine.ts`)**: Typo-tolerant local intent & entity parser handles ~80% of turns (multi-item ordering, cart edits, section navigation, inline address/phone parsing, `.txt`/`.csv` shopping list parsing, and direct checkout/payment handoff) in **0 ms and 0 tokens**.
   - **Tier 2 (`api/chat.ts` & `src/lib/geminiClient.ts`)**: Escalates complex recommendations, budget queries, and multimodal photos/PDFs to **Gemini 2.5 Flash** using compressed SKU lines to cut prompt token usage by ~75%.

2. **Voice Commands & `"Hey Nova"` / `"Hi Nova"` Wake Word**:
   - Continuous Web Speech wake-word listener (`src/lib/voiceEngine.ts`) with customizable wake phrases, Web Audio wake chime, push-to-talk mic button, and optional spoken TTS replies.

3. **Camera Capture & Strictly Necessary File Whitelist**:
   - Live `getUserMedia` camera modal (`src/components/CameraModal.tsx`) with front/rear camera flip and client-side Canvas image compression.
   - Strict whitelist (`src/lib/fileValidator.ts`): only `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.txt`, and `.csv` up to `10 MB` are permitted; unsafe or unnecessary formats are rejected cleanly.

4. **On-Device Conversation Storage & Auto-Pruning**:
   - Configurable max stored conversations (`1–50`, default `10`) and max messages per thread (`10–200`, default `60`) in **Settings → Chat Storage**, automatically pruning oldest chats when exceeded.

5. **Admin Operations Dashboard**:
   - Protected by operator PIN (default preview PIN: `2026`, configurable via `VITE_ADMIN_PIN` or Admin settings).
   - Manage live orders, preview & verify payment proof receipts, assign riders, edit Food/Groceries/Laundry catalog items, and configure campus delivery fees & live bank transfer accounts.

## Local Development

```bash
npm install
npm run dev
```

## Production Deployment (GitHub + Supabase + Vercel)

1. Run [`supabase/schema.sql`](./supabase/schema.sql) in your Supabase SQL Editor.
2. Configure environment variables on Vercel (see [`.env.example`](./.env.example)):
   - `GEMINI_API_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_PIN`
