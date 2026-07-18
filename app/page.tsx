import { BentoLogo } from "@/components/bento-logo";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { TrustRail } from "@/components/trust-rail";
import { VoiceSignal } from "@/components/voice-signal";

export default function Home() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Bento Hotline home">
          <BentoLogo />
          <span>Bento Hotline</span>
        </a>

        <nav className="header-links" aria-label="Main navigation">
          <a href="/duels">Duels</a>
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
        </nav>
      </header>

      <section className="onboarding-layout" id="top">
        <div className="story-column">
          <div className="story-copy">
            <h1>
              Your voice is
              <span>your game plan.</span>
            </h1>
            <p>
              Connect once. Then call to explore live markets, place picks with
              free-play credits, and track every result.
            </p>
          </div>

          <VoiceSignal />
          <TrustRail />
        </div>

        <OnboardingFlow />
      </section>

      <footer className="site-footer" id="how-it-works">
        <div>
          <a href="/duels">Duels</a>
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
        </div>
        <span className="sr-only" id="privacy">
          Privacy details will be added before launch.
        </span>
      </footer>
    </main>
  );
}
