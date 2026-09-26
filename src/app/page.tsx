import Link from "next/link";

const TOOLS = [
  {
    n: "01",
    href: "/katalog-nebezpeci",
    title: "Katalog nebezpečí",
    text: "Stavba → řízený katalog nebezpečí s hodnocením rizik, opatřeními a předpisy. Upozorní na chybějící kategorie.",
    ready: true,
  },
  { n: "02", title: "Extrakce dat projektu", text: "PDF dokumentace → strukturovaná data projektu, sdílená všemi nástroji." },
  { n: "03", title: "Technická zpráva", text: "Data projektu → návrh TZ dle vyhl. 131/2024 Sb. se značením nalezeno / odvozeno / chybí." },
  { n: "04", title: "Zásady organizace výstavby", text: "Data projektu → návrh části B.10 včetně dopravy, zařízení staveniště a etapizace." },
  { n: "05", title: "Kontrola konzistence", text: "Všechny dokumenty projektu → rozpory v číslech, termínech a objektech." },
];

const OUTPUTS = ["Katalog nebezpečí", "Technická zpráva", "ZOV (B.10)", "Plán BOZP", "Technologický postup", "Kontrola dokladů"];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">Interní platforma · pracovní verze</span>
          <h1 className="h1">
            Jeden vstup projektu.
            <br />
            Mnoho dokumentů.
          </h1>
          <p className="lead">
            Malé AI nástroje, které z jednotných dat stavby připraví první návrh dokumentu, najdou chybějící informace
            a zkontrolují soulad. Odpovědnost a podpis zůstávají u autorizované osoby.
          </p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link className="btn btn--primary" href="/katalog-nebezpeci">
              Otevřít Katalog nebezpečí <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container stack">
          <div className="pipeline">
            <div className="pipeline__src">
              <span className="eyebrow" style={{ color: "#8fa1b3" }}>Project intake</span>
              <code>{`Druh:        železniční most
Technologie: bourání, pilotáž, betonáž
Výška/hloubka: 8,5 m / 4,2 m
Provoz:      výluka 1 koleje, trakce
Doba:        140 prac. dní · 28 osob`}</code>
            </div>
            <div className="pipeline__arrow" aria-hidden>
              →
            </div>
            <div className="pipeline__outs">
              {OUTPUTS.map((o, i) => (
                <span key={o} className={i === 0 ? "pill pill--accent" : "pill"}>
                  {o}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container stack">
          <h2 className="h2">Nástroje</h2>
          <div className="grid grid--tools">
            {TOOLS.map((t) =>
              t.ready ? (
                <Link key={t.n} href={t.href!} className="card tool-card">
                  <span className="tool-card__num">{t.n}</span>
                  <h3 className="h3">{t.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>
                    {t.text}
                  </p>
                  <span className="tool-card__cta">
                    Spustit <span aria-hidden>→</span>
                  </span>
                </Link>
              ) : (
                <div key={t.n} className="card tool-card" aria-disabled="true">
                  <span className="tool-card__num">{t.n}</span>
                  <h3 className="h3">{t.title}</h3>
                  <p className="muted small" style={{ margin: 0 }}>
                    {t.text}
                  </p>
                  <span className="tool-card__cta muted">Připravujeme</span>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          Návrhy generované AI jsou pracovní podklady. Regulovaný technický a bezpečnostní obsah ověřuje a podepisuje
          odborně způsobilá osoba.
        </div>
      </footer>
    </main>
  );
}
