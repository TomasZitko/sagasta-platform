import Link from "next/link";
import { ToolGrid } from "@/components/tools/ToolGrid";
import { TOOLS } from "@/lib/tools/registry";

const OUTPUTS = ["Technická zpráva", "ZOV", "Katalog nebezpečí", "Technologický postup", "Kontroly", "Zápisy a úkoly", "Korespondence"];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <span className="eyebrow">Interní platforma · {TOOLS.length} nástrojů</span>
            <h1 className="h1">
              Jeden vstup projektu.
              <br />
              Mnoho dokumentů.
            </h1>
            <p className="lead">
              AI nástroje pro projekci a inženýring: z jednotných dat stavby připraví první návrh dokumentu, najdou chybějící
              informace a rozpory a převedou komunikaci na úkoly. Odpovědnost a podpis zůstávají u autorizované osoby.
            </p>
            <div className="row" style={{ marginTop: 28 }}>
              <Link className="btn btn--primary" href="/nastroje/extrakce-dat">
                Začít daty projektu <span aria-hidden>→</span>
              </Link>
              <Link className="btn btn--ghost" href="#nastroje">
                Všechny nástroje
              </Link>
            </div>
          </div>
          <div className="pipeline">
            <div className="pipeline__src">
              <span className="eyebrow" style={{ color: "#8fa1b3" }}>
                Project intake
              </span>
              <code>{`Druh:        železniční most
Technologie: bourání, pilotáž, betonáž
Výška/hloubka: 8,5 m / 4,2 m
Provoz:      výluka 1 koleje, trakce
Doba:        140 prac. dní · 28 osob`}</code>
            </div>
            <div className="pipeline__outs">
              {OUTPUTS.map((o, i) => (
                <span key={o} className={i === 0 ? "pill pill--accent" : "pill"} style={{ animationDelay: `${i * 60}ms` }}>
                  {o}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="nastroje" style={{ scrollMarginTop: 70 }}>
        <div className="container">
          <ToolGrid tools={TOOLS} />
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          Návrhy generované AI jsou pracovní podklady. Regulovaný technický a bezpečnostní obsah ověřuje a podepisuje
          odborně způsobilá osoba. Data projektu se ukládají jen ve vašem prohlížeči.
        </div>
      </footer>
    </main>
  );
}
