"use client";

import Link from "next/link";
import { useState } from "react";
import type { BetQuote } from "@/lib/bento";
import styles from "./tester.module.css";

type Attempt = { status: number; ok: boolean; data: unknown } | null;

async function api<T = unknown>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

function useAttempt() {
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState<Attempt>(null);

  async function run(fn: () => Promise<{ status: number; data: unknown }>) {
    setLoading(true);
    try {
      const { status, data } = await fn();
      setAttempt({ status, ok: status >= 200 && status < 300, data });
      return { status, data };
    } catch (error) {
      const data = { error: error instanceof Error ? error.message : "Unknown error" };
      setAttempt({ status: 0, ok: false, data });
      return { status: 0, data };
    } finally {
      setLoading(false);
    }
  }

  return { loading, attempt, run };
}

function ResultView({ attempt }: { attempt: Attempt }) {
  if (!attempt) return null;
  return (
    <div>
      <span className={`${styles.status} ${attempt.ok ? styles.statusOk : styles.statusFail}`}>
        HTTP {attempt.status || "network error"}
      </span>
      <pre className={`${styles.result} ${attempt.ok ? "" : styles.resultError}`}>
        {JSON.stringify(attempt.data, null, 2)}
      </pre>
    </div>
  );
}

type Session = { address: string; bearer: string; managedAddress: string };

function SessionPanel({ session, setSession }: { session: Session; setSession: (s: Session) => void }) {
  const { loading, attempt, run } = useAttempt();
  const [error, setError] = useState("");

  async function signIn() {
    setError("");
    try {
      if (!window.ethereum) throw new Error("No wallet extension found (e.g. MetaMask).");
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("Wallet did not return an account.");

      const timestamp = String(Date.now());
      const message = `Bento.fun Login\nTimestamp: ${timestamp}\nWallet: ${address}`;
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const { status, data } = await run(() =>
        api("/api/tester/login", { method: "POST", body: JSON.stringify({ address, signature, timestamp }) }),
      );
      if (status >= 200 && status < 300) {
        const body = data as { token: string; managedAddress?: string };
        setSession({ address, bearer: body.token, managedAddress: body.managedAddress ?? "" });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    }
  }

  return (
    <section className={styles.session}>
      <div className={styles.sessionField}>
        <span>Wallet</span>
        <code>{session.address || "—"}</code>
      </div>
      <div className={styles.sessionField}>
        <span>Managed account</span>
        <code>{session.managedAddress || "—"}</code>
      </div>
      <div className={styles.sessionField}>
        <span>Bearer</span>
        <code>{session.bearer ? `${session.bearer.slice(0, 24)}…` : "—"}</code>
      </div>
      <button type="button" className={styles.button} onClick={signIn} disabled={loading}>
        {loading ? "Signing…" : session.bearer ? "Re-sign in" : "Connect & sign in"}
      </button>
      {session.bearer ? (
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          onClick={() => setSession({ address: "", bearer: "", managedAddress: "" })}
        >
          Clear session
        </button>
      ) : null}
      {error ? <span className={styles.statusFail}>{error}</span> : null}
      {attempt && !attempt.ok ? <ResultView attempt={attempt} /> : null}
    </section>
  );
}

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.card}>
      <h2>{title}</h2>
      <p style={{ margin: "-4px 0 4px", fontSize: "0.8rem", color: "var(--text-muted)" }}>{desc}</p>
      {children}
    </section>
  );
}

function ListMarketsCard() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState("5");
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="List markets" desc="Public read — GET sdk.public.listMarkets (open, credits-only).">
      <div className={styles.row}>
        <label className={styles.field}>
          Query
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="cricket" />
        </label>
        <label className={styles.field}>
          Limit
          <input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="numeric" />
        </label>
      </div>
      <button
        type="button"
        className={styles.button}
        disabled={loading}
        onClick={() =>
          run(() => {
            const params = new URLSearchParams();
            if (query) params.set("query", query);
            if (limit) params.set("limit", limit);
            return api(`/api/tester/markets?${params.toString()}`);
          })
        }
      >
        {loading ? "Loading…" : "Run"}
      </button>
      <ResultView attempt={attempt} />
    </Card>
  );
}

