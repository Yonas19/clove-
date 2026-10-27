import { getDb, schema } from "@/lib/db/client";
import { EVIDENCE_STATUS_META, type EvidenceStatus } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Upload, Plus } from "lucide-react";
import { PartWorkspaceClient } from "@/components/PartWorkspaceClient";
import { computeReadiness } from "@/lib/readiness";
import { generateQuestions } from "@/lib/questions";
import { generateListingDraft } from "@/lib/listing";
import { getChatState } from "@/lib/chat";

export const dynamic = "force-dynamic";

async function getPartData(partId: string) {
  const db = getDb();
  const allParts = db.select().from(schema.parts).all();
  const partRow = allParts.find((p) => p.id === partId);
  if (!partRow) return null;

  const allClaims = db
    .select()
    .from(schema.claims)
    .all()
    .filter((c) => c.partId === partId);
  const allSources = db
    .select()
    .from(schema.sources)
    .all()
    .filter((s) => s.partId === partId);
  const allAssessments = db
    .select()
    .from(schema.assessments)
    .all()
    .filter((a) => a.partId === partId);
  const allDecisions = db
    .select()
    .from(schema.decisions)
    .all()
    .filter((d) => d.partId === partId);
  const allEvents = db
    .select()
    .from(schema.events)
    .all()
    .filter((e) => e.partId === partId);

  return {
    part: partRow,
    claims: allClaims,
    sources: allSources,
    assessments: allAssessments,
    decisions: allDecisions,
    events: allEvents,
  };
}

export default async function PartWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const requestedTab = (await searchParams).tab;
  const data = await getPartData(id);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-lg font-medium text-slate-900">Part not found</p>
          <p className="mt-1 text-sm text-slate-500">
            Part <code className="font-mono text-indigo-600">{id}</code> does not exist.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Serialize data for the client component
  const serializedData = {
    part: {
      id: data.part.id,
      displayName: data.part.displayName,
      partType: data.part.partType,
      createdAt: data.part.createdAt instanceof Date
        ? data.part.createdAt.toISOString()
        : String(data.part.createdAt),
      updatedAt: data.part.updatedAt instanceof Date
        ? data.part.updatedAt.toISOString()
        : String(data.part.updatedAt),
    },
    claims: data.claims.map((c) => ({
      id: c.id,
      attribute: c.attribute,
      value: c.value,
      sourceId: c.sourceId,
      originalText: c.originalText,
      language: c.language,
      translation: c.translation,
      extractionStatus: c.extractionStatus,
      evidenceStatus: c.evidenceStatus as EvidenceStatus,
      uncertainty: c.uncertainty,
      createdAt: c.createdAt instanceof Date
        ? c.createdAt.toISOString()
        : String(c.createdAt),
    })),
    sources: data.sources.map((s) => ({
      id: s.id,
      type: s.type,
      filePath: s.filePath,
      originalText: s.originalText,
      language: s.language,
      detectedFormat: s.detectedFormat,
      createdAt: s.createdAt instanceof Date
        ? s.createdAt.toISOString()
        : String(s.createdAt),
    })),
    assessments: data.assessments.map((a) => ({
      id: a.id,
      attribute: a.attribute,
      assessmentType: a.assessmentType,
      severity: a.severity,
      detail: a.detail,
      relatedClaimIds: a.relatedClaimIds,
      referenceId: a.referenceId,
      referenceDatasetVersion: a.referenceDatasetVersion,
      createdAt: a.createdAt instanceof Date
        ? a.createdAt.toISOString()
        : String(a.createdAt),
    })),
    decisions: data.decisions.map((d) => ({
      attribute: d.attribute,
      answer: d.answer,
      answerType: d.answerType,
      note: d.note,
    })),
    events: data.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      payload: e.payload,
      createdAt: e.createdAt instanceof Date
        ? e.createdAt.toISOString()
        : String(e.createdAt),
    })),
  };

  // Group claims by attribute for initial data
  const attributeGroups: Record<
    string,
    { value: string; status: EvidenceStatus; claimCount: number }
  > = {};
  for (const claim of data.claims) {
    const existing = attributeGroups[claim.attribute];
    if (existing) {
      existing.claimCount++;
    } else {
      attributeGroups[claim.attribute] = {
        value: claim.value || "—",
        status: claim.evidenceStatus as EvidenceStatus,
        claimCount: 1,
      };
    }
  }

  const openQuestions = data.assessments.filter(
    (a) => a.severity === "error" || a.severity === "warning",
  ).length;

  // ─── Server-computed workspace state (Boxes 4, 5, 6, 7) ─────────────────
  const readiness = computeReadiness(id);
  const questions = generateQuestions(id);
  const listingDraft = generateListingDraft(id);
  const chat = getChatState(id);

  // The stored draft tells us whether it has already been approved
  const storedDrafts = getDb()
    .select()
    .from(schema.listingDrafts)
    .all()
    .filter((d) => d.partId === id)
    .sort((a, b) => b.version - a.version);
  const isApproved = Boolean(storedDrafts[0]?.isApproved);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3.5">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex flex-1 items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900">
              {data.part.displayName || data.part.id}
            </h1>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
              {data.part.id}
            </span>
          </div>
          <Link
            href={`/parts/${id}/intake`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50"
          >
            <Upload className="h-4 w-4" />
            Add evidence
          </Link>
        </div>
      </header>

      <PartWorkspaceClient
        partId={id}
        initialData={serializedData}
        readiness={readiness}
        questions={questions}
        listingDraft={listingDraft}
        chatMessages={chat.messages}
        detectedIssues={chat.detectedIssues}
        isApproved={isApproved}
        initialTab={requestedTab === "questions" ? "questions" : "evidence"}
      />
    </div>
  );
}
