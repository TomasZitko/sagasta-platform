"use client";

import { useId, useRef, useState } from "react";
import {
  CONSTRUCTION_TYPES,
  MACHINERY,
  MATERIALS,
  WORK_ACTIVITIES,
  type ProjectIntake,
} from "@/lib/project/intake";

export interface PdfFile {
  name: string;
  size: number;
  base64: string;
}

interface Props {
  value: ProjectIntake;
  onChange: (next: ProjectIntake) => void;
  pdfs: PdfFile[];
  onPdfs: (next: PdfFile[]) => void;
}

type Setter = <K extends keyof ProjectIntake>(key: K, v: ProjectIntake[K]) => void;

export function IntakeForm({ value, onChange, pdfs, onPdfs }: Props) {
  const set: Setter = (key, v) => onChange({ ...value, [key]: v });

  return (
    <div className="card card--pad">
      <Section n="01" title="Identifikace stavby">
        <div className="fields fields--3">
          <Text label="Název stavby" value={value.projectName} onChange={(v) => set("projectName", v)} required />
          <Text label="Místo stavby" value={value.location} onChange={(v) => set("location", v)} />
          <Text label="Zadavatel / investor" value={value.investor} onChange={(v) => set("investor", v)} />
        </div>
      </Section>

      <Section n="02" title="Druh stavby a technologie" hint="Vyberte vše, co odpovídá. Výběr řídí pravidla knihovny.">
        <ChipGroup label="Druh stavby" options={CONSTRUCTION_TYPES} value={value.constructionTypes} onChange={(v) => set("constructionTypes", v)} />
        <ChipGroup label="Stavební činnosti" options={WORK_ACTIVITIES} value={value.activities} onChange={(v) => set("activities", v)} />
        <ChipGroup label="Mechanizace" options={MACHINERY} value={value.machinery} onChange={(v) => set("machinery", v)} />
        <ChipGroup label="Materiály a látky" options={MATERIALS} value={value.materials} onChange={(v) => set("materials", v)} />
      </Section>

      <Section n="03" title="Parametry a prostředí">
        <div className="fields fields--3">
          <NumberField label="Max. výška práce" unit="m" value={value.maxWorkHeightM} onChange={(v) => set("maxWorkHeightM", v)} hint="Nad terénem nebo volnou hloubkou" />
          <NumberField label="Max. hloubka výkopu" unit="m" value={value.maxExcavationDepthM} onChange={(v) => set("maxExcavationDepthM", v)} />
          <NumberField label="Doba výstavby" unit="dní" value={value.durationWorkingDays} integer onChange={(v) => set("durationWorkingDays", v)} hint="Pracovní dny" />
          <NumberField label="Osob současně (špička)" unit="os." value={value.peakWorkers} integer onChange={(v) => set("peakWorkers", v)} />
          <NumberField label="Počet zhotovitelů" unit="" value={value.contractorsCount} integer onChange={(v) => set("contractorsCount", v)} hint="Včetně podzhotovitelů" />
        </div>

        <div className="fields fields--2">
          <Segmented
            label="Blízkost železnice"
            value={value.railwayProximity}
            options={[
              ["none", "Žádná"],
              ["adjacent", "U koleje"],
              ["on_track", "V kolejišti"],
            ]}
            onChange={(v) => set("railwayProximity", v)}
          />
          <Segmented
            label="Silniční provoz"
            value={value.roadTraffic}
            options={[
              ["none", "Žádný"],
              ["adjacent", "Souběh"],
              ["partial_closure", "Částečná uzavírka"],
              ["full_closure", "Úplná uzavírka"],
            ]}
            onChange={(v) => set("roadTraffic", v)}
          />
        </div>

        <div className="toggles" role="group" aria-label="Podmínky stavby">
          <Toggle label="Elektrizovaná trať" checked={value.railwayElectrified} onChange={(v) => set("railwayElectrified", v)} />
          <Toggle label="Bourací práce" checked={value.demolition} onChange={(v) => set("demolition", v)} />
          <Toggle label="Podzemní voda ve výkopu" checked={value.groundwater} onChange={(v) => set("groundwater", v)} />
          <Toggle label="Podzemní sítě v území" checked={value.undergroundUtilities} onChange={(v) => set("undergroundUtilities", v)} />
          <Toggle label="Venkovní vedení VN/VVN" checked={value.overheadPowerLines} onChange={(v) => set("overheadPowerLines", v)} />
          <Toggle label="Práce u vody / nad vodou" checked={value.waterProximity} onChange={(v) => set("waterProximity", v)} />
          <Toggle label="Stísněné prostory" checked={value.confinedSpaces} onChange={(v) => set("confinedSpaces", v)} />
          <Toggle label="Noční práce" checked={value.nightWork} onChange={(v) => set("nightWork", v)} />
          <Toggle label="Sousední objekty v dosahu" checked={value.neighbouringBuildings} onChange={(v) => set("neighbouringBuildings", v)} />
          <Toggle label="Stavba za provozu / veřejnost" checked={value.publicPresence} onChange={(v) => set("publicPresence", v)} />
        </div>
      </Section>

      <Section n="04" title="Popis a dokumentace" hint="Text se kontroluje proti vyplněným údajům – nesoulady nástroj označí.">
        <TextArea label="Popis stavby a technologie" value={value.description} onChange={(v) => set("description", v)} rows={4} />
        <TextArea
          label="Text z projektové dokumentace (volitelné)"
          value={value.documentText}
          onChange={(v) => set("documentText", v)}
          rows={5}
          hint="Vložte TZ, ZOV nebo jejich části. Soubory .txt můžete přetáhnout níže."
        />
        <FileDrop pdfs={pdfs} onPdfs={onPdfs} onText={(t) => set("documentText", [value.documentText, t].filter(Boolean).join("\n\n"))} />
      </Section>
    </div>
  );
}

