# Bento Hotline

Voice-first interface for Bento prediction markets. A participant calls a phone number, talks naturally to an AI agent, and can discover live markets, get quotes, place free-play (credits-only) predictions, and check their positions — all without opening an app.

Built for **Build on Bento — BLR Edition** (hackathon MVP).

See [`BENTO_HOTLINE_PRD.md`](BENTO_HOTLINE_PRD.md) for the full product spec and [`MARKETFORGE_AI_PRD.md`](MARKETFORGE_AI_PRD.md) for the related MarketForge AI concept.

## How it works

```
Connect wallet once (web onboarding) → Call the hotline → Discover a live market
→ Choose an outcome and stake → Hear the exact quote
→ Explicitly confirm → Bento accepts the prediction
→ Receive an SMS receipt → Ask for the updated position
```

The LLM agent handles conversation, intent understanding, and tool selection. The application server owns authentication, amount conversion, quote validation, and idempotency; every Bento write still requires a fresh estimate and an explicit caller confirmation before the agent's confirm tool has anything to act on (see [Safety model](#safety-model)).

The same agent also works from a browser: `/duels` lets anyone browse or create markets without calling in, and `/agent-chat` runs the identical LangGraph agent as a text chat for debugging.

## Agent tools

The voice/chat agent ([`lib/agent/tools.ts`](lib/agent/tools.ts)) only gets narrow, typed tools — never raw Bento SDK access or secrets:

- `list_live_markets`, `list_all_duels`, `get_market_details` — discover and inspect markets/duels.
- `get_account_summary`, `get_positions`, `get_all_positions` — balance and portfolio reads.
- `prepare_prediction` → `confirm_prediction` — fresh quote, then a one-time confirm that consumes it.
- `prepare_create_duel` → `confirm_create_duel` — stage and publish a brand-new public duel by voice.
- `mint_testnet_credits` — top up play credits from the testnet faucet.
- `search_market_news` — cited, real-time web context via the Anakin.io Search API ([`lib/anakin.ts`](lib/anakin.ts)).

## Stack

- **Next.js 16** (App Router) — web onboarding, duels board, dashboards, API routes
- **Express + `ws`** ([`server/voiceGateway.ts`](server/voiceGateway.ts)) — Twilio ConversationRelay voice gateway
- **LangChain / LangGraph + OpenAI** ([`lib/agent`](lib/agent)) — the conversational agent and its tools
- **Twilio** — inbound calls, voice, SMS receipts, phone verification
- **@bento.fun/sdk** — Bento markets, quotes, and bet placement
- **MongoDB** — linked users, phone-to-wallet mapping, pending bets/duels

## Project structure

```
app/                Next.js routes
  page.tsx           Landing page + onboarding flow
  duels/             Duels board (browse/create prediction markets)
  tester/            Manual API test console
  agent-chat/        Text-based agent chat for debugging the voice agent
  api/               REST endpoints (auth, verify, bets, duels, credits, tester/*)
components/          Onboarding flow, duels board, trust rail, voice signal UI
lib/
  agent/             Agent graph, system prompt, tools, pending bet/duel state
  bento.ts           Bento SDK wrapper (markets, quotes, bets)
  twilio-verify.ts    Phone number formatting + call-based OTP
  otp-store.ts, user-links.ts, secure.ts, mongodb.ts, duel-schedule.ts, anakin.ts
server/
  voiceGateway.ts    Twilio ConversationRelay WebSocket server
scripts/
  test-agent.ts      CLI chat loop against the agent, optionally as a linked user
```

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in the values below
pnpm dev                     # Next.js app on http://localhost:3000
pnpm voice                   # Twilio ConversationRelay gateway (separate process)
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `BENTO_BUILDER_API_KEY`, `BENTO_URL` | Bento SDK access |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` | Twilio account credentials |
| `TWILIO_VERIFY_SERVICE_SID` | Legacy Verify service SID (onboarding OTP now uses a plain voice call, not Verify) |
| `TWILIO_CALLER_NUMBER` | Number Twilio calls from for OTP delivery |
| `NEXT_PUBLIC_HOTLINE_NUMBER` | Hotline number shown in the web UI |
| `MONGODB_URI` | User/session storage |
| `PHONE_HASH_SALT` | Salt for hashing phone numbers at rest |
| `OTP_BYPASS_CODE`, `OTP_BYPASS_NUMBERS` | Dev-only OTP bypass for specific numbers |
| `OPENAI_API_KEY` | Agent LLM |
| `ANAKIN_API_KEY` | Anakin.io API integration |
| `BENTO_TOKEN_ENC_KEY` | Encryption key for stored Bento bearer tokens |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the Next.js app |
| `pnpm build` / `pnpm start` | Production build / start |
| `pnpm voice` | Run the Twilio voice gateway (`server/voiceGateway.ts`) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm tsx scripts/test-agent.ts [+91...]` | Chat with the agent from the CLI, optionally acting as a linked phone number |

## Safety model

Every prediction and every new duel requires a fresh Bento quote/schedule check before it can be confirmed. `confirm_prediction` and `confirm_create_duel` are callable by the model, but they only act on a short-lived, single-use record stashed server-side by the matching `prepare_*` call ([`lib/agent/pending-bets.ts`](lib/agent/pending-bets.ts), [`lib/agent/pending-duels.ts`](lib/agent/pending-duels.ts)) — with no matching pending record, confirm has nothing to do. Placement uses idempotency to prevent duplicate writes. This MVP uses Bento play credits only — no real-money or on-chain betting.

See [`BENTO_HOTLINE_PRD.md`](BENTO_HOTLINE_PRD.md#0-implementation-delta-as-built) for where the shipped build diverged from or extended the original PRD.
