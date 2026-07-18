"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  LoaderCircle,
  LockKeyhole,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useRef, useState } from "react";

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

const wait = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));

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
}: {
  phone: string;
  setPhone: (phone: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isBusy: boolean;
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

      <button className="primary-button" type="submit" disabled={phone.length !== 10 || isBusy}>
        <span>{isBusy ? "Sending code" : "Send verification code"}</span>
        {isBusy ? (
          <LoaderCircle className="spin" size={21} aria-hidden="true" />
        ) : (
          <ArrowRight size={21} aria-hidden="true" />
        )}
      </button>

      <p className="consent-copy">
        <LockKeyhole size={18} aria-hidden="true" />
        By continuing, you agree to receive a one-time verification message.
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
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
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
    await wait(650);
    onVerified();
  }

  return (
    <form onSubmit={submitCode} className="step-content">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Change number
      </button>
      <div className="step-heading">
        <h2>Enter your code</h2>
        <p>We sent a six-digit code to +91 {phone.slice(0, 5)} {phone.slice(5)}.</p>
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

      <button className="primary-button" type="submit" disabled={digits.some((digit) => !digit) || isBusy}>
        <span>{isBusy ? "Verifying" : "Verify phone"}</span>
        {isBusy ? <LoaderCircle className="spin" size={21} /> : <ArrowRight size={21} />}
      </button>

      <p className="inline-note">
        Didn&apos;t receive it? <button type="button">Send again</button>
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
      const message = `Bento.fun Login\n Timestamp: ${timestamp}\n Wallet: ${address}`;
      await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      await wait(400);
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
  const hotlineNumber = process.env.NEXT_PUBLIC_HOTLINE_NUMBER;
  const shortAddress = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;

  async function copyNumber() {
    if (!hotlineNumber) return;
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

      <button className="hotline-number" type="button" onClick={copyNumber} disabled={!hotlineNumber}>
        <span>
          <small>Bento Hotline</small>
          <strong>{hotlineNumber ?? "Add your Twilio number"}</strong>
        </span>
        {hotlineNumber ? (copied ? <Check size={22} /> : <Copy size={21} />) : null}
      </button>

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

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phone.length !== 10) return;
    setIsBusy(true);
    await wait(650);
    setIsBusy(false);
    setStep("code");
  }

  function restart() {
    setPhone("");
    setWalletAddress("");
    setStep("phone");
  }

  return (
    <section className="onboarding-panel" aria-live="polite">
      <StepProgress currentStep={step} />

      {step === "phone" ? (
        <PhoneStep phone={phone} setPhone={setPhone} onSubmit={submitPhone} isBusy={isBusy} />
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
          }}
        />
      ) : null}
      {step === "ready" ? (
        <ReadyStep phone={phone} walletAddress={walletAddress} onRestart={restart} />
      ) : null}
    </section>
  );
}
