import type { Metadata } from "next";
import { HazardTool } from "@/components/hazards/HazardTool";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Katalog nebezpečí",
  description: "Stavba → řízený katalog nebezpečí s hodnocením rizik.",
};

export default function Page() {
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return (
    <main>
      <section className="hero hero--compact">
        <div className="container">
          <span className="eyebrow">Nástroj 01 · Stavba → Katalog nebezpečí</span>
          <h1 className="h1" style={{ fontSize: "clamp(30px, 4.2vw, 48px)" }}>
            Katalog nebezpečí
          </h1>
          <p className="lead">
            Vyplňte údaje o stavbě nebo vložte text dokumentace. Nástroj vybere nebezpečí výhradně z řízené knihovny,
            ohodnotí rizika, navrhne opatření a upozorní, co v podkladech chybí.
          </p>
        </div>
      </section>
      <div className="container">
        <HazardTool aiEnabled={aiEnabled} />
      </div>
    </main>
  );
}
