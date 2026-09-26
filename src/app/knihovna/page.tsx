import type { Metadata } from "next";
import { LibraryManager } from "@/components/copilot/LibraryManager";

export const metadata: Metadata = { title: "Knihovna dokumentů", description: "Lokální knihovna dokumentů pro Copilot a nástroje." };

export default function Page() {
  return (
    <main>
      <section className="hero hero--compact">
        <div className="container">
          <span className="eyebrow">Lokální knihovna · zůstává ve vašem prohlížeči</span>
          <h1 className="h1 h1--tool">Knihovna dokumentů</h1>
          <p className="lead">Nahrajte technické zprávy, ZOV, zápisy a další dokumenty předchozích i aktuálních projektů. Copilot v nich hledá odpovědi a v každém nástroji je vložíte tlačítkem „Z knihovny“.</p>
        </div>
      </section>
      <div className="container">
        <LibraryManager />
      </div>
    </main>
  );
}
