"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Coins,
  Copy,
  LoaderCircle,
  LockKeyhole,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Step = "phone" | "code" | "wallet" | "ready";

const steps = [
  { key: "phone", label: "Phone" },
  { key: "wallet", label: "Wallet" },
  { key: "ready", label: "Ready" },
] as const;

const stepOrder: Record<Step, number> = {
  phone: 0,
  code: 0,
  wallet: 1,
  ready: 2,
};

function StepProgress({ currentStep }: { currentStep: Step }) {
  const activeIndex = stepOrder[currentStep];

  return (
    <ol className="step-progress" aria-label="Onboarding progress">
      {steps.map((step, index) => {
        const isComplete = index < activeIndex;
        const isActive = index === activeIndex;

        return (
          <li
            className={isActive ? "active" : isComplete ? "complete" : ""}
            key={step.key}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="step-node">
              {isComplete ? <Check size={18} strokeWidth={2.4} /> : index + 1}
            </span>
            <span className="step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PhoneStep({
  phone,
  setPhone,
  onSubmit,
  isBusy,
  error,
}: {
  phone: string;
  setPhone: (phone: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isBusy: boolean;
  error: string;
}) {
  return (
    <form onSubmit={onSubmit} className="step-content">
      <div className="step-heading">
        <h2>Start with your phone</h2>
        <p>We&apos;ll use this number to recognize you when you call.</p>
      </div>

      <div className="phone-row">
        <button className="country-code" type="button" aria-label="Country code India, plus 91">
          +91
          <ChevronDown size={19} aria-hidden="true" />
        </button>
        <label className="sr-only" htmlFor="phone-number">
          Mobile number
        </label>
        <input
          id="phone-number"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          pattern="[0-9]{10}"
          placeholder="98765 43210"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}
        />
      </div>

      {error ? <p className="error-message" role="alert">{error}</p> : null}

      <button className="primary-button" type="submit" disabled={isBusy}>
        <span>{isBusy ? "Calling you" : "Call me with a code"}</span>
        {isBusy ? (
          <LoaderCircle className="spin" size={21} aria-hidden="true" />
        ) : (
          <ArrowRight size={21} aria-hidden="true" />
        )}
      </button>

      <p className="consent-copy">
        <LockKeyhole size={18} aria-hidden="true" />
        By continuing, you agree to receive an automated one-time verification call.
      </p>
    </form>
  );
}

function CodeStep({
  phone,
  onBack,
  onVerified,
}: {
  phone: string;
  onBack: () => void;
  onVerified: () => void;
}) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [isBusy, setIsBusy] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setError("");
    setDigits((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));
    if (digit && index < refs.current.length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (digits.some((digit) => !digit)) return;
    setIsBusy(true);
    setError("");

    try {
      const response = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: digits.join("") }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error ?? "The code could not be verified.");
      onVerified();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The code could not be verified.");
      setIsBusy(false);
    }
  }

  async function resendCode() {
    setIsResending(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/verify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error ?? "We could not place another call.");
      setNotice("A new verification call is on its way.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not place another call.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <form onSubmit={submitCode} className="step-content">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Change number
      </button>
      <div className="step-heading">
        <h2>Enter your code</h2>
        <p>Answer the call to +91 {phone.slice(0, 5)} {phone.slice(5)} and enter the six-digit code read aloud.</p>
      </div>

      <div className="otp-row" aria-label="Six-digit verification code">
        {digits.map((digit, index) => (
          <input
            aria-label={`Digit ${index + 1}`}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            inputMode="numeric"
            key={index}
            maxLength={1}
            ref={(element) => {
              refs.current[index] = element;
            }}
            value={digit}
            onChange={(event) => updateDigit(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
          />
        ))}
      </div>

      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {notice ? <p className="inline-note" role="status">{notice}</p> : null}

      <button className="primary-button" type="submit" disabled={digits.some((digit) => !digit) || isBusy}>
        <span>{isBusy ? "Verifying" : "Verify phone"}</span>
        {isBusy ? <LoaderCircle className="spin" size={21} /> : <ArrowRight size={21} />}
      </button>

      <p className="inline-note">
        Didn&apos;t get the call?{" "}
        <button type="button" onClick={resendCode} disabled={isResending}>
          {isResending ? "Calling again…" : "Call again"}
        </button>
      </p>
    </form>
  );
}

function WalletStep({
  phone,
  onBack,
  onReady,
}: {
  phone: string;
  onBack: () => void;
  onReady: (address: string) => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  async function connectWallet() {
    setError("");
    setIsBusy(true);

    try {
      if (!window.ethereum) {
        throw new Error("No wallet found. Open this page in a browser with a wallet extension.");
      }

      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("The wallet did not return an account.");

      const timestamp = String(Date.now());
      // Must match Bento's EoaLoginDto message exactly (no extra spaces).
      const message = `Bento.fun Login\nTimestamp: ${timestamp}\nWallet: ${address}`;
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const response = await fetch("/api/auth/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, address, timestamp, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We couldn't link your wallet.");

      onReady(address);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Wallet connection was cancelled.";
      setError(message);
      setIsBusy(false);
    }
  }

  return (
    <div className="step-content">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Back
      </button>
      <div className="step-heading">
        <h2>Connect your wallet</h2>
        <p>Sign one Bento login message. No transaction and no wallet payment are required.</p>
      </div>

      <div className="wallet-explainer">
        <span className="wallet-visual" aria-hidden="true">
          <Wallet size={30} strokeWidth={1.7} />
        </span>
        <div>
          <strong>Your wallet stays yours</strong>
          <span>We never ask for a private key or move funds.</span>
        </div>
      </div>

      {error ? <p className="error-message" role="alert">{error}</p> : null}

      <button className="primary-button" type="button" onClick={connectWallet} disabled={isBusy}>
        <span>{isBusy ? "Waiting for wallet" : "Connect and sign"}</span>
        {isBusy ? <LoaderCircle className="spin" size={21} /> : <ArrowRight size={21} />}
      </button>

      <p className="consent-copy">
        <ShieldCheck size={18} aria-hidden="true" />
        Linking +91 {phone.slice(0, 5)} {phone.slice(5)} to your Bento play account.
      </p>
    </div>
  );
}

function ReadyStep({
  phone,
  walletAddress,
  onRestart,
}: {
  phone: string;
  walletAddress: string;
  onRestart: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [creditsError, setCreditsError] = useState("");
  const hotlineNumber = "+1 224 506 0785";
  const shortAddress = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;

  useEffect(() => {
    fetch(`/api/credits?phone=${encodeURIComponent(phone)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.balance === "number") setBalance(data.balance);
      })
      .catch(() => {});
  }, [phone]);

  async function loadCredits() {
    setLoadingCredits(true);
    setCreditsError("");
    try {
      const response = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load credits.");
      setBalance(result.balance);
    } catch (reason) {
      setCreditsError(reason instanceof Error ? reason.message : "Could not load credits.");
    } finally {
      setLoadingCredits(false);
    }
  }

  async function copyNumber() {
    await navigator.clipboard.writeText(hotlineNumber.replace(/\s/g, ""));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="step-content ready-content">
      <span className="success-mark" aria-hidden="true">
        <CircleCheck size={38} strokeWidth={1.8} />
      </span>
      <div className="step-heading">
        <h2>You&apos;re ready to call</h2>
        <p>Your phone and wallet are connected to your Bento play-credit account.</p>
      </div>

      <button className="hotline-number" type="button" onClick={copyNumber}>
        <span>
          <small>Bento Hotline</small>
          <strong>{hotlineNumber}</strong>
        </span>
        {copied ? <Check size={22} /> : <Copy size={21} />}
      </button>

      <div className="credits-card">
        <span className="credits-amount">
          <Coins size={20} aria-hidden="true" />
          <strong>{balance === null ? "—" : balance.toLocaleString()}</strong>
          <small>play credits</small>
        </span>
        <button
          className="secondary-button"
          type="button"
          onClick={loadCredits}
          disabled={loadingCredits}
        >
          {loadingCredits ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Coins size={16} />
          )}
          {loadingCredits ? "Loading" : "Load 1,000 credits"}
        </button>
      </div>

      {creditsError ? <p className="error-message" role="alert">{creditsError}</p> : null}

      <div className="linked-details">
        <span><PhoneCall size={16} /> +91 {phone.slice(0, 5)} {phone.slice(5)}</span>
        <span><Wallet size={16} /> {shortAddress}</span>
      </div>

      <button className="secondary-button" type="button" onClick={onRestart}>
        <RotateCcw size={17} /> Restart demo
      </button>
    </div>
  );
}

const SESSION_KEY = "bento.session";

type StoredSession = { phone: string; walletAddress: string };

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (parsed && parsed.phone && parsed.walletAddress) {
      return { phone: parsed.phone, walletAddress: parsed.walletAddress };
    }
  } catch {
    // Corrupt or unavailable storage — treat as no session.
  }
  return null;
}

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Restore a previously linked session so a refresh doesn't restart onboarding.
  // localStorage is client-only, so this must run after mount (not in a useState
  // initializer, which would diverge from the SSR render and break hydration).
  useEffect(() => {
    const session = readSession();
    if (session) {
      /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
      setPhone(session.phone);
      setWalletAddress(session.walletAddress);
      setStep("ready");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    setHydrated(true);
  }, []);

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Read the real field value rather than trusting the mirrored React state:
    // autofill/paste can populate the input without firing onChange.
    const input = event.currentTarget.querySelector<HTMLInputElement>("#phone-number");
    const value = (input?.value ?? phone).replace(/\D/g, "");
    if (value !== phone) setPhone(value);

    if (value.length !== 10) {
      setPhoneError("Enter your 10-digit mobile number.");
      return;
    }

    setIsBusy(true);
    setPhoneError("");

    try {
      const response = await fetch("/api/verify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error ?? "We could not place the verification call.");
      setStep("code");
    } catch (reason) {
      setPhoneError(reason instanceof Error ? reason.message : "We could not place the verification call.");
    } finally {
      setIsBusy(false);
    }
  }

  function restart() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore storage errors — state reset below is what matters.
    }
    setPhone("");
    setWalletAddress("");
    setPhoneError("");
    setStep("phone");
  }

  if (!hydrated) {
    return (
      <section className="onboarding-panel" aria-live="polite" aria-busy="true">
        <StepProgress currentStep="phone" />
      </section>
    );
  }

  return (
    <section className="onboarding-panel" aria-live="polite">
      <StepProgress currentStep={step} />

      {step === "phone" ? (
        <PhoneStep
          phone={phone}
          setPhone={(value) => {
            setPhone(value);
            setPhoneError("");
          }}
          onSubmit={submitPhone}
          isBusy={isBusy}
          error={phoneError}
        />
      ) : null}
      {step === "code" ? (
        <CodeStep phone={phone} onBack={() => setStep("phone")} onVerified={() => setStep("wallet")} />
      ) : null}
      {step === "wallet" ? (
        <WalletStep
          phone={phone}
          onBack={() => setStep("code")}
          onReady={(address) => {
            setWalletAddress(address);
            setStep("ready");
            try {
              window.localStorage.setItem(
                SESSION_KEY,
                JSON.stringify({ phone, walletAddress: address }),
              );
            } catch {
              // Non-fatal: session just won't survive a refresh.
            }
          }}
        />
      ) : null}
      {step === "ready" ? (
        <ReadyStep phone={phone} walletAddress={walletAddress} onRestart={restart} />
      ) : null}
    </section>
  );
}
