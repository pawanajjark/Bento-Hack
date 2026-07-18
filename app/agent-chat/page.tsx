"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./agent-chat.module.css";

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
      {attempt && !attempt.ok ? (
        <pre className={`${styles.result} ${styles.resultError}`}>{JSON.stringify(attempt.data, null, 2)}</pre>
      ) : null}
    </section>
  );
}

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; args: unknown; result: string }[];
  isError?: boolean;
};

export default function AgentChatPage() {
  const [session, setSession] = useState<Session>({ address: "", bearer: "", managedAddress: "" });
  const [phone, setPhone] = useState("");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);
    try {
      const { status, data } = await api<{ reply: string; toolCalls: ChatTurn["toolCalls"]; error?: string }>(
        "/api/tester/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message,
            history,
            bearer: session.bearer,
            managedAddress: session.managedAddress,
            phone,
          }),
        },
      );
      if (status >= 200 && status < 300) {
        setTurns((prev) => [...prev, { role: "assistant", content: data.reply, toolCalls: data.toolCalls }]);
      } else {
        setTurns((prev) => [...prev, { role: "assistant", content: data.error ?? "Agent call failed.", isError: true }]);
      }
    } catch (error) {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: error instanceof Error ? error.message : "Agent call failed.", isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1>Bento agent chat</h1>
          <nav className={styles.nav}>
            <Link href="/tester">SDK tester</Link>
            <Link href="/duels">← Back to duels</Link>
          </nav>
        </header>
        <p className={styles.desc}>
          Text-drives the same LangChain agent + tools the voice hotline uses (lib/agent). Faster to iterate on
          tool-calling than a phone call.
        </p>

        <SessionPanel session={session} setSession={setSession} />

        <label className={styles.field}>
          Phone (optional, for phone-linked tools like account balance)
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91..." />
        </label>

        <div className={styles.chatShell}>
          <div className={styles.chatLog}>
            {turns.length === 0 ? (
              <span className={styles.chatEmpty}>
                {session.bearer
                  ? "Say hi, list markets, or ask to place a prediction."
                  : "Sign in above for authed tools, or just chat with public reads."}
              </span>
            ) : null}
            {turns.map((turn, i) => (
              <div key={i} className={`${styles.bubbleRow} ${turn.role === "user" ? styles.bubbleRowUser : ""}`}>
                <div>
                  <div
                    className={`${styles.bubble} ${turn.role === "user" ? styles.bubbleUser : styles.bubbleAssistant} ${
                      turn.isError ? styles.bubbleError : ""
                    }`}
                  >
                    {turn.content}
                  </div>
                  {turn.toolCalls && turn.toolCalls.length > 0 ? (
                    <details className={styles.trace}>
                      <summary>
                        {turn.toolCalls.length} tool call{turn.toolCalls.length > 1 ? "s" : ""}
                      </summary>
                      {turn.toolCalls.map((call, j) => (
                        <div key={j} className={styles.traceItem}>
                          <div>
                            <code>{call.name}</code>({JSON.stringify(call.args)})
                          </div>
                          <div>{call.result}</div>
                        </div>
                      ))}
                    </details>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.chatInputRow}>
            <textarea
              rows={2}
              value={input}
              placeholder="Type what a caller might say…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button type="button" className={styles.button} disabled={loading || !input.trim()} onClick={send}>
              {loading ? "Thinking…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
