import { Phone } from "lucide-react";

const leftBars = [12, 18, 34, 62, 27, 45, 73, 35, 19, 55, 82, 38, 28, 58, 33, 18, 44, 25];
const rightBars = [16, 22, 35, 55, 26, 18, 46, 29, 21, 36, 18, 27, 15, 22, 12, 17, 9, 12];

function SignalBars({ bars, side }: { bars: number[]; side: "left" | "right" }) {
  return (
    <div className={`signal-bars signal-bars-${side}`} aria-hidden="true">
      {bars.map((height, index) => (
        <span key={`${side}-${index}`} style={{ height }} />
      ))}
    </div>
  );
}

export function VoiceSignal() {
  return (
    <div className="voice-signal" aria-hidden="true">
      <SignalBars bars={leftBars} side="left" />
      <div className="call-orbit">
        <span className="orbit orbit-one" />
        <span className="orbit orbit-two" />
        <span className="orbit orbit-three" />
        <span className="call-button">
          <Phone size={42} fill="currentColor" strokeWidth={1.8} />
        </span>
      </div>
      <SignalBars bars={rightBars} side="right" />
    </div>
  );
}
