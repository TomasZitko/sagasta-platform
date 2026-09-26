import type { Metadata } from "next";
import { Copilot } from "@/components/copilot/Copilot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projektový Copilot", description: "Otázky nad aktivním projektem a knihovnou dokumentů." };

export default function Page() {
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return (
    <main>
      <div className="container">
        <Copilot aiEnabled={aiEnabled} />
      </div>
    </main>
  );
}
