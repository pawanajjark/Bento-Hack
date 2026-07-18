# Bento Hotline — Voice Prediction Agent PRD

**Status:** Hackathon MVP — implemented, ahead of original P0 scope in several areas
**Event:** Build on Bento — BLR Edition
**Working name:** Bento Hotline
**One-line pitch:** Call a phone number to discover live Bento markets, understand the odds, place free-play predictions, and track results without opening an app.
**Primary stack:** Twilio (Programmable Voice + ConversationRelay), LangChain/LangGraph + OpenAI, Bento TypeScript SDK, Next.js, MongoDB, Anakin.io
**Collateral:** Bento play credits only

## 0. Implementation delta (as built)

This section tracks where the shipped product diverged from or extended the original plan below. Sections further down are kept as the original design record; treat this list as the current source of truth where it conflicts with them.

- **Onboarding OTP is a plain Twilio Voice call, not Twilio Verify.** Twilio Verify's voice channel was silently dropped by an Indian carrier (Jio) with no error surfaced. The app now places a normal outbound call (`TWILIO_CALLER_NUMBER`) with inline TwiML that reads a self-generated 6-digit code, validated by [`lib/otp-store.ts`](lib/otp-store.ts) (in-memory, 5-minute TTL, 5 attempts — replace with Redis before running multi-instance). See §7.1 and §15.
- **The agent can create duels by voice, not just bet on them.** `prepare_create_duel` / `confirm_create_duel` let a linked caller publish a brand-new public credits duel (question, category, two outcomes, schedule) after explicit confirmation. Not in the original goals list.
- **A testnet credit faucet is agent-callable.** `mint_testnet_credits` tops up the caller's play-credit balance on request. Originally out of scope for voice.
- **Live web search is wired into the agent.** `search_market_news`, backed by the Anakin.io Search API (`lib/anakin.ts`), lets the agent pull cited, real-time context for a market. The original PRD had no external-research tool; agent behavior rules (§14) still forbid presenting this as Bento market data.
- **Confirmation is a directly model-callable tool (`confirm_prediction`/`confirm_create_duel`), not a controller-only `commit_prediction` hidden from the LLM.** Safety instead comes from: the tool requiring a previously prepared, unexpired, single-use quote/duel stashed server-side ([`lib/agent/pending-bets.ts`](lib/agent/pending-bets.ts), [`lib/agent/pending-duels.ts`](lib/agent/pending-duels.ts)), a fresh Bento estimate at prepare-time, and system-prompt rules against calling it without explicit caller confirmation. This is a real deviation from §10/§11 below — flagged here rather than silently rewritten because it changes the trust boundary.
- **A public web experience shipped alongside the phone hotline:**
  - `/duels` — public duels board to browse live/upcoming/settled markets and create a duel from the browser (no call required).
  - `/agent-chat` — text chat console against the same LangGraph agent used on calls, for debugging without dialing in.
  - `/tester` — a raw dev console that exercises the Bento SDK wrapper directly (login, estimate, place, faucet, create-duel, markets/shares reads) via `app/api/tester/*`.
- **Agent runtime is LangChain/LangGraph (`createReactAgent`) over the OpenAI API**, not a bespoke OpenAI Responses/Realtime tool loop. `lib/agent/agent.ts` runs the graph per turn; the voice gateway feeds it transcript turns and speaks back the final text.
- **Bento auth/session details resolved during implementation:** Builder API key is sent via header `x-builder-api-key`; wallet login signs `"Bento.fun Login\nTimestamp: {ts}\nWallet: {address}"`; a new wallet gets `eoaLogin` → `{ exists: false }` → `eoaRegister`; the managed (transacting) account address is `user.address`, distinct from the signing EOA. See §13.
- **Credits decimals are configurable** (`BENTO_CREDITS_DECIMALS`, default 18, not a fixed assumption) — `creditsToWei` in [`lib/bento.ts`](lib/bento.ts) does the conversion.

## 1. Executive summary

Bento Hotline is a voice-first interface for Bento prediction markets. A participant calls a Twilio number and speaks naturally to an AI agent that can browse live markets, explain choices, obtain current quotes, place confirmed predictions, and read back the caller's positions.

The product is designed for situations where an app is inconvenient or less engaging: watch parties, live sports, group events, accessibility use cases, and users who prefer regional-language or conversational experiences.

The hackathon MVP must demonstrate one complete and trustworthy loop:

```text
Connect wallet once → Call the hotline → Discover a live market
→ Choose an outcome and stake → Hear the exact quote
→ Explicitly confirm → Bento accepts the prediction
→ Receive an SMS receipt → Ask for the updated position
```

