import { BadgeCheck, Gamepad2, ShieldCheck } from "lucide-react";

const trustItems = [
  { icon: Gamepad2, label: "Free-play credits only" },
  { icon: ShieldCheck, label: "Your wallet stays in your control" },
  { icon: BadgeCheck, label: "Every pick needs confirmation" },
] as const;

export function TrustRail() {
  return (
    <ul className="trust-rail" aria-label="Bento Hotline protections">
      {trustItems.map(({ icon: Icon, label }) => (
        <li key={label}>
          <span className="trust-icon" aria-hidden="true">
            <Icon size={21} strokeWidth={1.8} />
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
