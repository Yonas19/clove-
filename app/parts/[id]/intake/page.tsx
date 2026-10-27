"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Camera,
  FileSpreadsheet,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Languages,
  FileImage,
  Zap,
  Shield,
} from "lucide-react";
import { isArabic } from "@/lib/utils";
import CameraCapture from "@/components/CameraCapture";

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  status: "pending" | "uploading" | "done" | "error";
}

interface AnalysisStep {
  label: string;
  status: "pending" | "active" | "done";
}

export default function IntakeForPartPage() {
  // In Next.js 15, client components use useParams hook to get route params.
  return <IntakeForPartClient />;
}

function IntakeForPartClient() {
  const params = useParams<{ id: string }>();
  const partId = params.id;

  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [note, setNote] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([
    { label: "Reading sources", status: "pending" },
    { label: "Extracting claims", status: "pending" },
    { label: "Verifying", status: "pending" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileObjectsRef = useRef<Map<string, File>>(new Map());

  const noteIsArabic = note.length > 0 && isArabic(note);

  const handleFilesWithObjects = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const valid = fileArray.filter((f) => {
      const isImage = f.type.startsWith("image/");
      const isCsv = f.type.includes("csv") || f.name.endsWith(".csv");
      const isXlsx = f.type.includes("spreadsheet") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls");
      return isImage || isCsv || isXlsx;
    });

    const mapped: UploadedFile[] = valid.map((f) => {
      const id = `${f.name}-${f.size}-${Date.now()}-${Math.random()}`;
      fileObjectsRef.current.set(id, f);
      return {
        id,
        name: f.name,
        type: f.type || (f.name.endsWith(".csv") ? "text/csv" : f.name.endsWith(".xlsx") ? "xlsx" : "image"),
        size: f.size,
        status: "pending",
        preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      };
    });

    setFiles((prev) => [...prev, ...mapped]);
  }, []);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFilesWithObjects(e.target.files);
      e.target.value = "";
    }
  };

  const removeFile = (id: string) => {
    fileObjectsRef.current.delete(id);
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFilesWithObjects(e.dataTransfer.files);
    },
    [handleFilesWithObjects],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleFilesWithObjects([file]);
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFilesWithObjects]);

  const canSubmit = files.length > 0 || note.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsUploading(true);

    try {
      // Upload sources
      const formData = new FormData();
      for (const [, file] of fileObjectsRef.current) {
        formData.append("files", file);
      }
      if (note.trim()) {
        formData.append("note", note.trim());
      }

      setFiles((prev) => prev.map((f) => ({ ...f, status: "uploading" as const })));

      const uploadRes = await fetch(`/api/parts/${partId}/sources`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Failed to upload sources");
      }

      setFiles((prev) => prev.map((f) => ({ ...f, status: "done" as const })));
      setIsUploading(false);
      setIsAnalyzing(true);

      // Analyze
      setAnalysisSteps([
        { label: "Reading sources", status: "active" },
        { label: "Extracting claims", status: "pending" },
        { label: "Verifying", status: "pending" },
      ]);

      await new Promise((r) => setTimeout(r, 600));
      setAnalysisSteps([
        { label: "Reading sources", status: "done" },
        { label: "Extracting claims", status: "active" },
        { label: "Verifying", status: "pending" },
      ]);

      const analyzeRes = await fetch(`/api/parts/${partId}/analyze`, {
        method: "POST",
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "Failed to analyze sources");
      }

      await new Promise((r) => setTimeout(r, 400));
      setAnalysisSteps([
        { label: "Reading sources", status: "done" },
        { label: "Extracting claims", status: "done" },
        { label: "Verifying", status: "done" },
      ]);

      await new Promise((r) => setTimeout(r, 800));
      // Continue directly into the analyzed part's questions and product record.
      router.push(`/parts/${encodeURIComponent(partId)}?tab=questions`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isAnalyzing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl"
        >
          <div className="relative mx-auto mb-6 h-24 w-24">
            <div className="absolute inset-0 rounded-full bg-indigo-100" />
            <div className="absolute inset-2 rounded-full bg-indigo-200 animate-pulse-ring" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-10 w-10 text-indigo-600" />
            </div>
          </div>
          <h2 className="text-center text-xl font-bold text-slate-900">Analyzing evidence</h2>
          <p className="mt-1 text-center text-sm text-slate-500">
            Part <code className="font-mono text-indigo-600">{partId}</code>
          </p>
          <div className="mt-6 space-y-3">
            {analysisSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center">
                  {step.status === "done" ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : step.status === "active" ? (
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border-2 border-slate-200" />
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  step.status === "done" ? "text-slate-400 line-through"
                    : step.status === "active" ? "text-slate-900"
                      : "text-slate-400"
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className="h-full bg-emerald-600"
              animate={{
                width: `${(analysisSteps.filter((s) => s.status === "done").length / analysisSteps.length) * 100}%`,
              }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link href={`/parts/${partId}`} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to part</span>
          </Link>
          <span className="font-bold text-slate-900">Add Evidence — {partId}</span>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">Dashboard</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Add more evidence</h1>
          <p className="mt-2 text-slate-600">Upload additional photos, CSV, or notes for this part.</p>
        </motion.div>

        {/* Drop zone */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onClick={() => fileInputRef.current?.click()}
            className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
              isDragging ? "border-indigo-500 bg-indigo-50 scale-[1.01]" : "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/50"
            }`}
          >
            <input ref={fileInputRef} type="file" multiple accept="image/*,.csv,.xlsx,.xls" onChange={onFileInputChange} className="hidden" />
            <motion.div animate={isDragging ? { scale: 1.1 } : { scale: 1 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg">
              <Upload className="h-8 w-8" />
            </motion.div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">{isDragging ? "Drop your files here" : "Drag & drop files here"}</h3>
            <p className="mt-1 text-sm text-slate-500">or <span className="font-medium text-indigo-600">click to browse</span> · paste images with Ctrl+V</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm"><Camera className="h-3 w-3" /> Photos</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm"><FileSpreadsheet className="h-3 w-3" /> CSV</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm"><FileSpreadsheet className="h-3 w-3" /> XLSX</span>
            </div>
          </div>
        </motion.div>

        <CameraCapture onCapture={(file) => handleFilesWithObjects([file])} />

        {/* Files list */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4">
              <div className="space-y-2">
                {files.map((file) => {
                  const Icon = file.type.startsWith("image/") ? FileImage : FileSpreadsheet;
                  return (
                    <motion.div key={file.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      {file.preview ? (
                        <img src={file.preview} alt={file.name} className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100"><Icon className="h-6 w-6 text-slate-500" /></div>
                      )}
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{file.name}</p><p className="text-xs text-slate-400">{formatFileSize(file.size)}</p></div>
                      <div className="flex items-center">
                        {file.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
                        {file.status === "done" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {file.status === "pending" && <button onClick={(e) => { e.stopPropagation(); removeFile(file.id); }} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notes */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-6">
          <label className="mb-1.5 flex items-center justify-between text-sm font-semibold text-slate-700">
            <span className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />Notes</span>
            {noteIsArabic && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"><Languages className="h-3 w-3" />Arabic · RTL</span>}
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} dir={noteIsArabic ? "rtl" : "ltr"} placeholder="Paste notes in Arabic or English..." rows={4} className="custom-scroll w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" style={{ minHeight: "100px" }} />
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
              <p className="flex-1 text-sm font-medium text-red-800">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8 flex flex-col items-center gap-3">
          <button onClick={handleSubmit} disabled={!canSubmit || isUploading} className={`group inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold shadow-lg transition-all sm:w-auto ${
            canSubmit && !isUploading ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-indigo-500/25 hover:scale-[1.02] hover:shadow-indigo-500/40 active:scale-95" : "cursor-not-allowed bg-slate-200 text-slate-400"
          }`}>
            {isUploading ? (<><Loader2 className="h-5 w-5 animate-spin" />Uploading...</>) : (<><Zap className="h-5 w-5" />Analyze evidence<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>)}
          </button>
          {!canSubmit && !isUploading && <p className="text-sm text-slate-400">Upload a file or add a note to begin</p>}
        </motion.div>
      </main>
    </div>
  );
}