The AI is responsible for conversation, intent understanding, and selecting read-only tools. The application server remains responsible for authentication, amount conversion, quote validation, confirmation, idempotency, and every Bento write.

## 2. Problem

Prediction-market interfaces require users to open an app, scan market cards, interpret probabilities, connect a wallet, and navigate a transaction flow. This creates friction during fast-moving live events and excludes people who are more comfortable speaking than navigating a financial-style interface.

Voice assistants can make discovery and explanation dramatically easier, but letting a language model directly execute predictions introduces unacceptable ambiguity. A safe voice interface must combine natural conversation with deterministic authorization and transaction controls.

## 3. Product thesis

A phone call is a compelling prediction-market interface when:

- The agent uses live Bento data rather than general sports knowledge.
- It explains markets conversationally without fabricating odds or outcomes.
- Every prediction uses a fresh Bento estimate.
- Every write requires an explicit, scoped confirmation.
- The caller receives a durable receipt and can verify the resulting position.

## 4. Goals and non-goals

### Goals

- Let a caller hear a short list of currently live Bento markets.
- Support natural requests such as “What football markets are live?”
- Explain a selected market and read its exact outcomes and current price.
- Let a caller specify an outcome and stake in whole play credits.
- Obtain and read back a fresh Bento quote before placement.
- Require deterministic confirmation before every Bento write.
- Place a credit-based prediction using a unique idempotency key.
- Distinguish HTTP acceptance from confirmed Bento/on-chain state.
- Send an SMS receipt containing the market, outcome, stake, and status.
- Let the caller ask for their current balance and open positions.
- Complete the main flow in under two minutes during judging.
- **(As built, beyond original scope)** Let a linked caller publish a brand-new public duel by voice, with the same explicit-confirmation gate as a bet (§0, §10).
- **(As built)** Let a caller top up testnet play credits via the faucet on request.
- **(As built)** Let a caller pull cited, real-time web context for a market via a bounded search tool.
- **(As built)** Offer the same market discovery, betting, and duel-creation flows from a public web board (`/duels`), not only by phone.

### Non-goals for the hackathon

- Real-money or USDC betting.
- Autonomous betting or recurring instructions such as “bet for me every day.”
- Personalized gambling advice or claims of guaranteed returns.
- Open-ended sports research or news analysis — narrowed, not eliminated: `search_market_news` (§10) gives bounded, cited lookups for one query at a time, not general research or news summarization.
- ~~Market creation~~ resolution, parlays, and tournaments. Market/duel **creation** shipped (§0, §10); resolution, parlays, and tournaments remain out of scope.
- Outbound promotional calling at scale.
- Supporting arbitrary wallets without a prior web onboarding step.
- Production-grade identity verification, custody, or regulatory coverage.
- A full consumer mobile application.

## 5. Target users

### Primary: live-sports participant

A sports fan at a watch party or event who wants to make quick free-play predictions without repeatedly navigating an app.

### Secondary: accessibility-first participant

A user for whom a conversational phone interface is easier than a dense market UI.

### Demo operator

A team member with a pre-linked Bento test account who demonstrates the complete call flow reliably during judging.

## 6. Product principles

1. **Bento data is the source of truth.** Market names, outcomes, prices, balances, and positions must come from Bento tools.
2. **Credits only.** The MVP rejects USDC markets and never describes credits as cash.
3. **No silent writes.** Browsing and explaining are read-only; a prediction always requires a fresh confirmation.
4. **Confirmation is transaction-specific.** Approval applies only to the exact market, outcome, stake, and quote just read to the caller.
5. **The model proposes; the server authorizes.** The LLM cannot bypass validation or directly construct a Bento request.
6. **Short answers win on voice.** Read no more than three markets at a time and ask what the caller wants next.
7. **Pending is a real state.** “Accepted” must not be presented as “settled” or “won.”
8. **Recovery should be conversational.** Errors must be explained in plain language with one actionable next step.

## 7. Primary user journeys

### 7.1 One-time onboarding

