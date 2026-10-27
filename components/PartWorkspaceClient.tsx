"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  MessageSquare,
  FileText,
  History,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronRight,
  Languages,
  Clock,
  Sparkles,
  Shield,
  Camera,
  FileSpreadsheet,
  ExternalLink,
  ClipboardCheck,
  Loader2,
  Pencil,
  Save,
  PartyPopper,
  PackageCheck,
} from "lucide-react";
import {
  EVIDENCE_STATUS_META,
  type EvidenceStatus,
  type ReadinessReport,
  type ListingDraftDetail,
  type ChatMessage,
  type ChatQuestion,
  type DetectedIssue,
} from "@/lib/types";
import { formatTime } from "@/lib/utils";
import ReadinessPanel from "@/components/ReadinessPanel";
import AssistantChat from "@/components/AssistantChat";

interface Claim {
  id: string;
  attribute: string;
  value: string | null;
  sourceId: string;
  originalText: string | null;
  language: string | null;
  translation: string | null;
  extractionStatus: string;
  evidenceStatus: EvidenceStatus;
  uncertainty: string | null;
  createdAt: string;
}

interface Source {
  id: string;
  type: string;
  filePath: string | null;
  originalText: string | null;
  language: string | null;
  detectedFormat: string | null;
  createdAt: string;
}

interface Assessment {
  id: string;
  attribute: string;
  assessmentType: string;
  severity: string;
  detail: string;
  relatedClaimIds: string | null;
  referenceId: string | null;
  referenceDatasetVersion: string | null;
  createdAt: string;
}

interface EventItem {
  id: string;
  eventType: string;
  payload: string | null;
  createdAt: string;
}

interface PartData {
  part: {
    id: string;
    displayName: string | null;
    partType: string;
    createdAt: string;
    updatedAt: string;
  };
  claims: Claim[];
  sources: Source[];
  assessments: Assessment[];
  decisions: { attribute: string; answer: string; answerType: string; note: string | null }[];
  events: EventItem[];
}

interface Props {
  partId: string;
  initialData: PartData;
  /** Server-computed readiness checklist (Box 7). */
  readiness: ReadinessReport;
  /** Server-computed targeted questions (Box 4 -> Box 5). */
  questions: ChatQuestion[];
  /** Server-computed listing draft with optimisation notes (Box 6). */
  listingDraft: ListingDraftDetail;
  /** Initial assistant chat messages (Box 5). */
  chatMessages: ChatMessage[];
  /** Issues the assistant has detected (Box 5). */
  detectedIssues: DetectedIssue[];
  /** True when the stored draft has been approved. */
  isApproved: boolean;
}

type Tab = "evidence" | "questions" | "readiness" | "listing" | "assistant" | "history";

const chipClass: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  red: "bg-red-100 text-red-700 border-red-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  green: "bg-green-100 text-green-700 border-green-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
  purple: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const severityConfig: Record<string, { icon: typeof AlertCircle; color: string; bg: string }> = {
  error: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
};

const eventTypeMeta: Record<string, { icon: typeof Eye; label: string; color: string }> = {
  source_added: { icon: Camera, label: "Source added", color: "text-blue-600" },
  claim_extracted: { icon: Sparkles, label: "Claim extracted", color: "text-emerald-600" },
  decision: { icon: CheckCircle2, label: "Decision made", color: "text-green-600" },
  recompute: { icon: Eye, label: "Recomputed", color: "text-indigo-600" },
  draft_updated: { icon: FileText, label: "Draft updated", color: "text-slate-600" },
  approval: { icon: Shield, label: "Approval", color: "text-green-600" },
  verification: { icon: Shield, label: "Verification", color: "text-teal-600" },
};