function ListDuelsCard({ onDuelId }: { onDuelId: (duelId: string) => void }) {
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="List all duels" desc="Public read — every status (bootstrapping, open, pending, settled).">
      <button type="button" className={styles.button} disabled={loading} onClick={() => run(() => api("/api/tester/duels"))}>
        {loading ? "Loading…" : "Run"}
      </button>
      {attempt?.ok && Array.isArray((attempt.data as { duels?: unknown[] }).duels) ? (
        <div className={styles.field}>
          <span>Copy a duelId into the fields below</span>
          <select onChange={(event) => onDuelId(event.target.value)} defaultValue="">
            <option value="" disabled>
              Pick a duel…
            </option>
            {((attempt.data as { duels: { duelId: string; question: string }[] }).duels).map((duel) => (
              <option key={duel.duelId} value={duel.duelId}>
                {duel.question.slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <ResultView attempt={attempt} />
    </Card>
  );
}

function GetMarketCard({ duelId, setDuelId }: { duelId: string; setDuelId: (id: string) => void }) {
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="Get market by ID" desc="Public read — sdk.public.getMarketById.">
      <label className={styles.field}>
        Duel ID
        <input value={duelId} onChange={(event) => setDuelId(event.target.value)} placeholder="0x… or hex id" />
      </label>
      <button
        type="button"
        className={styles.button}
        disabled={loading || !duelId}
        onClick={() => run(() => api(`/api/tester/market?duelId=${encodeURIComponent(duelId)}`))}
      >
        {loading ? "Loading…" : "Run"}
      </button>
      <ResultView attempt={attempt} />
    </Card>
  );
}

function EstimateCard({
  duelId,
  setDuelId,
  bearer,
  onQuote,
}: {
  duelId: string;
  setDuelId: (id: string) => void;
  bearer: string;
  onQuote: (quote: BetQuote) => void;
}) {
  const [optionIndex, setOptionIndex] = useState<"0" | "1">("0");
  const [stakeCredits, setStakeCredits] = useState("10");
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="Estimate bet" desc="Authed — prices a stake against a market (sdk.user.estimateBuy).">
      <label className={styles.field}>
        Duel ID
        <input value={duelId} onChange={(event) => setDuelId(event.target.value)} />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          Outcome
          <select value={optionIndex} onChange={(event) => setOptionIndex(event.target.value as "0" | "1")}>
            <option value="0">Option 0</option>
            <option value="1">Option 1</option>
          </select>
        </label>
        <label className={styles.field}>
          Stake (credits)
          <input value={stakeCredits} onChange={(event) => setStakeCredits(event.target.value)} inputMode="numeric" />
        </label>
      </div>
      <button
        type="button"
        className={styles.button}
        disabled={loading || !bearer || !duelId}
        title={!bearer ? "Sign in first" : undefined}
        onClick={async () => {
          const { status, data } = await run(() =>
            api("/api/tester/estimate", {
              method: "POST",
              body: JSON.stringify({ duelId, optionIndex: Number(optionIndex), stakeCredits: Number(stakeCredits), bearer }),
            }),
          );
          if (status >= 200 && status < 300) {
            const body = data as { quote: BetQuote };
            onQuote(body.quote);
          }
        }}
      >
        {loading ? "Pricing…" : "Run"}
      </button>
      <ResultView attempt={attempt} />
    </Card>
  );
}

function PlaceBetCard({ quote, bearer }: { quote: BetQuote | null; bearer: string }) {
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="Place bet from quote" desc="Authed — placeBetFromEstimate using the last quote above. Quotes expire ~60s.">
      {quote ? (
        <pre className={styles.result}>
          {JSON.stringify(
            { duelId: quote.duelId, optionLabel: quote.optionLabel, stakeCredits: quote.stakeCredits, sharesOut: quote.sharesOut },
            null,
            2,
          )}
        </pre>
      ) : (
        <span className={styles.status}>Run &quot;Estimate bet&quot; first.</span>
      )}
      <button
        type="button"
        className={styles.button}
        disabled={loading || !quote || !bearer}
        onClick={() => run(() => api("/api/tester/place", { method: "POST", body: JSON.stringify({ quote, bearer }) }))}
      >
        {loading ? "Placing…" : "Place bet"}
      </button>
      <ResultView attempt={attempt} />
    </Card>
  );
}

function SharesCard({ duelId, setDuelId, managedAddress, bearer }: { duelId: string; setDuelId: (id: string) => void; managedAddress: string; bearer: string }) {
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="Get user shares" desc="Authed — your managed account's position in a market.">
      <label className={styles.field}>
        Duel ID
        <input value={duelId} onChange={(event) => setDuelId(event.target.value)} />
      </label>
      <button
        type="button"
        className={styles.button}
        disabled={loading || !duelId || !bearer || !managedAddress}
        title={!bearer ? "Sign in first" : undefined}
        onClick={() =>
          run(() => api("/api/tester/shares", { method: "POST", body: JSON.stringify({ duelId, managedAddress, bearer }) }))
        }
      >
        {loading ? "Loading…" : "Run"}
      </button>
      <ResultView attempt={attempt} />
    </Card>
  );
}

function FaucetCard({ managedAddress, bearer }: { managedAddress: string; bearer: string }) {
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="Faucet mint" desc="Testnet auto-mint of USDC + play credits to your managed account.">
      <span className={styles.status}>Target: {managedAddress || "sign in to load managed account"}</span>
      <button
        type="button"
        className={styles.button}
        disabled={loading || !managedAddress}
        onClick={() =>
          run(() => api("/api/tester/faucet", { method: "POST", body: JSON.stringify({ managedAddress, bearer }) }))
        }
      >
        {loading ? "Minting…" : "Mint testnet funds"}
      </button>
      <ResultView attempt={attempt} />
    </Card>
  );
}