/* ——— Sub-components ——— */

function Section({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <div>
        <div className="form-section__head">
          <span className="form-section__num">{n}</span>
          <h2 className="h3">{title}</h2>
        </div>
        {hint && <p className="field__hint" style={{ margin: "2px 0 0 32px" }}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Text({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      <input id={id} className="input" value={value} required={required} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextArea({ label, value, onChange, rows, hint }: { label: string; value: string; onChange: (v: string) => void; rows: number; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className="textarea" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  integer,
  hint,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (v: number | null) => void;
  integer?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="input-unit">
        <input
          id={id}
          className="input"
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          min={0}
          step={integer ? 1 : 0.1}
          placeholder="neuvedeno"
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(null);
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 0) onChange(integer ? Math.round(n) : n);
          }}
        />
        {unit && <span>{unit}</span>}
      </div>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field__label">{label}</span>
      <div className="chips">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className="chip"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field__label">{label}</span>
      <div className="segmented">
        {options.map(([id, text]) => (
          <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden />
      <span className="toggle__label">{label}</span>
    </label>
  );
}

const MAX_PDF = 15 * 1024 * 1024;

function FileDrop({ pdfs, onPdfs, onText }: { pdfs: PdfFile[]; onPdfs: (p: PdfFile[]) => void; onText: (t: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next = [...pdfs];
    for (const f of Array.from(files)) {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        if (f.size > MAX_PDF) {
          setError(`${f.name}: soubor je větší než 15 MB.`);
          continue;
        }
        next.push({ name: f.name, size: f.size, base64: await toBase64(f) });
      } else if (f.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(f.name)) {
        onText(`--- ${f.name} ---\n${await f.text()}`);
      } else {
        setError(`${f.name}: podporovány jsou PDF a textové soubory.`);
      }
    }
    onPdfs(next);
  }

  return (
    <div>
      <div
        className="dropzone"
        data-over={over}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files);
        }}
      >
        <strong>Přetáhněte PDF nebo .txt</strong>
        <div className="field__hint">PDF čte AI (max. 15 MB / soubor), text se vloží do pole výše.</div>
        <input ref={input} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" multiple hidden onChange={(e) => void handle(e.target.files)} />
      </div>
      {error && <p className="small" style={{ color: "var(--bad)" }} role="alert">{error}</p>}
      {pdfs.length > 0 && (
        <div className="files">
          {pdfs.map((p, i) => (
            <span key={p.name + i} className="pill">
              📄 {p.name} <span className="muted">{(p.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                type="button"
                className="btn btn--sm"
                style={{ padding: "0 4px" }}
                aria-label={`Odebrat ${p.name}`}
                onClick={() => onPdfs(pdfs.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
