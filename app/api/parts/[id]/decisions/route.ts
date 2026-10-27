import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { recordDecision, generateQuestions } from "@/lib/questions";
import { computeAndStoreReadiness } from "@/lib/readiness";
import { generateAndStoreListingDraft } from "@/lib/listing";
import { verifyPart } from "@/lib/verify";

/**
 * Records a seller decision that resolves a question, then re-runs
 * verification, readiness and listing generation so the workspace reflects
 * the answer immediately.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: partId } = await params;
    const db = getDb();

    const allParts = db.select().from(schema.parts).all();
    if (!allParts.some((p) => p.id === partId)) {
      return NextResponse.json(
        { error: `Part ${partId} not found` },
        { status: 404 },
      );
    }

    const body = (await req.json()) as {
      attribute?: string;
      answer?: string;
      answerType?: "candidate" | "free_entry" | "skip";
      note?: string;
      questionId?: string;
    };

    if (!body.attribute) {
      return NextResponse.json(
        { error: "attribute is required" },
        { status: 400 },
      );
    }

    const answer = body.answer ?? "";
    const answerType = body.answerType ?? "free_entry";

    const result = recordDecision(partId, body.attribute, answer, {
      answerType,
      note: body.note,
      questionId: body.questionId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to record decision" },
        { status: 500 },
      );
    }

    // Re-run verification so resolved questions disappear from the queue
    verifyPart(partId);

    // Regenerate the listing draft first, then recompute readiness so the
    // checklist can verify the draft's disclosure block.
    const draft = generateAndStoreListingDraft(partId);
    const readiness = computeAndStoreReadiness(partId);

    db.update(schema.parts).set({ updatedAt: new Date() }).where(eq(schema.parts.id, partId)).run();

    const remainingQuestions = generateQuestions(partId);

    return NextResponse.json({
      ok: true,
      partId,
      attribute: body.attribute,
      answer,
      answerType,
      readiness: {
        status: readiness.status,
        nextActions: readiness.nextActions,
      },
      listingDraft: {
        version: draft.version,
        title: draft.title,
      },
      remainingQuestions: remainingQuestions.length,
    });
  } catch (error) {
    console.error("Failed to record decision:", error);
    return NextResponse.json(
      { error: "Failed to record decision" },
      { status: 500 },
    );
  }
}
