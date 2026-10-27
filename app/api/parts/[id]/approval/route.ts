import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { approveLatestDraft, generateAndStoreListingDraft } from "@/lib/listing";
import { computeAndStoreReadiness } from "@/lib/readiness";

/**
 * Approves the current listing draft.
 *
 * The approval gate is enforced server-side: a draft can only be approved when
 * no error-severity assessment and no conflict remains.
 */
export async function POST(
  _req: NextRequest,
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

    // Ensure a draft exists — generate one if the part was never drafted
    const existing = db
      .select()
      .from(schema.listingDrafts)
      .all()
      .filter((d) => d.partId === partId);

    if (existing.length === 0) {
      generateAndStoreListingDraft(partId);
    }

    const readiness = computeAndStoreReadiness(partId);
    const result = approveLatestDraft(partId);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to approve listing draft" },
        { status: 409 },
      );
    }

    db.update(schema.parts).set({ updatedAt: new Date() }).where(eq(schema.parts.id, partId)).run();

    return NextResponse.json({
      ok: true,
      partId,
      version: result.version,
      readiness: readiness.status,
    });
  } catch (error) {
    console.error("Approval failed:", error);
    return NextResponse.json(
      { error: "Failed to approve listing draft" },
      { status: 500 },
    );
  }
}