1. User opens the Bento Hotline onboarding page from an SMS or QR code.
2. User enters their phone number and receives an automated Twilio Voice call — a plain outbound call from `TWILIO_CALLER_NUMBER`, not Twilio Verify — that reads a self-generated six-digit OTP aloud. (Twilio Verify's voice channel was dropped silently by an Indian carrier during testing; see §0.)
3. User connects a wallet.
4. The browser asks the wallet to sign the Bento login or registration message.
5. The backend exchanges the signature for a Bento user JWT.
6. The backend stores an encrypted Bento session and managed-account address associated with a hashed phone identifier.
7. The page confirms that the number is ready to use with the hotline.

Hackathon shortcut: pre-link the presenter and one backup caller before judging. The live demo should not depend on completing wallet onboarding on stage.

### 7.2 Call and discover

1. User calls the Twilio number.
2. Twilio connects the call to the application's secure WebSocket.
3. The server identifies the caller by normalized phone number.
4. If linked, the agent greets the user and offers live-market discovery.
5. If unlinked, the agent explains that setup is required and sends the onboarding link by SMS.
6. The caller asks for live markets, optionally filtered by sport or keyword.
7. The agent reads at most three market questions with numbered choices.
8. The caller selects a market by number or name.

### 7.3 Quote and place a prediction

1. Caller selects one exact Bento outcome.
2. Caller states a whole-credit stake.
3. Server validates the account, market status, credits mode, stake limits, and available balance.
4. Server calls Bento `estimateBuy` using the on-chain `duelId` and `optionIndex`.
5. Agent reads a concise confirmation summary:

   > “You are placing 25 play credits on India to win. This quote estimates 31.4 shares with one percent slippage. Say ‘confirm’ or press 1 to place it.”

6. Server creates a short-lived pending-action record bound to the call and quote.
7. The next caller input must be an explicit confirmation. DTMF `1` is the preferred deterministic path for the demo.
8. Server creates a unique idempotency key and calls Bento `placeBet` with the stored estimate fields.
9. Agent says “Bento accepted the prediction; I am confirming the position.”
10. Server reconciles using a Bento read against the managed-account address.
11. Agent reports confirmed, still pending, or failed.
12. Twilio sends an SMS receipt.

Any change to market, outcome, stake, or quote invalidates the pending confirmation and requires a new estimate.

### 7.4 Portfolio and results

1. Caller asks “What predictions do I have?” or “What is my balance?”
2. Server retrieves Bento account and position data.
3. Agent summarizes no more than three positions at once.
4. Caller may ask for details about one position.
5. The agent clearly distinguishes open, won, lost, and pending states using Bento data only.

## 8. Voice experience requirements

### Conversation style

- Friendly, energetic, concise, and never pushy.
- Default response length: one or two spoken sentences.
- Read numbers naturally: “twenty-five credits,” not raw token units.
- Use the exact market and outcome labels returned by Bento.
- Never invent live scores, probabilities, payouts, or market availability.
- Do not claim that an outcome is likely unless that statement is a direct explanation of the displayed market price.
- Avoid words such as “guaranteed,” “safe bet,” or “easy money.”
- Remind the caller that the experience uses play credits during the greeting and before the first prediction.

### Interruption behavior

- The caller may interrupt market descriptions.
- A caller interruption cancels current speech but does not cancel a confirmed server operation.
- During the confirmation prompt, unrelated speech invalidates the pending action after one clarification.
- “Cancel,” `*`, or hanging up must discard any uncommitted pending action.

### Example opening

> “Welcome to Bento Hotline. You can explore live markets and place predictions using free-play credits. What sport or event are you interested in?”

### Example unlinked caller

> “This number is not connected to a Bento account yet. I’ve texted you a secure setup link. Connect your wallet there, then call me back.”

## 9. Functional requirements

### P0 — required for submission

| ID | Requirement | Acceptance criterion |
|---|---|---|
| P0-01 | Inbound call | Calling the Twilio number starts an interactive voice session. |
| P0-02 | Twilio validation | HTTP and WebSocket requests are validated as originating from Twilio. |
| P0-03 | Linked-user lookup | A pre-linked caller is mapped to the correct encrypted Bento session. |
| P0-04 | Unlinked-user fallback | An unlinked caller receives an onboarding SMS and no authenticated Bento call occurs. |
| P0-05 | Market discovery | Agent can list up to three live credit markets from Bento. |
| P0-06 | Exact market selection | Selection resolves to one `duelId`, never the database `id`. |
| P0-07 | Exact outcome selection | Outcome resolves to Bento `optionIndex` 0 or 1. |
| P0-08 | Amount conversion | Spoken whole credits are converted to collateral base units server-side. |
| P0-09 | Fresh estimate | Every prediction calls `estimateBuy` immediately before confirmation. |
| P0-10 | Confirmation gate | `placeBet` cannot execute without a live, matching pending action and explicit confirmation. |
| P0-11 | Credits enforcement | USDC markets and requests are rejected by the MVP. |
| P0-12 | Idempotency | Every placement uses a caller-stable unique idempotency key. |
| P0-13 | Reconciliation | After acceptance, the server polls a read using the Bento managed-account address. |
| P0-14 | Accurate status language | Voice and SMS distinguish accepted, confirmed, failed, and pending. |
| P0-15 | Receipt | A successful or pending placement produces an SMS receipt. |
| P0-16 | Failure recovery | Insufficient credits, expired auth, stale quotes, and unavailable markets receive specific spoken recovery messages. |
| P0-17 | Demo observability | A local operator screen or structured logs show transcripts, tool calls, latency, and placement state. |
| P0-18 | Demo backup | A second linked number and at least two known live markets are tested before judging. |

### P1 — add after the full P0 loop works

- ~~Balance and open-position queries.~~ **Done** — `get_account_summary`, `get_positions`, `get_all_positions`.
- Hindi/English language switching where the configured Twilio voices support it. *(not yet built)*
- Outbound opt-in alerts for material odds movement. *(not yet built)*
- Voice-built multi-leg parlays. *(not yet built)*
- Personalized watchlist and favorite sports. *(not yet built)*
- ~~A web dashboard with live transcript and tool activity.~~ **Partially done** — `/agent-chat` and `/tester` give a text-based agent console and a raw Bento SDK console for debugging, but neither streams a live call transcript from an in-progress phone call.
- Call transfer or SMS deep link into the Bento web experience. *(not yet built)*
- **New, not originally listed:** testnet credit faucet (`mint_testnet_credits`), voice-driven duel creation (`prepare_create_duel`/`confirm_create_duel`), web search for market context (`search_market_news`), and a public web duels board (`/duels`) — all shipped; see §0.

### P2 — post-hackathon

- Group calls for watch-party prediction rooms.
- Scheduled matchday briefings.
- Regional-language personalities and commentator modes.
- Responsible-use controls such as session stake caps and cooldowns.
- Production identity, consent, audit, retention, and regional compliance work.

## 10. Agent tool contract

> **As built** ([`lib/agent/tools.ts`](lib/agent/tools.ts)): the model gets a larger, still narrow, application-owned tool set than originally scoped, and the confirmation tools are directly model-callable rather than a hidden controller op — see §0 for why that's still safe. Raw Bento SDK methods and secrets are never exposed to the model; every tool returns typed JSON, never a stack trace, token, or wallet address.

### `list_live_markets`

```ts
type ListLiveMarketsInput = { query?: string; limit?: "1".."20" }; // default 10
```

Calls Bento public catalog methods, keeps only live credit-based markets, returns `duelId` (never the catalog `id`), `question`, both option labels, `collateralMode`, `category`.

### `list_all_duels`

```ts
type ListAllDuelsInput = {
  status?: "bootstrapping" | "open" | "pending" | "pending_contest" | "settled" | "all"; // default "all"
  limit?: number; // 1-5, default 3
};
```

New tool, not in the original contract. Covers duels across every lifecycle stage (not just live) for "what's upcoming/past" questions; still capped small because it's read aloud.

### `get_market_details`

```ts
type GetMarketDetailsInput = { duelId: string };
```

Returns exact labels, category, close time, collateral mode, and participant count for one `duelId`, which must come from `list_live_markets`/`list_all_duels`.

### `get_account_summary`

```ts
type GetAccountSummaryInput = Record<string, never>;
```

Identity is derived from the verified call session (`ctx.phone`); the model cannot supply a wallet or phone number. Returns `balanceCredits`.

### `prepare_prediction`

```ts
type PreparePredictionInput = { duelId: string; optionIndex: "0" | "1"; stakeCredits: number };
```

Requires an authenticated session (`ctx.bearer` + `ctx.managedAddress`). Loads the market, calls Bento `estimateBuy` for a fresh quote, stashes it server-side keyed by phone (60s expiry, single active quote per caller — [`lib/agent/pending-bets.ts`](lib/agent/pending-bets.ts)), and returns only an opaque `confirmationToken` plus a spoken summary. Does not place anything yet.

### `confirm_prediction`

```ts
type ConfirmPredictionInput = Record<string, never>; // no args — resolves the caller's own pending quote
```

**Directly callable by the model** (renamed/reshaped from the original controller-only `commit_prediction`). Takes the latest stashed quote for the caller, calls Bento `placeBetFromEstimate`, and consumes the quote exactly once — a second call with no new `prepare_prediction` fails with "couldn't find that pending prediction." The system prompt (§14) instructs the model to call this only after explicit caller confirmation; there is no separate controller layer re-checking that instruction server-side beyond the single-use quote.

### `get_positions`

```ts
type GetPositionsInput = { duelId: string };
```

Per-market share counts (`option0`/`option1`) for the caller's managed account.

### `get_all_positions`

New tool, not in the original contract. Returns every open position across all markets in one call — stake, current value, and unrealized P&L per outcome — so "what have I bet on?" doesn't require the caller to name a market first.

### `mint_testnet_credits`

```ts
type MintTestnetCreditsInput = Record<string, never>;
```

New tool. Calls the Bento testnet faucet (`sdk.public.autoMint.mint`) for the caller's managed account and reports credits minted. Explicitly framed to the model as free play money, not a production feature.

### `prepare_create_duel` / `confirm_create_duel`

```ts
type PrepareCreateDuelInput = {
  question: string;      // 10-180 chars
  category: "Cricket" | "Football" | "Basketball" | "American Football" | "Tennis" | "Baseball" | "Hockey" | "Formula 1";
  optionA: string; optionB: string; // must differ
  description?: string;
  startInMinutes: number;   // >= 31 (Bento pre-flight simulation requirement)
  durationMinutes: number;  // >= 15
};
type ConfirmCreateDuelInput = { confirmationToken: string };
```

New capability, not in the original contract: a linked caller can publish a brand-new **public** duel by voice. `prepare_create_duel` validates the schedule ([`lib/duel-schedule.ts`](lib/duel-schedule.ts)) and stashes the draft (5-minute expiry — [`lib/agent/pending-duels.ts`](lib/agent/pending-duels.ts)); `confirm_create_duel` calls Bento `createDuel` and makes it visible to every player, not just the caller. The system prompt must never call `confirm_create_duel` on its own initiative.

### `search_market_news`

```ts
type SearchMarketNewsInput = { query: string }; // 2-300 chars
```

New tool, not in the original contract. Calls the Anakin.io Search API ([`lib/anakin.ts`](lib/anakin.ts)) for cited, real-time web results (title/url/snippet/date), capped to the top 3. Used for context that affects a market's likely outcome — the model must still never present this as Bento market data or as guaranteed information (§14).

## 11. Confirmation state machine

```text
IDLE
  └─ caller chooses market/outcome/stake
       ↓
PREPARING_QUOTE
  ├─ validation/estimate fails → IDLE
  └─ estimate succeeds
       ↓
AWAITING_CONFIRMATION (short expiry)
  ├─ “cancel”, *, timeout, changed terms → CANCELLED → IDLE
  ├─ ambiguous input → clarify once
  ├─ second ambiguous input → CANCELLED → IDLE
  └─ “confirm” or DTMF 1
       ↓
COMMITTING (non-interruptible server operation)
  ├─ rejected → FAILED → IDLE
  └─ Bento accepts
       ↓
RECONCILING
  ├─ position observed → CONFIRMED → IDLE
  └─ timeout → ACCEPTED_PENDING → IDLE
```

The `COMMITTING` state is exactly-once from the application's perspective. Repeated caller speech or WebSocket retries must not create an additional Bento write.

**As built:** exactly-once is enforced by `takeLatestQuote`/`takeDuel` deleting the stashed record on first read ([`lib/agent/pending-bets.ts`](lib/agent/pending-bets.ts), [`lib/agent/pending-duels.ts`](lib/agent/pending-duels.ts)), not by a separate `COMMITTING` lock state — a second `confirm_prediction` call simply finds nothing pending and returns an error instead of double-spending. There is no automated reconciliation poll yet; `placeBetFromQuote`'s response is reported to the caller directly as accepted/failed.

## 12. Technical architecture

```text
Caller                              Browser (web onboarding, /duels, /agent-chat, /tester)
  │ PSTN                                  │ HTTPS
  ▼                                       ▼
Twilio Programmable Voice          Next.js app (app/, app/api/*)
  │ <Connect><ConversationRelay>          ├── onboarding + wallet-link flow
  │ transcript, DTMF, interruption        ├── public duels board (browse/create)
  ▼                                       ├── agent-chat + tester dev consoles
Node.js voice gateway (server/voiceGateway.ts, Express + ws)
  ├── caller → linked-session resolver (phone → managedAddress/bearer)
  ├── LangGraph agent runtime (lib/agent/agent.ts, createReactAgent)
  ├── pending-quote / pending-duel stores (in-memory, short-lived)
  ├── Bento service wrapper (lib/bento.ts)
  ├── encrypted user-session store (lib/user-links.ts, MongoDB)
  └── SMS receipt via Twilio
         │                  │                    │
         ▼                  ▼                    ▼
   OpenAI API          Bento SDK/API        Anakin.io Search API
                            │
                            ▼
                     Bento/BSC state
```

### Implementation path (as built)

Twilio ConversationRelay is the voice transport, terminated by the Express/`ws` gateway in [`server/voiceGateway.ts`](server/voiceGateway.ts) (run via `pnpm voice`, separate process from the Next.js app). Conversation and tool selection run through LangChain/LangGraph's `createReactAgent` over the OpenAI API ([`lib/agent/agent.ts`](lib/agent/agent.ts), tools from [`lib/agent/tools.ts`](lib/agent/tools.ts)), not a bespoke Responses/Realtime loop. The same agent graph backs `/agent-chat` for text-based debugging without a phone call.

### Server endpoints (as built)

| Endpoint | Purpose |
|---|---|
| Twilio webhook → `server/voiceGateway.ts` | HTTP handler returns TwiML connecting the call to ConversationRelay; `wss://` session handles setup/prompt/DTMF/interruption events. |
| `POST /api/verify/start`, `POST /api/verify/check` | Send/verify the onboarding OTP (plain Twilio Voice call, not Twilio Verify — see §0). |
| `POST /api/auth/link` | Exchange wallet signature for a Bento login/register session and persist the phone↔wallet link. |
| `GET /api/credits` | Read the linked user's play-credit balance. |
| `GET /api/duels`, `POST /api/duels` | Public duels board reads and duel creation from the browser. |
| `POST /api/bets/prepare`, `POST /api/bets/confirm` | Web-side two-phase estimate/place flow, mirroring the voice tools. |
| `/api/tester/*` (`login`, `markets`, `market`, `estimate`, `place`, `create-duel`, `duels`, `shares`, `faucet`, `chat`) | Dev-only console backing `/tester`, exercising the Bento SDK wrapper and agent directly. |

## 13. Bento integration requirements

- Install and use `@bento.fun/sdk` with Node.js 18 or later.
- Configure the hackathon/testnet markets host and Builder API key in server secrets.
- Use the markets host only for the P0 MVP.
- Use public catalog reads for discovery.
- Use Bento wallet login/register to obtain a user JWT during web onboarding.
- Store both the signing-wallet address and Bento managed-account address; use the managed address for balances and positions.
- Estimate before placement and pass the estimate's quote fields into `placeBet`.
- Use `duelId`, never the catalog database `id`, for detail, quote, and placement calls.
- Convert spoken whole credits to base units using collateral decimals; never pass a whole number directly as wei.
- Always pass an idempotency key.
- Treat a successful write response as accepted, then poll a read to confirm.
- Handle Bento rate limiting using the supplied retry timing.

**As built, resolved by inspecting the live SDK** (see [`lib/bento.ts`](lib/bento.ts)):

- The Builder API key goes in header **`x-builder-api-key`** (not `x-api-key`; there is no `apiKey` config field) — `createBentoSdk({ baseUrl, headers: { "x-builder-api-key": key } })`.
- The signed login message must be exactly `Bento.fun Login\nTimestamp: {ts}\nWallet: {address}` with `ts = String(Date.now())`.
- `eoaLogin({ address, signature, timestamp })` returns `{ exists: false, eoaAddress }` (no throw) for a new wallet — branch on this and call `eoaRegister({ address, signature, timestamp, username })`, which returns `{ success, token, expiresIn: 604800, user }`.
- The **managed-account address is `user.address`** (also the JWT's `address` claim), distinct from the signing `eoaAddress`; it's what transacts and holds balances — the app never asks for a per-bet wallet signature.
- Reads are two calls: `sdk.public.listMarkets({ collateralStack: "credits", status, limit, sortBy, sortOrder })` and `sdk.public.getMarketById({ marketId: duelId })`; a "market" is a binary "duel" under `/public/duels/*` — option labels live at `row.options[]`, the question at `row.betString`, the id at `row.duelId` (not `row.id`).
- Betting is two-phase: `estimateBuy({ duelId, optionIndex, betAmountUsdc, slippageBps })` returns a quote good for ~60s; `placeBetFromEstimate` only reads `shares_out`, `min_shares_out`, `quote_id`, `quote_timestamp` off it.
- Credits→base-units conversion is `credits * 10^CREDITS_DECIMALS` (`creditsToWei`, decimals from `BENTO_CREDITS_DECIMALS`, default 18) — always pass `collateralMode: "credits"`, which also bypasses geo-restrictions.
- `sdk.public.autoMint.mint({ userAddress })` is the testnet faucet; retry once on the transient "replacement fee too low" nonce race.
- `sdk.user.createDuel(input, { requestId })` publishes a new public credits duel; Bento's pre-flight simulation requires `startTime` at least 31 minutes out.
- `@langchain/langgraph` must be a direct `package.json` dependency — pnpm won't hoist the transitive copy, and `createReactAgent`'s import fails typecheck otherwise.

Reference documentation:

- [Bento quickstart](https://docs.bento.fun/quickstart)
- [Place a bet](https://docs.bento.fun/guides/place-bet)
- [Accounts and wallets](https://docs.bento.fun/concepts/accounts)
- [Common patterns and pitfalls](https://docs.bento.fun/reference/common-patterns)

## 14. OpenAI behavior requirements

### System-level rules

- You are a voice interface for Bento play-credit prediction markets.
- Use tools for every claim about live markets, quotes, balances, and positions.
- Never infer or invent a market ID, outcome label, probability, balance, or transaction status.
- Never present general sports knowledge as Bento market data.
- Never call a write operation without an active server-managed confirmation flow.
- Keep spoken responses brief and easy to interrupt.
- Ask one question at a time.
- If caller intent could refer to multiple markets or outcomes, ask for clarification.
- Never encourage chasing losses or describe predictions as investments.
- When a tool fails, explain the failure without exposing stack traces, tokens, phone numbers, or wallet addresses.

### Tool-call safety

- Read tools may use automatic tool choice.
- `prepare_prediction` / `prepare_create_duel` are allowed only after market/duel details, outcome, and stake (or schedule) are all explicit.
- **As built:** `confirm_prediction` and `confirm_create_duel` *are* directly callable by the model (see §0 and §10) — the system prompt is the only thing telling it to wait for explicit caller confirmation first. The safety net is that each call consumes a single-use, short-lived, server-stashed quote/duel; without a matching `prepare_*` call immediately before it, the confirm tool has nothing to act on and returns an error.
- Tool arguments are validated with strict schemas (Zod) and server-side allowlists.
- OpenAI, Twilio, and Anakin receive only the minimum user data required for the call flow — `search_market_news` sends only the search query, never caller identity.

Reference documentation:

- [OpenAI Realtime and audio](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)

## 15. Twilio integration requirements

- Purchase or configure one Twilio Voice-capable number.
- ~~Use the Twilio Verify voice channel for onboarding OTP delivery~~ **As built:** use a plain outbound Twilio Voice call (`client.calls.create` with inline TwiML) from `TWILIO_CALLER_NUMBER`, reading a self-generated 6-digit code. Twilio Verify's voice channel (`channel: "call"`) was accepted by the API (`status: pending`) but silently dropped by an Indian carrier (Jio, Karnataka) with no error code — see §0. Trial accounts can still call only verified destination numbers, and play a trial preamble first.
- Return `<Connect><ConversationRelay>` from the inbound voice webhook.
- Use a public `wss://` endpoint.
- Validate `X-Twilio-Signature` for HTTP and WebSocket initiation.
- Handle setup, prompt, DTMF, interruption, error, and disconnect events.
- Stream OpenAI text tokens to Twilio instead of waiting for a full answer.
- Add an action/status callback for call termination and recovery.
- Use Twilio Messaging for onboarding links and receipts.
- Do not place secrets or sensitive data in TwiML attributes, custom parameters, logs, or handoff data.

Reference documentation:

- [Twilio ConversationRelay](https://www.twilio.com/docs/voice/conversationrelay)
- [ConversationRelay WebSocket messages](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages)
- [ConversationRelay best practices](https://www.twilio.com/docs/voice/conversationrelay/best-practices)

## 16. Data model

### `users`

| Field | Notes |
|---|---|
| `id` | Internal UUID. |
| `phone_hash` | Stable hash of normalized phone number. |
| `phone_encrypted` | Optional, only if needed for SMS. |
| `wallet_address` | Signing-wallet address. |
| `managed_address` | Bento account used for funds and positions. |
| `bento_token_encrypted` | Encrypted JWT/session material. |
| `token_expires_at` | Forces re-onboarding when expired. |
| `created_at`, `updated_at` | Audit timestamps. |

### `call_sessions`

| Field | Notes |
|---|---|
| `call_sid` | Twilio call identifier. |
| `user_id` | Nullable for unlinked callers. |
| `state` | Current confirmation state. |
| `selected_duel_id` | Current conversational selection. |
| `started_at`, `ended_at` | Operational metrics. |

### `pending_predictions`

| Field | Notes |
|---|---|
| `token_hash` | Opaque, single-use confirmation token. |
| `call_sid`, `user_id` | Prevent cross-call approval. |
| `duel_id`, `option_index` | Exact Bento action target. |
| `stake_base_units` | Server-converted amount. |
| `quote_payload_encrypted` | Estimate fields required for placement. |
| `idempotency_key` | Generated once and reused for retries of the same action. |
| `expires_at`, `consumed_at` | Enforce short-lived exactly-once use. |
| `status` | Prepared, committing, accepted, confirmed, failed, expired. |

## 17. Error handling

| Failure | Spoken behavior | Server behavior |
|---|---|---|
| Unlinked caller | Send setup SMS and end gracefully. | No Bento user call. |
| Expired Bento token | Send reconnect link. | Clear unusable session. |
| No live matching markets | Offer another sport or all live markets. | Return an empty typed result. |
| Ambiguous market | Ask caller to choose numbered option. | No quote call. |
| Invalid stake | State allowed range and ask again. | Reject before Bento. |
| Insufficient credits | Explain balance is too low. | Do not retry automatically. |
| Market closed | Say it closed and offer live markets. | Invalidate pending action. |
| Quote stale/rejected | Obtain a new quote and reconfirm. | Never reuse stale confirmation. |
| Bento 429 | Ask caller to wait briefly. | Respect `retryAfterMs`. |
| Bento accepted, read not updated | Report “accepted, still confirming.” | Continue bounded reconciliation and SMS final status if possible. |
| Twilio WebSocket disconnect | End safely; do not repeat committed writes. | Recover through callback where practical. |
| OpenAI timeout | Apologize and retry the conversational turn once. | Never retry a write through the model. |

## 18. Security and privacy

- Never store or request wallet private keys.
- Keep Bento Builder keys, JWTs, Twilio credentials, and OpenAI keys server-side.
- Encrypt Bento tokens at rest.
- Normalize phone numbers before hashing or lookup.
- Use signed, single-use, expiring onboarding links.
- Bind pending actions to user, Twilio call SID, and exact quote.
- Redact phone numbers, JWTs, signatures, and wallet addresses from logs.
- Retain only the minimum transcript and call metadata needed for the demo.
- Provide a visible disclosure that the caller is interacting with an AI system and that speech may be transcribed.
- Do not treat caller ID alone as production-grade authentication; it is an MVP linkage convenience combined with transaction confirmation.

## 19. Success metrics

### Hackathon success

- One end-to-end prediction succeeds live during judging.
- Median time from greeting to confirmed placement is under two minutes.
- Market discovery response begins within three seconds under demo conditions.
- No duplicate bet occurs after repeated speech, interruption, or retry.
- The spoken receipt matches the Bento request exactly.
- A judge understands the value proposition in the first 20 seconds.

### Instrumentation

Record structured, privacy-redacted events for:

- Call started and caller linked/unlinked.
- User transcript finalized.
- First agent token latency.
- Tool name, duration, success/failure, and correlation ID.
- Quote prepared, confirmed, cancelled, expired, or replaced.
- Bento placement accepted and reconciliation result.
- SMS receipt status.
- Call ended and total duration.

## 20. Demo script

### Stage setup

- Presenter phone and backup phone are linked in advance.
- Twilio number is saved as “Bento Hotline.”
- At least two live credit markets are verified immediately before judging.
- One market with short, pronounceable outcome labels is selected as the primary demo.
- Account has sufficient play credits.
- Operator dashboard/log view is open on the projector as a backup proof layer.

### Ninety-second demo

1. Presenter: “Apps make you hunt through markets. Bento Hotline lets you predict by talking.”
2. Call the number on speaker.
3. Ask: “What markets are live right now?”
4. Select a numbered market.
5. Ask for a short explanation.
6. Say: “Put 25 credits on option A.”
7. Agent reads the exact confirmation summary.
8. Press `1` to confirm.
9. Agent reports Bento acceptance and confirmation status.
10. Show the SMS receipt and Bento/operator view.
11. Ask: “What positions do I have?” if the portfolio tool is ready.

### Judge-facing close

> “Bento Hotline is an accessible, multilingual-ready voice interface for live prediction markets. Twilio handles the call, OpenAI understands the user and selects safe tools, and Bento remains the source of truth for every quote and position.”

## 21. Build order

1. Verify Bento SDK catalog, login, estimate, placement, and reconciliation in a standalone script.
2. Implement Bento service wrapper with typed read tools and strict validation.
3. Build Twilio inbound webhook and a basic ConversationRelay echo session.
4. Add OpenAI streaming conversation with `list_live_markets` and `get_market_details`.
5. Implement `prepare_prediction` and the pending-action state machine.
6. Implement DTMF confirmation, placement, idempotency, and reconciliation.
7. Add SMS onboarding fallback and receipt.
8. Add the minimal wallet onboarding page or pre-link demo accounts.
9. Add redacted observability and rehearse failure paths.
10. Only then add portfolio queries, multilingual behavior, or visual polish.

## 22. Definition of done

The hackathon MVP is done when a pre-linked user can call the public number, hear real live Bento credit markets, select a valid outcome and stake, receive a fresh quote, explicitly confirm it, produce exactly one Bento placement, hear an honest acceptance/confirmation status, and receive an accurate SMS receipt—with no private key handling and no ability for the model to bypass the confirmation controller.

## 23. Open decisions

- Final product name: Bento Hotline, Dial-a-Pick, Bento Line, or PickCall.
- Whether P0 confirmation should accept voice “confirm” or only DTMF `1`.
- Maximum and minimum demo stake in whole credits.
- Fixed MVP slippage tolerance.
- Storage choice for encrypted sessions and pending actions.
- Whether account balance/positions are P0 or moved behind the completed placement loop.
- Which English voice and optional regional language produce the best latency and pronunciation for market labels.
