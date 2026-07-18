import type { Metadata } from "next";
import { DuelsBoard } from "@/components/duels-board";
import { listAllDuels, type DuelSummaryView } from "@/lib/bento";

export const metadata: Metadata = {
  title: "Duels — Bento Hotline",
  description: "Browse live Bento duels or create a new prediction market.",
};

export const dynamic = "force-dynamic";

const demoDuels: DuelSummaryView[] = [
  {
    duelId: "demo-india-final",
    question: "Will India win the next T20 international?",
    options: [{ index: 0, label: "Yes" }, { index: 1, label: "No" }],
    collateralMode: "credits",
    category: "Cricket",
    endsIn: 8 * 60 * 60 + 24 * 60,
    status: "open",
    participants: 128,
    volume: 18420,
    description: "Resolves from the official match result.",
  },
  {
    duelId: "demo-rain-bengaluru",
    question: "Will it rain in Bengaluru before 8 PM today?",
    options: [{ index: 0, label: "Rain" }, { index: 1, label: "No rain" }],
    collateralMode: "credits",
    category: "Weather",
    endsIn: 2 * 60 * 60 + 46 * 60,
    status: "open",
    participants: 64,
    volume: 8290,
    description: "Based on measurable rainfall at the city weather station.",
  },
  {
    duelId: "demo-product-launch",
    question: "Will the team ship the new landing page by Friday?",
    options: [{ index: 0, label: "Ships" }, { index: 1, label: "Doesn't ship" }],
    collateralMode: "credits",
    category: "Challenge",
    endsIn: 3 * 24 * 60 * 60,
    status: "pending",
    participants: 18,
    volume: 2100,
    description: "The public production URL must be live before the deadline.",
  },
  {
    duelId: "demo-ipl-opener",
    question: "Will the opening IPL match have more than 350 total runs?",
    options: [{ index: 0, label: "Over 350" }, { index: 1, label: "350 or fewer" }],
    collateralMode: "credits",
    category: "Cricket",
    endsIn: 0,
    status: "settled",
    participants: 204,
    volume: 32100,
    description: "Resolved from the official match scorecard.",
  },
];

export default async function DuelsPage() {
  let duels: DuelSummaryView[] = [];
  let connectionIssue = "";

  try {
    duels = await listAllDuels();
  } catch (error) {
    connectionIssue = error instanceof Error ? error.message : "Bento is unavailable.";
  }

  const isDemo = Boolean(connectionIssue);

  return (
    <DuelsBoard
      initialDuels={isDemo ? demoDuels : duels}
      isDemo={isDemo}
      connectionIssue={connectionIssue}
    />
  );
}