const CATEGORIES = ["Cricket", "Football", "Basketball", "American Football", "Tennis", "Baseball", "Hockey", "Formula 1"];

function localDateTime(offsetMs: number) {
  const date = new Date(Date.now() + offsetMs);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function CreateDuelCard({ bearer }: { bearer: string }) {
  const [question, setQuestion] = useState("Will this tester create a valid duel?");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [optionA, setOptionA] = useState("Yes");
  const [optionB, setOptionB] = useState("No");
  const [startTime, setStartTime] = useState(() => localDateTime(35 * 60 * 1000));
  const [endTime, setEndTime] = useState(() => localDateTime(24 * 60 * 60 * 1000));
  const { loading, attempt, run } = useAttempt();

  return (
    <Card title="Create duel" desc="Authed — publishes a public, credits-collateral duel (sdk.user.createDuel).">
      <label className={styles.field}>
        Question
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Outcome A
          <input value={optionA} onChange={(event) => setOptionA(event.target.value)} />
        </label>
        <label className={styles.field}>
          Outcome B
          <input value={optionB} onChange={(event) => setOptionB(event.target.value)} />
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          Starts (≥31min out)
          <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label className={styles.field}>
          Closes
          <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className={styles.button}
        disabled={loading || !bearer}
        title={!bearer ? "Sign in first" : undefined}
        onClick={() =>
          run(() =>
            api("/api/tester/create-duel", {
              method: "POST",
              body: JSON.stringify({
                question,
                category,
                optionA,
                optionB,
                startTime: new Date(startTime).toISOString(),
                endTime: new Date(endTime).toISOString(),
                bearer,
              }),
            }),
          )
        }
      >
        {loading ? "Publishing…" : "Create duel"}
      </button>
      <ResultView attempt={attempt} />
    </Card>
  );
}

export default function TesterPage() {
  const [session, setSession] = useState<Session>({ address: "", bearer: "", managedAddress: "" });
  const [duelId, setDuelId] = useState("");
  const [quote, setQuote] = useState<BetQuote | null>(null);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>Bento SDK tester</h1>
        <nav style={{ display: "flex", gap: 14 }}>
          <Link href="/agent-chat">Agent chat →</Link>
          <Link href="/duels">← Back to duels</Link>
        </nav>
      </header>

      <SessionPanel session={session} setSession={setSession} />

      <div className={styles.grid}>
        <ListMarketsCard />
        <ListDuelsCard onDuelId={setDuelId} />
        <GetMarketCard duelId={duelId} setDuelId={setDuelId} />
        <EstimateCard duelId={duelId} setDuelId={setDuelId} bearer={session.bearer} onQuote={setQuote} />
        <PlaceBetCard quote={quote} bearer={session.bearer} />
        <SharesCard duelId={duelId} setDuelId={setDuelId} managedAddress={session.managedAddress} bearer={session.bearer} />
        <FaucetCard managedAddress={session.managedAddress} bearer={session.bearer} />
        <CreateDuelCard bearer={session.bearer} />
      </div>
    </main>
  );
}