export function PartWorkspaceClient({
  partId,
  initialData,
  readiness,
  questions: initialQuestions,
  listingDraft,
  chatMessages: initialChatMessages,
  detectedIssues: initialDetectedIssues,
  isApproved: initialIsApproved,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("evidence");
  const [selectedAttribute, setSelectedAttribute] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Resolution state
  const [questions, setQuestions] = useState<ChatQuestion[]>(initialQuestions);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(initialIsApproved);
  const [posted, setPosted] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Product record fields shown even before evidence exists. Decisions override
  // extracted values so every edit refreshes the record, draft and checklist.
  const attributeGroups = useMemo(() => {
    const groups: Record<string, { claims: Claim[]; value: string; status: EvidenceStatus; count: number; source: string }> = {};
    const recordFields = ["partType", "brand", "partNumber", "donorVehicle", "donorMake", "donorModel", "donorYear", "condition", "visibleDamage", "electricalTestStatus", "storageLocation", "identifiers", "includedComponents", "accessories", "side", "packagedDimensions", "packagedWeight", "vin", "oemPartNumber"];
    const assessmentByAttribute = new Map(initialData.assessments.map((item) => [item.attribute, item]));

    for (const field of recordFields) {
      const assessment = assessmentByAttribute.get(field);
      groups[field] = {
        claims: [],
        value: "—",
        status: assessment?.assessmentType === "conflict" ? "conflicting" : assessment?.severity === "error" ? "unverified" : "reported",
        count: 0,
        source: "Missing",
      };
    }
    for (const claim of initialData.claims) {
      if (!groups[claim.attribute]) {
        groups[claim.attribute] = { claims: [], value: "—", status: claim.evidenceStatus, count: 0, source: "evidence" };
      }
      groups[claim.attribute].claims.push(claim);
      groups[claim.attribute].value = claim.value || groups[claim.attribute].value;
      groups[claim.attribute].status = claim.evidenceStatus;
      groups[claim.attribute].count++;
      groups[claim.attribute].source = initialData.sources.find((source) => source.id === claim.sourceId)?.type || "evidence";
    }
    for (const decision of initialData.decisions) {
      if (decision.answerType === "skip") continue;
      if (!groups[decision.attribute]) {
        groups[decision.attribute] = { claims: [], value: "—", status: "reported", count: 0, source: "voice or seller" };
      }
      groups[decision.attribute].value = decision.answer || "—";
      groups[decision.attribute].status = "seller_confirmed";
      groups[decision.attribute].source = decision.note?.includes("voice") ? "voice" : "seller input";
    }
    return groups;
  }, [initialData.claims, initialData.decisions, initialData.assessments, initialData.sources]);

  // Source lookup map
  const sourceMap = useMemo(() => {
    const map: Record<string, Source> = {};
    for (const source of initialData.sources) {
      map[source.id] = source;
    }
    return map;
  }, [initialData.sources]);

  // Selected attribute claims
  const selectedClaims = selectedAttribute ? attributeGroups[selectedAttribute]?.claims || [] : [];

  // Readiness status comes from the server-computed checklist
  const readinessChip = {
    ready: { label: "Ready for seller review", color: "green" },
    info_missing: { label: "Information missing", color: "amber" },
    specialist_review: { label: "Specialist review required", color: "red" },
  }[readiness.status];

  const openQuestions = questions.length;

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Record a seller answer for a question, then refresh the server state so
   * the readiness checklist, listing draft and remaining questions all update.
   */
  const resolveQuestion = useCallback(
    async (
      attribute: string,
      answer: string,
      answerType: "candidate" | "free_entry" | "skip",
      questionId?: string,
    ) => {
      setIsResolving(true);
      setResolveError(null);

      try {
        const res = await fetch(`/api/parts/${partId}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attribute, answer, answerType, questionId }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || "Failed to record your answer");
        }

        if (typeof data.remainingQuestions === "number") {
          // Pull the fresh question list so the UI updates without a full reload
          try {
            const stateRes = await fetch(`/api/parts/${partId}/chat`);
            if (stateRes.ok) {
              const stateData = await stateRes.json();
              if (Array.isArray(stateData.pendingQuestions)) {
                setQuestions(stateData.pendingQuestions);
              }
            }
          } catch {
            // Fall back to the server refresh below.
          }
        }

        // Reload server state (readiness, listing draft, events)
        router.refresh();
      } catch (err) {
        setResolveError(
          err instanceof Error ? err.message : "Failed to record your answer",
        );
      } finally {
        setIsResolving(false);
      }
    },
    [partId, router],
  );

  /**
   * Approve the current listing draft. The server enforces the readiness gate.
   */
  const approveDraft = useCallback(async () => {
    setIsApproving(true);
    setApprovalError(null);

    try {
      const res = await fetch(`/api/parts/${partId}/approval`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to approve the draft");
      }

      setIsApproved(true);
      setPosted(true);
      router.refresh();
    } catch (err) {
      setApprovalError(
        err instanceof Error ? err.message : "Failed to approve the draft",
      );
    } finally {
      setIsApproving(false);
    }
  }, [partId, router]);

  const saveRecordEdit = useCallback(async () => {
    if (!editingAttribute || !editValue.trim()) return;
    try {
      window.localStorage.setItem(`clove-record-${partId}-${editingAttribute}`, editValue.trim());
    } catch {
      // Persistence is helpful but must not prevent an auditable server update.
    }
    await resolveQuestion(editingAttribute, editValue.trim(), "free_entry");
    setEditingAttribute(null);
    setEditValue("");
  }, [editingAttribute, editValue, partId, resolveQuestion]);

  const handleRowClick = (attr: string) => {
    setSelectedAttribute(attr);
    setDrawerOpen(true);
  };

  const tabs: { id: Tab; label: string; icon: typeof Eye; badge?: number }[] = [
    { id: "evidence", label: "Evidence", icon: Eye },
    { id: "questions", label: "Questions", icon: MessageSquare, badge: openQuestions },
    { id: "readiness", label: "Readiness", icon: ClipboardCheck },
    { id: "listing", label: "Listing", icon: FileText },
    { id: "assistant", label: "Assistant", icon: Sparkles, badge: openQuestions },
    { id: "history", label: "History", icon: History, badge: initialData.events.length },
  ];

  return (
    <>
      {/* Tab bar + readiness */}
      <div className="sticky top-[57px] z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          {/* Readiness bar */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${chipClass[readinessChip.color]}`}>
                <Shield className="h-3 w-3" />
                {readinessChip.label}
              </span>
              <span className="text-xs text-slate-500">
                {initialData.claims.length} claims · {initialData.sources.length} sources
              </span>
            </div>
            {openQuestions > 0 && (
              <button
                onClick={() => setActiveTab("questions")}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                <AlertCircle className="h-3 w-3" />
                {openQuestions} question{openQuestions !== 1 ? "s" : ""} to resolve
              </button>
            )}
          </div>

          {/* Tabs */}
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-indigo-600"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {(() => { const TabIcon = tab.icon; return <TabIcon className="h-4 w-4" />; })()}
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    activeTab === tab.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {tab.badge}
                  </span>
                )}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600"
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-6 py-6">
        <AnimatePresence mode="wait">
          {/* ─── Evidence Tab ─────────────────────────────────────────────── */}
          {activeTab === "evidence" && (
            <motion.div
              key="evidence"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-amber-900">Defects & testing</h2>
                    <p className="mt-1 text-xs text-amber-800">Never claim a part works only because it looks undamaged.</p>
                  </div>
                  <button onClick={() => { setEditingAttribute("visibleDamage"); setEditValue(attributeGroups.visibleDamage?.value === "—" ? "" : attributeGroups.visibleDamage?.value || ""); }} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Edit defects</button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><span className="font-medium">Condition: </span>{attributeGroups.condition?.value || "—"}</div>
                  <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"><span className="font-medium">Testing: </span>{attributeGroups.electricalTestStatus?.value || "not tested"}</div>
                </div>
              </div>

              {/* Editable product record */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">Field Evidence</h2>
                  <p className="text-xs text-slate-500">
                    {initialData.claims.length} claims from {initialData.sources.length} sources · click any row to see sources
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Attribute</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Value</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Sources</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Status</th>
                      <th className="px-4 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(attributeGroups).map(([attr, info]) => {
                      const meta = EVIDENCE_STATUS_META[info.status] || EVIDENCE_STATUS_META.reported;
                      const borderClass = info.status === "conflicting" ? "border-l-4 border-amber-500 bg-amber-50/40" : info.value === "—" || info.status === "unverified" ? "border-l-4 border-red-500 bg-red-50/40" : "border-l-4 border-emerald-500 bg-emerald-50/50";
                      const isEditing = editingAttribute === attr;
                      return (
                        <tr key={attr} className={`transition-colors hover:bg-slate-50 ${borderClass}`}>
                          <td className="px-4 py-2.5 font-medium text-slate-900">{attr}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <input autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} className="w-full rounded border border-emerald-400 px-2 py-1 text-xs outline-none" />
                                <button onClick={saveRecordEdit} disabled={isResolving} className="rounded bg-emerald-600 p-1 text-white"><Save className="h-3.5 w-3.5" /></button>
                              </div>
                            ) : info.value}
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-400" title={`Source: ${info.source}`}>{info.source}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${chipClass[meta.color]}`}>{meta.label}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1">
                              <button onClick={() => { setEditingAttribute(attr); setEditValue(info.value === "—" ? "" : info.value); }} className="rounded p-1 text-slate-400 hover:bg-white hover:text-emerald-600" title="Edit this value"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleRowClick(attr)} className="rounded p-1 text-slate-400 hover:bg-white"><ChevronRight className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {Object.keys(attributeGroups).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                          No evidence yet.{" "}
                          <Link href={`/parts/${partId}/intake`} className="text-indigo-600 hover:underline">
                            Add a source
                          </Link>{" "}
                          to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Assessments */}
              {initialData.assessments.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-900">Assessments & Issues</h2>
                    <p className="text-xs text-slate-500">
                      {initialData.assessments.length} issue{initialData.assessments.length !== 1 ? "s" : ""} found
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {initialData.assessments.map((asm) => {
                      const config = severityConfig[asm.severity] || severityConfig.info;
                      const Icon = config.icon;
                      return (
                        <div key={asm.id} className="flex items-start gap-3 px-4 py-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                            <Icon className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{asm.attribute}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${config.bg} ${config.color}`}>
                                {asm.assessmentType}
                              </span>
                            </div>
                            <p className="mt-0.5 text-sm text-slate-600">{asm.detail}</p>
                            {asm.referenceId && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-teal-600">
                                <CheckCircle2 className="h-3 w-3" />
                                Reference: {asm.referenceId} ({asm.referenceDatasetVersion})
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ─── Questions Tab ────────────────────────────────────────────── */}
          {activeTab === "questions" && (
            <motion.div
              key="questions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {questions.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white py-16">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <h3 className="mt-3 text-lg font-semibold text-slate-900">No open questions</h3>
                  <p className="mt-1 text-sm text-slate-500">All evidence checks have passed.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    Resolve these in priority order — conflicts first, then missing required fields, then uncertain observations.
                  </p>
                  {resolveError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                      {resolveError}
                    </div>
                  )}
                  {questions.map((question, i) => {
                    const impactConfig =
                      question.impact === "conflict"
                        ? severityConfig.error
                        : question.impact === "missing_required"
                          ? severityConfig.warning
                          : severityConfig.info;
                    const Icon = impactConfig.icon;
                    const relatedClaims = question.conflictingSources
                      .map((sourceId) =>
                        initialData.claims.find((c) => c.sourceId === sourceId),
                      )
                      .filter(Boolean) as Claim[];

                    return (
                      <motion.div
                        key={question.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        {/* Card header */}
                        <div className={`flex items-center gap-3 border-b ${impactConfig.bg} px-4 py-3`}>
                          <Icon className={`h-5 w-5 ${impactConfig.color}`} />
                          <div className="flex-1">
                            <span className="text-sm font-bold text-slate-900">{question.attribute}</span>
                            <span className="ml-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                              {question.impact === "missing_required" ? "missing" : question.impact}
                            </span>
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{question.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{question.whyItMatters}</p>

                          {/* Conflicting sources */}
                          {relatedClaims.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold text-slate-500 uppercase">Disagreeing sources:</p>
                              {relatedClaims.map((claim) => {
                                const source = sourceMap[claim.sourceId];
                                return (
                                  <div key={claim.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2">
                                    <div className="flex h-6 w-6 items-center justify-center rounded text-xs">
                                      {source?.type === "photo" && <Camera className="h-3 w-3 text-blue-500" />}
                                      {source?.type === "csv" && <FileSpreadsheet className="h-3 w-3 text-green-500" />}
                                      {source?.type === "note" && <MessageSquare className="h-3 w-3 text-emerald-500" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-mono text-xs font-semibold text-slate-700">{claim.value}</p>
                                      <p className="text-xs text-slate-500">
                                        "{claim.originalText}"
                                        {claim.language === "ar" && (
                                          <span className="ml-1 inline-flex items-center gap-0.5 text-blue-500">
                                            <Languages className="h-2.5 w-2.5" /> AR
                                          </span>
                                        )}
                                      </p>
                                      {claim.translation && (
                                        <p className="text-xs italic text-slate-400">→ {claim.translation}</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Candidate answers — recording a decision updates the record */}
                          {question.candidates.filter((c) => c.value).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {question.candidates
                                .filter((c) => c.value)
                                .map((candidate, ci) => (
                                  <button
                                    key={`${candidate.value}-${ci}`}
                                    onClick={() =>
                                      resolveQuestion(
                                        question.attribute,
                                        candidate.value,
                                        "candidate",
                                        question.id,
                                      )
                                    }
                                    disabled={isResolving}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {candidate.value}
                                    <span className="text-[9px] text-slate-400">(unverified)</span>
                                  </button>
                                ))}
                              <button
                                onClick={() =>
                                  resolveQuestion(question.attribute, "", "skip", question.id)
                                }
                                disabled={isResolving}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Skip — specialist review
                              </button>
                            </div>
                          )}

                          {/* Free-text answer */}
                          <ManualAnswer
                            attribute={question.attribute}
                            questionId={question.id}
                            disabled={isResolving}
                            onSubmit={(value) =>
                              resolveQuestion(question.attribute, value, "free_entry", question.id)
                            }
                          />

                          {/* How to check physically */}
                          <details className="mt-3 group">
                            <summary className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-700">
                              How to check physically →
                            </summary>
                            <div className="mt-2 rounded-lg bg-indigo-50 p-3 text-xs text-slate-600">
                              {question.howToCheck}
                            </div>
                          </details>
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              )}
            </motion.div>
          )}

          {/* ─── Listing Tab ──────────────────────────────────────────────── */}
          {activeTab === "listing" && (
            <motion.div
              key="listing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Listing draft preview */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Listing Draft</h2>
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                      Auto-generated
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  {/* Title */}
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500">Title</label>
                    <p className="mt-1 text-sm font-medium text-slate-900">{listingDraft.title}</p>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500">Category</label>
                    <p className="mt-1 text-sm text-slate-700">{listingDraft.category}</p>
                  </div>

                  {/* Item specifics */}
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500">Item Specifics</label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {Object.entries(listingDraft.itemSpecifics).map(([key, val]) => (
                        <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">{key}</p>
                          <p className="text-sm font-medium text-slate-700">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500">Description</label>
                    <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700 font-sans">
                      {listingDraft.description}
                    </pre>
                  </div>

                  {/* Disclosure block */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-semibold uppercase text-amber-700">Defect & Testing Disclosure</span>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm text-amber-900 font-sans">
                      {listingDraft.disclosureBlock}
                    </pre>
                  </div>

                  {/* Excluded claims — unsupported claims are kept out of the draft */}
                  {listingDraft.excludedClaims.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-slate-500" />
                        <span className="text-xs font-semibold uppercase text-slate-600">
                          Excluded from the draft ({listingDraft.excludedClaims.length})
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {listingDraft.excludedClaims.map((claim, ci) => (
                          <li key={`${claim.attribute}-${ci}`} className="text-sm text-slate-600">
                            <span className="font-medium text-slate-800">{claim.attribute}:</span>{" "}
                            {claim.value} — {claim.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Optimisation notes */}
                  {listingDraft.optimizationNotes.length > 0 && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-indigo-500" />
                        <span className="text-xs font-semibold uppercase text-indigo-700">
                          Optimisation notes
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {listingDraft.optimizationNotes.map((note, ni) => (
                          <li key={ni} className="text-sm text-indigo-800">
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Approval gate */}
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        {isApproved
                          ? "Draft approved — ready to publish"
                          : readinessChip.color === "red"
                            ? "Cannot approve — specialist review required"
                            : readinessChip.color === "amber"
                              ? "Cannot approve — information missing"
                              : "Ready for seller approval"}
                      </span>
                    </div>
                    <button
                      onClick={approveDraft}
                      disabled={readinessChip.color !== "green" || isApproving || isApproved}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                        readinessChip.color === "green" && !isApproved
                          ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:scale-[1.02]"
                          : "cursor-not-allowed bg-slate-200 text-slate-400"
                      }`}
                    >
                      {isApproving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {isApproved ? "Posted" : "Post the product"}
                    </button>
                  </div>
                  {approvalError && (
                    <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {approvalError}
                    </p>
                  )}
                  {readinessChip.color !== "green" && (
                    <p className="mt-1 text-xs text-slate-400">
                      Resolve all conflicts and missing required fields before approval.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Readiness Tab (Box 7) ───────────────────────────────────── */}
          {activeTab === "readiness" && (
            <motion.div
              key="readiness"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ReadinessPanel readiness={readiness} />
            </motion.div>
          )}

          {/* ─── Assistant Tab (Box 5) ────────────────────────────────────── */}
          {activeTab === "assistant" && (
            <motion.div
              key="assistant"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-[640px]"
            >
              <AssistantChat
                partId={partId}
                initialMessages={initialChatMessages}
                initialQuestions={questions}
                initialIssues={initialDetectedIssues}
                onResolved={() => router.refresh()}
              />
            </motion.div>
          )}

          {/* ─── History Tab ──────────────────────────────────────────────── */}
          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">Audit History</h2>
                  <p className="text-xs text-slate-500">
                    {initialData.events.length} events — sources, claims, decisions, and recomputes
                  </p>
                </div>
                <div className="relative px-4 py-4">
                  {/* Timeline line */}
                  <div className="absolute left-[28px] top-4 bottom-4 w-px bg-slate-200" />

                  <div className="space-y-3">
                    {initialData.events.map((event, i) => {
                      const meta = eventTypeMeta[event.eventType] || eventTypeMeta.source_added;
                      const Icon = meta.icon;
                      let payloadLabel = "";
                      try {
                        if (event.payload) {
                          const p = JSON.parse(event.payload);
                          if (p.type) payloadLabel = p.type;
                          else if (p.attribute) payloadLabel = p.attribute;
                          else if (p.action) payloadLabel = p.action;
                          else if (p.sourceId) payloadLabel = `source ${p.sourceId.slice(0, 12)}`;
                          else if (p.claimId) payloadLabel = `claim ${p.claimId.slice(0, 12)}`;
                        }
                      } catch {}

                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="relative flex items-start gap-3"
                        >
                          <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm">
                            <Icon className={`h-4 w-4 ${meta.color}`} />
                          </div>
                          <div className="flex-1 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{meta.label}</span>
                              {payloadLabel && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                                  {payloadLabel}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Clock className="h-3 w-3" />
                              {formatTime(new Date(event.createdAt))}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {posted && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setPosted(false)}>
            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-8 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-around text-2xl">🎉 ✨ 🎊 ✨ 🎉</div>
              <div className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><PartyPopper className="h-8 w-8 text-emerald-600" /></div>
              <h2 className="mt-4 text-xl font-bold text-slate-900">Post complete</h2>
              <p className="mt-2 text-sm text-slate-600">Your product listing card for {initialData.part.displayName || partId} is approved and ready to publish.</p>
              <button onClick={() => setPosted(false)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><PackageCheck className="h-4 w-4" />Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Claim Drawer ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && selectedAttribute && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedAttribute}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedClaims.length} claim{selectedClaims.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer body */}
              <div className="custom-scroll flex-1 overflow-y-auto p-5">
                <div className="space-y-4">
                  {selectedClaims.map((claim) => {
                    const source = sourceMap[claim.sourceId];
                    const meta = EVIDENCE_STATUS_META[claim.evidenceStatus as EvidenceStatus] || EVIDENCE_STATUS_META.reported;
                    const SourceIcon =
                      source?.type === "photo" ? Camera :
                      source?.type === "csv" || source?.type === "xlsx" ? FileSpreadsheet :
                      MessageSquare;

                    return (
                      <div key={claim.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        {/* Source badge */}
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                              <SourceIcon className="h-3.5 w-3.5 text-slate-500" />
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-700">{source?.type}</span>
                              {claim.language !== "unknown" && claim.language !== "en" && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600">
                                  <Languages className="h-2.5 w-2.5" />
                                  {claim.language}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass[meta.color]}`}>
                            {meta.label}
                          </span>
                        </div>

                        {/* Value */}
                        <div className="mb-2">
                          <span className="text-[10px] font-semibold uppercase text-slate-400">Extracted value</span>
                          <p className="font-mono text-sm font-semibold text-slate-900">{claim.value || "—"}</p>
                        </div>

                        {/* Original text */}
                        {claim.originalText && (
                          <div className="mb-2">
                            <span className="text-[10px] font-semibold uppercase text-slate-400">Original text</span>
                            <p
                              className="mt-0.5 rounded-lg bg-slate-50 p-2 text-sm text-slate-700"
                              dir={claim.language === "ar" ? "rtl" : "ltr"}
                            >
                              "{claim.originalText}"
                            </p>
                          </div>
                        )}

                        {/* Translation */}
                        {claim.translation && (
                          <div className="mb-2">
                            <span className="text-[10px] font-semibold uppercase text-slate-400">English translation</span>
                            <p className="mt-0.5 text-sm italic text-slate-600">{claim.translation}</p>
                          </div>
                        )}

                        {/* Uncertainty */}
                        {claim.uncertainty !== "low" && (
                          <div className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            Uncertainty: {claim.uncertainty}
                          </div>
                        )}

                        {/* Source link */}
                        {source?.filePath && (
                          <a
                            href={`/${source.filePath}`}
                            target="_blank"
                            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View source file
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Inline free-text answer box used in the Questions tab so the seller can
 * supply a value that is not among the candidate answers.
 */
function ManualAnswer({
  attribute,
  questionId,
  disabled,
  onSubmit,
}: {
  attribute: string;
  questionId?: string;
  disabled: boolean;
  onSubmit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600"
      >
        + Enter manually
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onSubmit(value.trim());
            setValue("");
            setOpen(false);
          }
        }}
        placeholder={`Enter the ${attribute} value...`}
        disabled={disabled}
        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
      />
      <button
        onClick={() => {
          if (value.trim()) {
            onSubmit(value.trim());
            setValue("");
            setOpen(false);
          }
        }}
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setValue("");
        }}
        disabled={disabled}
        className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40"
      >
        Cancel
      </button>
    </div>
  );
}