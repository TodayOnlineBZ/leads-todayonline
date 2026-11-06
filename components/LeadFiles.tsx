"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BusyButton, { LoadingNote, Spinner } from "@/components/BusyButton";
import { createClient } from "@/lib/supabase/client";

type LeadFile = { id: string; name: string; path: string; size_bytes: number; mime_type: string; kind: string; uploaded_by_name: string; created_at: string };
const BUCKET = "lead-files";
const MAX_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf", zip: "application/zip" };
const ACCEPT = Object.keys(TYPES).map((e) => "." + e).join(",");
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
const cleanPath = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);

export default function LeadFiles({ leadId }: { leadId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [files, setFiles] = useState<LeadFile[] | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("lead_files").select("id, name, path, size_bytes, mime_type, kind, uploaded_by_name, created_at").eq("lead_id", leadId).order("created_at", { ascending: false });
    if (error) { setFiles([]); setMessage({ text: "De bestanden konden niet worden geladen.", error: true }); return; }
    const list = (data ?? []) as LeadFile[];
    setFiles(list);
    if (list.length) {
      const signed = await supabase.storage.from(BUCKET).createSignedUrls(list.map((f) => f.path), 3600);
      setLinks(Object.fromEntries((signed.data ?? []).flatMap((s, i) => (s.signedUrl ? [[list[i].id, s.signedUrl]] : []))));
    }
  }, [supabase, leadId]);
  useEffect(() => { void load(); }, [load]);

  async function upload(list: FileList | File[]) {
    if (progress) return;
    const chosen = Array.from(list);
    const problems: string[] = [];
    let done = 0, unpacked = 0, skipped = 0;
    setMessage({ text: "", error: false });
    for (const [i, file] of chosen.entries()) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const type = TYPES[ext];
      if (!type) { problems.push(`${file.name}: dit bestandstype is niet toegestaan`); continue; }
      if (file.size > MAX_BYTES) { problems.push(`${file.name}: groter dan 50 MB`); continue; }
      setProgress(`Uploaden ${i + 1} van ${chosen.length}: ${file.name}`);
      const path = `${leadId}/${crypto.randomUUID()}-${cleanPath(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false });
      if (up.error) { problems.push(`${file.name}: uploaden is niet gelukt`); continue; }
      const kind = ext === "zip" ? "zip" : type === "application/pdf" ? "overig" : /logo/i.test(file.name) ? "logo" : "foto";
      const row = await supabase.from("lead_files").insert({ lead_id: leadId, name: file.name.slice(0, 200), path, size_bytes: file.size, mime_type: type, kind }).select("id").single();
      if (row.error || !row.data) { await supabase.storage.from(BUCKET).remove([path]); problems.push(`${file.name}: opslaan is niet gelukt`); continue; }
      done += 1;
      if (ext === "zip") {
        setProgress(`Uitpakken: ${file.name}`);
        const res = await fetch("/api/leads/files/unpack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.data.id }) }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (res?.ok) { unpacked += data.added ?? 0; skipped += data.skipped ?? 0; } else problems.push(`${file.name}: ${data.error ?? "uitpakken is niet gelukt"}`);
      }
    }
    setProgress("");
    if (input.current) input.current.value = "";
    const parts = [done ? `${done} bestand${done === 1 ? "" : "en"} geüpload.` : "", unpacked ? `${unpacked} afbeelding${unpacked === 1 ? "" : "en"} uit de zip gehaald.` : "", skipped ? `${skipped} bestand${skipped === 1 ? "" : "en"} uit de zip overgeslagen.` : "", ...problems];
    setMessage({ text: parts.filter(Boolean).join(" "), error: problems.length > 0 });
    await load();
  }
  async function setKind(f: LeadFile, kind: string) {
    const { error } = await supabase.from("lead_files").update({ kind }).eq("id", f.id);
    if (error) setMessage({ text: "Wijzigen is niet gelukt.", error: true });
    await load();
  }
  async function remove(f: LeadFile) {
    if (confirm !== f.id) { setConfirm(f.id); return; }
    setConfirm(null);
    const { error } = await supabase.storage.from(BUCKET).remove([f.path]);
    const row = error ? { error } : await supabase.from("lead_files").delete().eq("id", f.id);
    setMessage(row.error ? { text: "Verwijderen is niet gelukt.", error: true } : { text: `${f.name} is verwijderd.`, error: false });
    await load();
  }
  return (
    <section className="step" aria-labelledby="filesTitle" id="leadFiles">
      <div className="step-head"><span className="eyebrow">Bestanden</span><h2 id="filesTitle">Aangeleverd materiaal</h2><p>Upload afbeeldingen, logo&apos;s of een zip-bestand. Claude gebruikt ze in de MVP, en ze blijven bewaard voor de echte website. Dit is niet verplicht.</p></div>
      <div className={"dropzone" + (drag ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}>
        <label className="btn alt" htmlFor="fileUpload">Kies bestanden</label>
        <input id="fileUpload" className="sr-only" ref={input} type="file" multiple accept={ACCEPT} disabled={!!progress} onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); }} />
        <span className="small">Of sleep ze hierheen. JPG, PNG, WebP, GIF, SVG, PDF of ZIP, maximaal 50 MB per bestand.</span>
      </div>
      {progress && <p className="small proposal-running" role="status"><Spinner />{progress}</p>}
      {message.text && <p className={"status" + (message.error ? " err" : "")} id="filesStatus" role="status">{message.text}</p>}
      {files === null ? <LoadingNote text="Bestanden laden" /> : files.length === 0 ? <p className="hint">Nog geen bestanden.</p> : (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.id}>
              {f.mime_type.startsWith("image/") && links[f.id]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={links[f.id]} alt="" loading="lazy" />
                : <span className="file-icon" aria-hidden="true">{f.kind === "zip" ? "ZIP" : "PDF"}</span>}
              <span className="file-info"><b>{f.name}</b><span className="small">{size(f.size_bytes)} · {f.uploaded_by_name}</span></span>
              <span className="file-actions">
                {f.mime_type.startsWith("image/") && <select aria-label={"Soort voor " + f.name} value={f.kind} onChange={(e) => void setKind(f, e.target.value)}><option value="foto">Foto</option><option value="logo">Logo</option></select>}
                {links[f.id] && <a className="btn alt small" href={links[f.id]} target="_blank" rel="noopener">Openen</a>}
                <BusyButton className="btn alt small" type="button" busyText="Verwijderen…" onAction={() => remove(f)}>{confirm === f.id ? "Klik nogmaals" : "Verwijderen"}</BusyButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
