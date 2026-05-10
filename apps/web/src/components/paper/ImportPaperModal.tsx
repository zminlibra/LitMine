"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Link2, Loader2, FileText, Check, Brain, Plus, BookOpen } from "lucide-react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface Props {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

type Tab = "pdf" | "doi" | "bibtex";
type UploadStage = "idle" | "uploading" | "parsing";

export default function ImportPaperModal({ projectId, onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>("pdf");

  // PDF upload state
  const [files, setFiles] = useState<File[]>([]);
  const [fileIdx, setFileIdx] = useState(-1);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [batchResults, setBatchResults] = useState<{ title: string; ok: boolean }[]>([]);
  const [completedFiles, setCompletedFiles] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // DOI import state
  const [doiInput, setDoiInput] = useState("");
  const [importing, setImporting] = useState(false);

  // BibTeX/RIS state
  const [bibFile, setBibFile] = useState<File | null>(null);
  const bibInputRef = useRef<HTMLInputElement>(null);

  const busy = uploadStage !== "idle";

  // ── PDF Upload ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const pdfs = selected.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length !== selected.length) toast.error("Only PDF files are accepted.");
    if (pdfs.length > 0) setFiles((prev) => [...prev, ...pdfs]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    const pdfs = dropped.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length !== dropped.length) toast.error("Only PDF files are accepted.");
    if (pdfs.length > 0) setFiles((prev) => [...prev, ...pdfs]);
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploadStage("uploading");
    setBatchResults([]);

    const results: { title: string; ok: boolean }[] = [];

    for (let i = 0; i < files.length; i++) {
      setFileIdx(i);
      setUploadProgress(0);
      let phase1Done = false;

      try {
        const res = await api.upload(
          `/api/v1/projects/${projectId}/papers/upload`,
          files[i],
          (pct) => {
            setUploadProgress(pct);
            if (pct >= 100 && !phase1Done) {
              phase1Done = true;
              setUploadStage("parsing");
            }
          }
        );
        if (res.ok) {
          const data = await res.json();
          const placeholder = files[i].name.replace(/\.pdf$/i, "");
          const wasParsed = data.title !== placeholder || data.authors?.length > 0 || data.abstract;
          results.push({ title: wasParsed ? data.title.slice(0, 80) : files[i].name, ok: true });
        } else {
          results.push({ title: files[i].name, ok: false });
        }
      } catch {
        results.push({ title: files[i].name, ok: false });
      }
      setCompletedFiles((prev) => new Set(prev).add(i));
      setUploadStage("uploading");
    }

    setBatchResults(results);
    setUploadStage("idle");

    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    if (ok > 0) {
      toast.success(`${ok} PDF${ok > 1 ? "s" : ""} uploaded${fail > 0 ? `, ${fail} failed` : ""}`);
      onImported();
    } else {
      toast.error("All uploads failed");
    }
  };

  // ── Batch DOI Import ──
  const handleBatchImport = async () => {
    if (!doiInput.trim()) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("inputs", doiInput.trim());

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/projects/${projectId}/papers/import-batch`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await import("@/lib/api-client")).getAccessToken() || ""}`,
          },
          body: formData,
        }
      );

      if (res.ok) {
        const data = await res.json();
        const msg = `Imported ${data.imported}, skipped ${data.skipped}, failed ${data.failed}`;
        if (data.imported > 0) {
          toast.success(msg);
          onImported();
          onClose();
        } else {
          toast.warning(msg);
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || "Batch import failed");
      }
    } catch {
      toast.error("Batch import failed, please retry.");
    } finally {
      setImporting(false);
    }
  };

  // ── BibTeX/RIS Import ──
  const handleBibImport = async () => {
    if (!bibFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", bibFile);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/projects/${projectId}/papers/import-bibtex`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await import("@/lib/api-client")).getAccessToken() || ""}`,
          },
          body: formData,
        }
      );

      if (res.ok) {
        const data = await res.json();
        toast.success(`Imported ${data.imported} papers from ${data.format.toUpperCase()} (${data.skipped} duplicates skipped)`);
        onImported();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Import failed");
      }
    } catch {
      toast.error("Import failed, please retry.");
    } finally {
      setImporting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-800">Import Paper</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200">
          {([
            ["pdf", Upload, "Upload PDF"],
            ["doi", Link2, "DOI / URL"],
            ["bibtex", BookOpen, "BibTeX/RIS"],
          ] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              disabled={busy}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors disabled:opacity-40 ${
                tab === key
                  ? "text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {tab === "pdf" && (
            <div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !busy && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  busy ? "cursor-default opacity-50" :
                  files.length > 0 ? "border-emerald-300 bg-emerald-50 cursor-pointer" :
                  "border-zinc-300 hover:border-zinc-400 bg-zinc-50 cursor-pointer"
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleFileChange} disabled={busy} className="hidden" />
                <div className="flex flex-col items-center gap-3">
                  <FileText className="h-10 w-10 text-zinc-300" />
                  <div>
                    <p className="text-sm text-zinc-600">Drop PDFs here or click to browse</p>
                    <p className="text-xs text-zinc-400 mt-1">PDF files only, max 50 MB each. Select multiple.</p>
                  </div>
                </div>
              </div>

              {files.length > 0 && (
                <div className="mt-3 space-y-1 max-h-36 overflow-y-auto">
                  {files.map((f, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                      fileIdx === i ? "bg-emerald-50 border border-emerald-200" :
                      fileIdx > i ? "bg-zinc-50" : "bg-zinc-50"
                    }`}>
                      <div className="flex items-center gap-2 truncate">
                        {completedFiles.has(i) ? <Check className="h-4 w-4 text-emerald-500 shrink-0" /> :
                         fileIdx === i ? <Loader2 className="h-4 w-4 animate-spin text-emerald-500 shrink-0" /> :
                         <FileText className="h-4 w-4 text-zinc-300 shrink-0" />}
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-zinc-400">{formatSize(f.size)}</span>
                        {fileIdx !== i && fileIdx < i && !busy && (
                          <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {uploadStage === "uploading" && fileIdx >= 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                    <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Uploading file {fileIdx + 1} of {files.length}...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {uploadStage === "parsing" && (
                <div className="mt-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                  <div className="flex items-center gap-2.5">
                    <Brain className="h-4 w-4 text-amber-500 animate-pulse shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800">Parsing with GROBID...</p>
                      <p className="text-[11px] text-amber-600">Extracting title, authors, abstract. Up to 30s.</p>
                    </div>
                  </div>
                </div>
              )}

              {batchResults.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-zinc-50 text-xs">
                  <p className="font-medium text-zinc-600 mb-1">Results:</p>
                  {batchResults.map((r, i) => (
                    <p key={i} className="truncate">
                      {r.ok ? <Check className="h-3 w-3 inline text-emerald-500 mr-1" /> : <X className="h-3 w-3 inline text-red-400 mr-1" />}{r.title}
                    </p>
                  ))}
                </div>
              )}

              <button onClick={handleUpload} disabled={files.length === 0 || busy}
                className="mt-4 w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors flex items-center justify-center gap-2">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" />{uploadStage === "parsing" ? "Parsing PDF..." : `Uploading (${fileIdx + 1}/${files.length})...`}</> :
                 <><Upload className="h-4 w-4" />Upload {files.length > 1 ? `${files.length} PDFs` : "& Parse"}</>}
              </button>
              <p className="text-[11px] text-zinc-400 mt-2 text-center">PDFs parsed via GROBID to extract metadata. Multiple files uploaded sequentially.</p>
            </div>
          )}

          {tab === "doi" && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">DOI or URL — one per line</label>
              <textarea value={doiInput} onChange={(e) => setDoiInput(e.target.value)}
                placeholder={"10.1038/s41577-024-01014-8\n10.1080/07388551.2025.2608895\nhttps://doi.org/10.1002/bit.12345"}
                rows={5}
                className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-y" autoFocus />
              <p className="text-[11px] text-zinc-400 mt-1.5">Supports DOI (10.xxx/...), doi.org links, or publisher URLs. Up to 50 items.</p>
              <button onClick={handleBatchImport} disabled={!doiInput.trim() || importing}
                className="mt-4 w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors flex items-center justify-center gap-2">
                {importing ? <><Loader2 className="h-4 w-4 animate-spin" />Importing...</> : <><Plus className="h-4 w-4" />Import All</>}
              </button>
              <p className="text-[11px] text-zinc-400 mt-2 text-center">Metadata resolved via Crossref, OpenAlex, PubMed.</p>
            </div>
          )}

          {tab === "bibtex" && (
            <div>
              <div
                onClick={() => bibInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  bibFile ? "border-emerald-300 bg-emerald-50" : "border-zinc-300 hover:border-zinc-400 bg-zinc-50"
                }`}
              >
                <input ref={bibInputRef} type="file" accept=".bib,.ris,.txt" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setBibFile(f);
                }} className="hidden" />
                {bibFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium text-zinc-700">{bibFile.name}</p>
                    <p className="text-xs text-zinc-500">{formatSize(bibFile.size)}</p>
                    <button onClick={(e) => { e.stopPropagation(); setBibFile(null); if (bibInputRef.current) bibInputRef.current.value = ""; }}
                      className="text-xs text-red-500 hover:text-red-600 mt-1">Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <BookOpen className="h-10 w-10 text-zinc-300" />
                    <div>
                      <p className="text-sm text-zinc-600">Click to select a .bib or .ris file</p>
                      <p className="text-xs text-zinc-400 mt-1">Exported from Zotero, EndNote, Mendeley, etc.</p>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={handleBibImport} disabled={!bibFile || importing}
                className="mt-4 w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors flex items-center justify-center gap-2">
                {importing ? <><Loader2 className="h-4 w-4 animate-spin" />Importing...</> : <><BookOpen className="h-4 w-4" />Import References</>}
              </button>
              <p className="text-[11px] text-zinc-400 mt-2 text-center">Parses BibTeX (.bib) and RIS (.ris) files. Duplicates skipped by DOI.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
