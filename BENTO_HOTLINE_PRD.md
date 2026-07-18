# Bento Hotline — Voice Prediction Agent PRD

**Status:** Hackathon MVP
**Event:** Build on Bento — BLR Edition
**Working name:** Bento Hotline
**One-line pitch:** Call a phone number to discover live Bento markets, understand the odds, place free-play predictions, and track results without opening an app.
**Primary stack:** Twilio ConversationRelay, OpenAI API, Bento TypeScript SDK
**Collateral:** Bento play credits only

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

### Non-goals for the hackathon

- Real-money or USDC betting.
- Autonomous betting or recurring instructions such as “bet for me every day.”
- Personalized gambling advice or claims of guaranteed returns.
- Open-ended sports research or news analysis.
- Market creation, resolution, parlays, and tournaments.
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
2. User enters and verifies their phone number.
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

- Balance and open-position queries.
- Hindi/English language switching where the configured Twilio voices support it.
- Outbound opt-in alerts for material odds movement.
- Voice-built multi-leg parlays.
- Personalized watchlist and favorite sports.
- A web dashboard with live transcript and tool activity.
- Call transfer or SMS deep link into the Bento web experience.

### P2 — post-hackathon

- Group calls for watch-party prediction rooms.
- Scheduled matchday briefings.
- Regional-language personalities and commentator modes.
- Responsible-use controls such as session stake caps and cooldowns.
- Production identity, consent, audit, retention, and regional compliance work.

## 10. Agent tool contract

The model receives narrow application-owned tools. Raw Bento SDK methods and secrets are never exposed to the model.

### `list_live_markets`

```ts
type ListLiveMarketsInput = {
  query?: string;
  limit: 1 | 2 | 3;
};

type VoiceMarket = {
  duelId: string;
  question: string;
  optionA: string;
  optionB: string;
  collateralMode: "credits";
  status: "live";
};
```

Server behavior:

- Call Bento public catalog methods.
- Keep only live, credit-based markets.
- Return `duelId`; do not expose or accept the database `id` for actions.
- Limit output to three results.

### `get_market_details`

```ts
type GetMarketDetailsInput = { duelId: string };
```

Returns exact labels, status, current pricing data, close time, collateral mode, and the two valid option indexes.

### `get_account_summary`

```ts
type GetAccountSummaryInput = Record<string, never>;
```

The server derives user identity from the verified call session. The model cannot supply a wallet or phone number.

### `prepare_prediction`

```ts
type PreparePredictionInput = {
  duelId: string;
  optionIndex: 0 | 1;
  stakeCredits: number;
};

type PendingPrediction = {
  confirmationToken: string;
  expiresAt: string;
  spokenSummary: string;
  marketQuestion: string;
  outcomeLabel: string;
  stakeCredits: number;
  estimatedShares: string;
};
```

Server behavior:

- Validate market, user, credits mode, balance, and stake boundaries.
- Convert stake to Bento base units using the correct collateral decimals.
- Call `estimateBuy` with a fixed MVP slippage tolerance.
- Store quote fields server-side in a short-lived pending record.
- Return only a confirmation summary and opaque token.

### `commit_prediction`

This is an internal controller operation, not a freely callable LLM tool.

It may run only when:

- The call session is authenticated.
- A pending prediction exists for the same call.
- It has not expired or already been consumed.
- The caller confirmed through the allowed confirmation path.
- Market, outcome, stake, and quote are unchanged.

It calls Bento `placeBet`, consumes the token exactly once, and starts reconciliation.

### `get_positions`

Uses the managed-account address returned by Bento login, not the signing-wallet address.

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

## 12. Technical architecture

```text
Caller
  │ PSTN
  ▼
Twilio Programmable Voice
  │ <Connect><ConversationRelay>
  │ transcript, DTMF, interruption, streamed text
  ▼
Node.js voice gateway (HTTPS + WSS)
  ├── call-session state machine
  ├── confirmation controller
  ├── OpenAI conversation orchestrator
  ├── Bento service wrapper
  ├── encrypted user-session store
  └── receipt/observability service
         │                  │
         ▼                  ▼
   OpenAI API          Bento SDK/API
                            │
                            ▼
                     Bento/BSC state
```

### Recommended implementation path

Use Twilio ConversationRelay for the hackathon voice transport. It provides speech-to-text, text-to-speech, interruption handling, and JSON WebSocket messages while the app streams text tokens back to the caller.

Use the OpenAI Responses API or Realtime text events behind the gateway for conversation and tool selection. Keep the selected model in an environment variable. The architecture must allow streaming partial text to Twilio to reduce perceived latency.

### Server endpoints

| Endpoint | Purpose |
|---|---|
| `POST /voice/incoming` | Return TwiML connecting the call to ConversationRelay. |
| `WSS /voice/session` | Receive Twilio session, prompt, DTMF, and interruption events. |
| `POST /voice/complete` | Receive call completion/status callback. |
| `POST /auth/send-link` | Send a signed, expiring onboarding link. |
| `GET /connect` | Render phone verification and wallet-connect UI. |
| `POST /auth/bento` | Exchange wallet signature for Bento login/register session. |
| `GET /health` | Report service and dependency readiness for the demo. |

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
- `prepare_prediction` is allowed only after market, outcome, and stake are all explicit.
- The model cannot call `commit_prediction` directly.
- Tool arguments are validated with strict schemas and server-side allowlists.
- OpenAI and Twilio receive only the minimum user data required for the call flow.

Reference documentation:

- [OpenAI Realtime and audio](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)

## 15. Twilio integration requirements

- Purchase or configure one Twilio Voice-capable number.
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
