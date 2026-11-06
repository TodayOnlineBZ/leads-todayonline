"use client";
import { useState } from "react";
import BusyButton from "@/components/BusyButton";
import { DEFAULT_MAINTENANCE, DEFAULT_PAYMENT, DEFAULT_PLANNING, DEFAULT_PLANNING_INTRO, type Maintenance, type PlanStep } from "@/lib/proposalDefaults";

type Pair = { titel: string; tekst: string };
export type EditableDocument = { kop: string; kop_accent?: string; voorwoord: string[]; voordelen: Pair[]; aanpak: Pair[]; deadline?: string | null; planning?: PlanStep[] | null; planning_intro?: string | null; onderhoud?: Maintenance | null; betaling?: [string, string] | null };

export default function DocumentEditor({ proposalId, document: d, onSaved, onCancel }: { proposalId: string; document: EditableDocument; onSaved: () => Promise<void> | void; onCancel: () => void }) {
  const [doc, setDoc] = useState(() => ({
    ...d,
    kop_accent: d.kop_accent ?? "",
    planning: (d.planning?.length ? d.planning : DEFAULT_PLANNING).map((s) => ({ ...s })),
    planning_intro: d.planning_intro ?? d.deadline ?? DEFAULT_PLANNING_INTRO,
    onderhoud: { ...(d.onderhoud ?? DEFAULT_MAINTENANCE) },
    betaling: [...(d.betaling ?? DEFAULT_PAYMENT)] as [string, string],
  }));
  const [error, setError] = useState("");
  const patch = (change: Partial<typeof doc>) => setDoc((old) => ({ ...old, ...change }));
  const pairList = (key: "voordelen" | "aanpak", label: string) => (
    <fieldset className="doc-group">
      <legend>{label}</legend>
      {doc[key].map((row, i) => (
        <div className="q" key={i}>
          <label htmlFor={`${key}T${i}`}>Titel {i + 1}</label><input id={`${key}T${i}`} value={row.titel} onChange={(e) => patch({ [key]: doc[key].map((x, j) => (j === i ? { ...x, titel: e.target.value } : x)) })} />
          <label htmlFor={`${key}X${i}`}>Tekst {i + 1}</label><textarea id={`${key}X${i}`} value={row.tekst} onChange={(e) => patch({ [key]: doc[key].map((x, j) => (j === i ? { ...x, tekst: e.target.value } : x)) })} />
        </div>
      ))}
    </fieldset>
  );
  async function save() {
    setError("");
    const res = await fetch("/api/admin/proposals/document-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: proposalId, document: doc }), signal: AbortSignal.timeout(30_000) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { setError(String(data.error ?? "Opslaan is niet gelukt. Je tekst staat er nog, dus probeer het opnieuw.")); return; }
    await onSaved();
  }
  return (
    <div className="confirm-box doc-editor" id="documentEditor">
      <p className="hint">Dit geldt alleen voor dit voorstel. De klant ziet de tekst na opslaan, als de link online staat. Controleer bedragen goed: ze komen precies zo in de uitwerking en de offerte.</p>
      <fieldset className="doc-group">
        <legend>Onderhoud</legend>
        <label className="check-line"><input id="docMaintenanceOn" type="checkbox" checked={doc.onderhoud.tonen} onChange={(e) => patch({ onderhoud: { ...doc.onderhoud, tonen: e.target.checked } })} /> Toon onderhoud in de uitwerking en de offerte</label>
        {doc.onderhoud.tonen && <>
          <div className="q"><label htmlFor="docMTitle">Titel</label><input id="docMTitle" value={doc.onderhoud.titel} onChange={(e) => patch({ onderhoud: { ...doc.onderhoud, titel: e.target.value } })} /></div>
          <div className="q"><label htmlFor="docMAmount">Bedrag</label><input id="docMAmount" value={doc.onderhoud.bedrag} onChange={(e) => patch({ onderhoud: { ...doc.onderhoud, bedrag: e.target.value } })} /></div>
          <div className="q"><label htmlFor="docMUnit">Achter het bedrag</label><input id="docMUnit" value={doc.onderhoud.eenheid} onChange={(e) => patch({ onderhoud: { ...doc.onderhoud, eenheid: e.target.value } })} /></div>
          <div className="q"><label htmlFor="docMText">Tekst</label><textarea id="docMText" value={doc.onderhoud.tekst} onChange={(e) => patch({ onderhoud: { ...doc.onderhoud, tekst: e.target.value } })} /></div>
        </>}
      </fieldset>
      <fieldset className="doc-group">
        <legend>Planning</legend>
        <div className="q"><label htmlFor="docPlanIntro">Inleiding</label><textarea id="docPlanIntro" value={doc.planning_intro} onChange={(e) => patch({ planning_intro: e.target.value })} /></div>
        {doc.planning.map((step, i) => (
          <div className="q" key={i}>
            <label htmlFor={`docStepW${i}`}>Stap {i + 1}: wanneer</label><input id={`docStepW${i}`} value={step.wanneer} onChange={(e) => patch({ planning: doc.planning.map((x, j) => (j === i ? { ...x, wanneer: e.target.value } : x)) })} />
            <label htmlFor={`docStepT${i}`}>Stap {i + 1}: titel (leeg laten om weg te halen)</label><input id={`docStepT${i}`} value={step.titel} onChange={(e) => patch({ planning: doc.planning.map((x, j) => (j === i ? { ...x, titel: e.target.value } : x)) })} />
            <label htmlFor={`docStepX${i}`}>Stap {i + 1}: tekst</label><textarea id={`docStepX${i}`} value={step.tekst} onChange={(e) => patch({ planning: doc.planning.map((x, j) => (j === i ? { ...x, tekst: e.target.value } : x)) })} />
          </div>
        ))}
      </fieldset>
      <fieldset className="doc-group">
        <legend>Betaling</legend>
        <p className="hint">De verdeling blijft 50% en 50%, op basis van de prijs van dit voorstel.</p>
        <div className="q"><label htmlFor="docPay1">Eerste moment</label><input id="docPay1" value={doc.betaling[0]} onChange={(e) => patch({ betaling: [e.target.value, doc.betaling[1]] })} /></div>
        <div className="q"><label htmlFor="docPay2">Tweede moment</label><input id="docPay2" value={doc.betaling[1]} onChange={(e) => patch({ betaling: [doc.betaling[0], e.target.value] })} /></div>
      </fieldset>
      <fieldset className="doc-group">
        <legend>Voorkant en voorwoord</legend>
        <div className="q"><label htmlFor="docKop">Kop</label><input id="docKop" value={doc.kop} onChange={(e) => patch({ kop: e.target.value })} /></div>
        <div className="q"><label htmlFor="docAccent">Oranje woord uit de kop</label><input id="docAccent" value={doc.kop_accent} onChange={(e) => patch({ kop_accent: e.target.value })} /></div>
        {doc.voorwoord.map((p, i) => <div className="q" key={i}><label htmlFor={`docIntro${i}`}>Alinea {i + 1}</label><textarea id={`docIntro${i}`} value={p} onChange={(e) => patch({ voorwoord: doc.voorwoord.map((x, j) => (j === i ? e.target.value : x)) })} /></div>)}
      </fieldset>
      {pairList("voordelen", "In het kort")}
      {pairList("aanpak", "De aanpak")}
      {error && <p className="status err" role="status" id="docEditError">{error}</p>}
      <div className="actions"><BusyButton className="btn" id="docEditSave" type="button" busyText="Opslaan…" onAction={save}>Teksten opslaan</BusyButton><button className="btn alt" type="button" onClick={onCancel}>Annuleren</button></div>
    </div>
  );
}
