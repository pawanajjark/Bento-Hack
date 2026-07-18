"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Coins,
  Copy,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BentoLogo } from "@/components/bento-logo";
import type { DuelStatus, DuelSummaryView } from "@/lib/bento";
import {
  PUBLIC_DUEL_MIN_DURATION_MS,
  PUBLIC_DUEL_MIN_LEAD_MS,
  validateDuelSchedule,
} from "@/lib/duel-schedule";

type Filter = "all" | DuelStatus;
type FormState = {
  question: string;
  category: string;
  description: string;
  optionA: string;
  optionB: string;
  startTime: string;
  endTime: string;
};

const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All duels" },
  { key: "bootstrapping", label: "Bootstrapping" },
  { key: "open", label: "Live" },
  { key: "pending", label: "Upcoming" },
  { key: "pending_contest", label: "In review" },
  { key: "settled", label: "Settled" },
];

const categories = [
  "Cricket",
  "Football",
  "Basketball",
  "American Football",
  "Tennis",
  "Baseball",
  "Hockey",
  "Formula 1",
];

function localDateTime(offsetMs: number, roundUp = false) {
  const timestamp = Date.now() + offsetMs;
  const date = new Date(roundUp ? Math.ceil(timestamp / 60_000) * 60_000 : timestamp);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function minimumEndTime(startTime: string) {
  const start = new Date(startTime);
  if (Number.isNaN(start.valueOf())) return startTime;
  const end = new Date(start.valueOf() + PUBLIC_DUEL_MIN_DURATION_MS);
  end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
  return end.toISOString().slice(0, 16);
}

const emptyForm = (): FormState => ({
  question: "",
  category: "Cricket",
  description: "",
  optionA: "Yes",
  optionB: "No",
  startTime: localDateTime(60 * 60 * 1000, true),
  endTime: localDateTime(24 * 60 * 60 * 1000),
});

function statusLabel(status: DuelStatus) {
  return {
    bootstrapping: "Bootstrapping",
    open: "Live",
    pending: "Upcoming",
    pending_contest: "In review",
    settled: "Settled",
  }[status];
}

function timeLeft(seconds?: number) {
  if (!seconds || seconds <= 0) return "Closed";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h left`;
  if (hours) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

function DuelRow({ duel, onBet }: { duel: DuelSummaryView; onBet: () => void }) {
  const [copied, setCopied] = useState(false);
  const bettingClosed = duel.status === "settled"
    || duel.status === "pending"
    || duel.status === "pending_contest"
    || (typeof duel.endsIn === "number" && duel.endsIn <= 0);

  async function copyId() {
    await navigator.clipboard.writeText(duel.duelId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article className="duel-row">
      <div className="duel-row-main">
        <div className="duel-meta-line">
          <span className={`duel-status status-${duel.status}`}>
            <CircleDot size={13} aria-hidden="true" />
            {statusLabel(duel.status)}
          </span>
          <span>{duel.category ?? "General"}</span>
          <span className="duel-id">#{duel.duelId.slice(-7)}</span>
        </div>
        <h2>{duel.question}</h2>
        <div className="duel-outcomes" aria-label="Possible outcomes">
          {duel.options.map((option) => (
            <span key={option.index}>{option.label}</span>
          ))}
        </div>
      </div>

      <div className="duel-row-aside">
        <div className="duel-stat">
          <Users size={17} aria-hidden="true" />
          <span><strong>{duel.participants.toLocaleString()}</strong> players</span>
        </div>
        <div className="duel-stat">
          <Clock3 size={17} aria-hidden="true" />
          <span>{duel.status === "settled" ? "Settled" : timeLeft(duel.endsIn)}</span>
        </div>
        <div className="duel-row-actions">
          <button className="duel-bet" type="button" onClick={onBet} disabled={bettingClosed}>
            <Coins size={17} aria-hidden="true" />
            {bettingClosed ? "Betting closed" : "Place bet"}
          </button>
          <button className="duel-copy" type="button" onClick={copyId} aria-label="Copy duel ID">
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? "Copied" : "Copy ID"}
          </button>
        </div>
      </div>
    </article>
  );
}

type PreparedBet = {
  confirmationToken: string;
  expiresInSeconds: number;
  question: string;
  optionLabel: string;
  stakeCredits: number;
  estimatedShares: number;
  minSharesOut: number;
};

type PlacedBetResult = {
  accepted: boolean;
  requestId: string;
  sharesOut: number;
  stakeCredits: number;
  optionLabel: string;
};

function formatShares(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function BetDuelPanel({ duel, onClose }: { duel: DuelSummaryView; onClose: () => void }) {
  const [optionIndex, setOptionIndex] = useState<0 | 1>(0);
  const [stake, setStake] = useState("10");
  const [busy, setBusy] = useState<"quote" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<PreparedBet | null>(null);
  const [result, setResult] = useState<PlacedBetResult | null>(null);

  function storedSession() {
    const raw = window.localStorage.getItem("bento.session");
    const stored = raw ? JSON.parse(raw) as { phone?: string; walletAddress?: string } : null;
    if (!stored?.phone || !stored.walletAddress) {
      throw new Error("Log in with your phone number and connect MetaMask on the home page first.");
    }
    return stored;
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const stakeCredits = Number(stake);
      if (!Number.isSafeInteger(stakeCredits) || stakeCredits <= 0) {
        throw new Error("Enter a whole-number credit amount greater than zero.");
      }
      if (!window.ethereum) {
        throw new Error("Open this page in a browser with MetaMask to place a bet.");
      }

      setBusy("quote");
      const session = storedSession();
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("MetaMask did not return an account.");
      if (session.walletAddress?.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Switch MetaMask to the wallet linked to your Bento account.");
      }

      const timestamp = String(Date.now());
      const message = `Bento.fun Login\nTimestamp: ${timestamp}\nWallet: ${address}`;
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const response = await fetch("/api/bets/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: session.phone,
          address,
          signature,
          timestamp,
          duelId: duel.duelId,
          optionIndex,
          stakeCredits,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bento could not price this bet.");
      setQuote(data as PreparedBet);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bento could not price this bet.");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!quote) return;
    setError("");

    try {
      setBusy("confirm");
      const session = storedSession();
      const response = await fetch("/api/bets/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: session.phone, confirmationToken: quote.confirmationToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Bento could not place this bet.");
      setResult(data as PlacedBetResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bento could not place this bet.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="duel-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="duel-dialog bet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bet-duel-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close bet panel">
          <X size={21} />
        </button>

        {result ? (
          <div className="duel-success bet-success">
            <span className="success-mark"><Check size={34} /></span>
            <p className="dialog-kicker">Bet accepted</p>
            <h2 id="bet-duel-title">You&apos;re in.</h2>
            <p>{result.stakeCredits.toLocaleString()} credits on <strong>{result.optionLabel}</strong>.</p>
            <div className="bet-review-card">
              <div><span>Estimated shares</span><strong>{formatShares(result.sharesOut)}</strong></div>
              <div><span>Request ID</span><strong className="bet-request-id">{result.requestId}</strong></div>
            </div>
            <button className="create-submit" type="button" onClick={onClose}>
              Done <Check size={19} />
            </button>
          </div>
        ) : quote ? (
          <div className="bet-review-step">
            <div className="dialog-heading">
              <p className="dialog-kicker">Review your bet</p>
              <h2 id="bet-duel-title">Confirm once.</h2>
              <p>{quote.question}</p>
            </div>

            <div className="bet-review-card">
              <div><span>Outcome</span><strong>{quote.optionLabel}</strong></div>
              <div><span>Stake</span><strong>{quote.stakeCredits.toLocaleString()} credits</strong></div>
              <div><span>Estimated shares</span><strong>{formatShares(quote.estimatedShares)}</strong></div>
              <div><span>Minimum shares</span><strong>{formatShares(quote.minSharesOut)}</strong></div>
            </div>

            <div className="bet-safety">
              <ShieldCheck size={19} aria-hidden="true" />
              <span><strong>Quote valid for {quote.expiresInSeconds} seconds.</strong>This final button spends your play credits.</span>
            </div>

            {error ? <p className="duel-form-error" role="alert">{error}</p> : null}

            <button className="create-submit" type="button" disabled={busy === "confirm"} onClick={confirm}>
              <span>{busy === "confirm" ? "Placing bet" : `Confirm & place ${quote.stakeCredits.toLocaleString()} credits`}</span>
              {busy === "confirm" ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={19} />}
            </button>
            <button
              className="bet-secondary"
              type="button"
              disabled={busy === "confirm"}
              onClick={() => { setQuote(null); setError(""); }}
            >
              Change bet
            </button>
          </div>
        ) : (
          <form onSubmit={prepare}>
            <div className="dialog-heading">
              <p className="dialog-kicker">Place a bet</p>
              <h2 id="bet-duel-title">Pick your side.</h2>
              <p className="bet-question">{duel.question}</p>
            </div>

            <fieldset className="bet-options">
              <legend>Choose an outcome</legend>
              {duel.options.map((option) => (
                <button
                  key={option.index}
                  className={optionIndex === option.index ? "selected" : ""}
                  type="button"
                  aria-pressed={optionIndex === option.index}
                  onClick={() => { setOptionIndex(option.index); setError(""); }}
                >
                  <span>{option.label}</span>
                  {optionIndex === option.index ? <Check size={18} /> : null}
                </button>
              ))}
            </fieldset>

            <label className="duel-field bet-stake-field">
              <span>Stake in play credits</span>
              <span className="bet-stake-input"><Coins size={18} /><input inputMode="numeric" min="1" step="1" required value={stake} onChange={(event) => { setStake(event.target.value); setError(""); }} /></span>
            </label>
            <div className="bet-presets" aria-label="Quick stake amounts">
              {[10, 25, 50, 100].map((amount) => (
                <button key={amount} type="button" className={stake === String(amount) ? "selected" : ""} onClick={() => setStake(String(amount))}>
                  {amount}
                </button>
              ))}
            </div>

            <div className="bet-safety">
              <ShieldCheck size={19} aria-hidden="true" />
              <span><strong>Review first. Nothing is placed yet.</strong>MetaMask signs one login message; your Bento play credits fund the bet.</span>
            </div>

            {error ? <p className="duel-form-error" role="alert">{error}</p> : null}

            <button className="create-submit" type="submit" disabled={busy === "quote"}>
              <span>{busy === "quote" ? "Waiting for MetaMask" : "Sign & get live quote"}</span>
              {busy === "quote" ? <LoaderCircle className="spin" size={20} /> : <Wallet size={19} />}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function CreateDuelPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (duel: DuelSummaryView) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadedCredits, setLoadedCredits] = useState<number | null>(null);
  const [success, setSuccess] = useState<{ duelId: string; question: string } | null>(null);
  const [minimumStart, setMinimumStart] = useState(() => localDateTime(PUBLIC_DUEL_MIN_LEAD_MS, true));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("bento.session");
      const stored = raw ? JSON.parse(raw) as { phone?: string } : null;
      if (!stored?.phone) return;
      fetch(`/api/credits?phone=${encodeURIComponent(stored.phone)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((result) => {
          if (result && typeof result.balance === "number") setLoadedCredits(result.balance);
        })
        .catch(() => {});
    } catch {
      // The account summary is helpful context, not required to create.
    }
  }, []);

  useEffect(() => {
    const refreshMinimum = () => setMinimumStart(localDateTime(PUBLIC_DUEL_MIN_LEAD_MS, true));
    const timer = window.setInterval(refreshMinimum, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const schedule = validateDuelSchedule(form.startTime, form.endTime);
      if (!schedule.valid) throw new Error(schedule.error);

      setBusy(true);
      if (!window.ethereum) {
        throw new Error("Open this page in a browser with a wallet extension to publish a duel.");
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("Your wallet did not return an account.");

      let linkedPhone = "";
      try {
        const raw = window.localStorage.getItem("bento.session");
        const stored = raw ? JSON.parse(raw) as { phone?: string; walletAddress?: string } : null;
        if (stored?.walletAddress && stored.walletAddress.toLowerCase() !== address.toLowerCase()) {
          throw new Error("Switch to the wallet linked to your Bento play-credit account before publishing.");
        }
        linkedPhone = stored?.phone ?? "";
      } catch (reason) {
        if (reason instanceof Error) throw reason;
      }

      const timestamp = String(Date.now());
      const message = `Bento.fun Login\nTimestamp: ${timestamp}\nWallet: ${address}`;
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const response = await fetch("/api/duels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
          address,
          phone: linkedPhone,
          timestamp,
          signature,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The duel could not be created.");

      const duel: DuelSummaryView = {
        duelId: result.duelId,
        question: form.question,
        options: [
          { index: 0, label: form.optionA },
          { index: 1, label: form.optionB },
        ],
        collateralMode: "credits",
        category: form.category,
        endsIn: Math.max(0, Math.floor((new Date(form.endTime).valueOf() - Date.now()) / 1000)),
        status: "pending",
        participants: 0,
        volume: 0,
        description: form.description,
      };
      onCreated(duel);
      setSuccess({ duelId: result.duelId, question: form.question });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The duel could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="duel-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="duel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-duel-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close create duel panel">
          <X size={21} />
        </button>

        {success ? (
          <div className="duel-success">
            <span className="success-mark"><Check size={34} /></span>
            <p className="dialog-kicker">Accepted by Bento</p>
            <h2 id="create-duel-title">Your duel is on its way.</h2>
            <p>{success.question}</p>
            <div className="created-id"><span>Duel ID</span><strong>{success.duelId}</strong></div>
            <p className="dialog-helper">It can take a moment for a newly created duel to become public.</p>
            <button className="create-submit" type="button" onClick={onClose}>
              Back to all duels <ArrowRight size={19} />
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="dialog-heading">
              <p className="dialog-kicker">New prediction</p>
              <h2 id="create-duel-title">Create a duel</h2>
              <p>Set the question, outcomes, and schedule. Your wallet signs once to publish.</p>
            </div>

            <label className="duel-field duel-field-wide">
              <span>Question</span>
              <textarea
                required
                minLength={10}
                maxLength={180}
                placeholder="Will India win the next T20 international?"
                value={form.question}
                onChange={(event) => update("question", event.target.value)}
              />
              <small>{form.question.length}/180</small>
            </label>

            <div className="duel-form-grid">
              <label className="duel-field">
                <span>Category</span>
                <span className="select-wrap">
                  <select value={form.category} onChange={(event) => update("category", event.target.value)}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                  <ChevronDown size={17} aria-hidden="true" />
                </span>
              </label>
              <label className="duel-field">
                <span>Starts</span>
                <input
                  type="datetime-local"
                  required
                  min={minimumStart}
                  aria-describedby="duel-start-help"
                  value={form.startTime}
                  onInvalid={(event) => {
                    event.preventDefault();
                    setError("Public duels must start at least 31 minutes from now.");
                  }}
                  onChange={(event) => {
                    const nextStart = event.target.value;
                    update("startTime", nextStart);
                    if (new Date(form.endTime).valueOf() < new Date(nextStart).valueOf() + PUBLIC_DUEL_MIN_DURATION_MS) {
                      const nextEnd = new Date(new Date(nextStart).valueOf() + 60 * 60 * 1000);
                      nextEnd.setMinutes(nextEnd.getMinutes() - nextEnd.getTimezoneOffset());
                      update("endTime", nextEnd.toISOString().slice(0, 16));
                    }
                  }}
                />
                <small className="field-help" id="duel-start-help">At least 31 minutes from now</small>
              </label>
              <label className="duel-field">
                <span>Closes</span>
                <input
                  type="datetime-local"
                  required
                  min={minimumEndTime(form.startTime)}
                  value={form.endTime}
                  onInvalid={(event) => {
                    event.preventDefault();
                    setError("Closing time must be at least 15 minutes after the start.");
                  }}
                  onChange={(event) => update("endTime", event.target.value)}
                />
              </label>
              <label className="duel-field">
                <span>Outcome A</span>
                <input required maxLength={50} value={form.optionA} onChange={(event) => update("optionA", event.target.value)} />
              </label>
              <label className="duel-field">
                <span>Outcome B</span>
                <input required maxLength={50} value={form.optionB} onChange={(event) => update("optionB", event.target.value)} />
              </label>
            </div>

            <label className="duel-field duel-field-wide">
              <span>Resolution note <em>Optional</em></span>
              <textarea
                className="description-input"
                maxLength={400}
                placeholder="Describe the source or rule that decides the result."
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </label>

            <div className="publish-note">
              <ShieldCheck size={19} aria-hidden="true" />
              <span>
                <strong>
                  Public · Play credits
                  {loadedCredits !== null ? ` · ${loadedCredits.toLocaleString()} cached` : ""}
                </strong>
                Your wallet only signs a login message—there is no wallet payment.
              </span>
            </div>

            {error ? <p className="duel-form-error" role="alert">{error}</p> : null}

            <button className="create-submit" type="submit" disabled={busy}>
              <span>{busy ? "Waiting for wallet" : "Sign & publish duel"}</span>
              {busy ? <LoaderCircle className="spin" size={20} /> : <Wallet size={19} />}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export function DuelsBoard({
  initialDuels,
  isDemo,
  connectionIssue,
}: {
  initialDuels: DuelSummaryView[];
  isDemo: boolean;
  connectionIssue: string;
}) {
  const [duels, setDuels] = useState(initialDuels);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [betDuel, setBetDuel] = useState<DuelSummaryView | null>(null);

  const visibleDuels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return duels.filter((duel) => {
      const matchesFilter = filter === "all" || duel.status === filter;
      const matchesQuery = !needle || `${duel.question} ${duel.category} ${duel.duelId}`.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [duels, filter, query]);

  return (
    <main className="duels-shell">
      <header className="duels-header">
        <Link className="brand" href="/" aria-label="Bento Hotline home">
          <BentoLogo />
          <span>Bento Hotline</span>
        </Link>
        <nav className="duels-nav" aria-label="Main navigation">
          <Link href="/" className="duels-back"><ArrowLeft size={17} /> Home</Link>
          <span className="nav-active">Duels</span>
          <button type="button" className="header-create" onClick={() => setCreateOpen(true)}>
            <Plus size={18} /> Create duel
          </button>
        </nav>
      </header>

      <section className="duels-page">
        <div className="duels-intro">
          <div>
            <h1>Every duel,<br /><span>one arena.</span></h1>
            <p>Explore live predictions, see what the crowd is playing, or put your own question on the board.</p>
          </div>
          <button type="button" className="intro-create" onClick={() => setCreateOpen(true)}>
            <span className="intro-create-icon"><Plus size={25} /></span>
            <span><strong>Create a duel</strong><small>Turn a question into a live market</small></span>
            <ArrowRight size={21} />
          </button>
        </div>

        {isDemo ? (
          <div className="demo-notice" title={connectionIssue}>
            <Sparkles size={17} aria-hidden="true" />
            Bento&apos;s live catalog is temporarily unavailable. Showing preview duels.
          </div>
        ) : null}

        <div className="duels-toolbar">
          <div className="duel-filters" role="group" aria-label="Filter duels">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                className={filter === item.key ? "active" : ""}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span>{item.key === "all" ? duels.length : duels.filter((duel) => duel.status === item.key).length}</span>
              </button>
            ))}
          </div>
          <label className="duel-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search duels</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search duels" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button> : null}
          </label>
        </div>

        <div className="duels-list-heading">
          <span>{visibleDuels.length} {visibleDuels.length === 1 ? "duel" : "duels"}</span>
          <span>Updated now</span>
        </div>

        <section className="duels-list" aria-live="polite">
          {visibleDuels.length ? visibleDuels.map((duel) => (
            <DuelRow key={duel.duelId} duel={duel} onBet={() => setBetDuel(duel)} />
          )) : (
            <div className="duels-empty">
              <Search size={28} />
              <h2>No duels found</h2>
              <p>Try another search or create the first duel in this category.</p>
              <button type="button" onClick={() => setCreateOpen(true)}>Create a duel</button>
            </div>
          )}
        </section>
      </section>

      {createOpen ? (
        <CreateDuelPanel
          onClose={() => setCreateOpen(false)}
          onCreated={(duel) => {
            setDuels((current) => [duel, ...current]);
            setFilter("all");
            setQuery("");
          }}
        />
      ) : null}

      {betDuel ? <BetDuelPanel duel={betDuel} onClose={() => setBetDuel(null)} /> : null}
    </main>
  );
}
