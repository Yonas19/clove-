/**
 * questions.ts — Turns verification assessments into targeted seller questions.
 *
 * Implements the bridge between Box 4 (Verification & Analysis) and Box 5
 * (Seller Interaction & Resolution) of the architecture: each conflict, gap
 * or uncertain observation becomes a concrete question with candidate answers
 * and a physical "how to check" instruction.
 */

import { getDb, schema } from "./db/client";
import { eq } from "drizzle-orm";
import type { Question, QuestionCandidate } from "./types";

interface ClaimRow {
  id: string;
  attribute: string;
  value: string | null;
  sourceId: string;
  originalText: string | null;
  language: string | null;
  translation: string | null;
}

/** Physical inspection guidance per attribute. */
const HOW_TO_CHECK: Record<string, string> = {
  partNumber:
    "Look for a sticker, label, or embossed number on the mirror housing, backing plate, or mounting bracket. Take a sharp close-up photo of the label.",
  side:
    "Check the shape of the mounting bracket and the triangle-cut corner. On most vehicles the left mirror has a triangular blanking plate. Photograph the mount.",
  donorMake:
    "Look for the donor vehicle badge or the original part label. The make may also be engraved into the plastic housing.",
  donorModel:
    "The model name is usually printed on the housing label alongside the part number. Photograph that label.",
  donorYear:
    "Check the manufacturing date stamped on the housing label, or match the VIN on the donor vehicle. Photograph it.",
  brand:
    "Check whether the housing carries an OEM badge or an aftermarket brand stamp (TYC, Depo, etc.). Photograph the badge.",
  functions:
    "Test each function with a 12V supply: heating element resistance, folding motor operation, mirror adjustment motor, indicator and blind-spot signal LEDs.",
  visibleDamage:
    "Inspect the housing, glass and mount in good light for cracks, scratches, missing clips or a distorted mounting tab. Photograph any damage.",
  electricalTestStatus:
    "Connect to a 12V supply and a multimeter and test each function. Photograph the meter reading next to the part.",
  price: "Confirm the internal yard price and the price you intend to list at.",
  storageLocation:
    "Confirm the rack or bin the part is physically stored in so the picking team can find it.",
  packagedDimensions:
    "Measure the packed box (or the part plus packing material) — length, width and height in centimetres.",
  packagedWeight:
    "Weigh the packed part on a scale and record the result in kilograms.",
  condition:
    "Confirm whether the item is used and describe its condition. Do not claim it works because it looks undamaged.",
  includedComponents:
    "List every component included with the sale, such as glass, cover, wiring or fasteners.",
  vin:
    "Read the 17-character VIN from the donor vehicle or its record and photograph it if available.",
  oemPartNumber:
    "Read the manufacturer OEM label carefully and compare it with the part number being listed.",
  accessories:
    "Count and list the items that come with the part: screws, clips, wiring harness, trim cover.",
  photoRefs:
    "Upload clear photos of the front, back, housing label, mounting bracket and any damage.",
};

/** Human-readable label per attribute. */
const ATTR_LABEL: Record<string, string> = {
  partNumber: "Part number",
  side: "Side",
  donorMake: "Donor make",
  donorModel: "Donor model",
  donorYear: "Donor year",
  brand: "Brand",
  functions: "Functions",
  visibleDamage: "Visible damage",
  electricalTestStatus: "Electrical test status",
  price: "Price",
  storageLocation: "Storage location",
  accessories: "Accessories",
  photoRefs: "Photo references",
  packagedDimensions: "Packaged dimensions",
  packagedWeight: "Packed weight",
  condition: "Used condition",
  includedComponents: "Included components",
  vin: "Vehicle identification number (VIN)",
  oemPartNumber: "OEM part number",
};

function labelFor(attr: string): string {
  return ATTR_LABEL[attr] ?? attr;
}

/**
 * Build a question from a conflict assessment.
 */
function buildConflictQuestion(
  partId: string,
  attribute: string,
  relatedClaims: ClaimRow[],
): Question {
  const candidates: QuestionCandidate[] = relatedClaims
    .filter((c) => c.value)
    .map((c) => ({
      value: c.value as string,
      sourceId: c.sourceId,
      label: c.value as string,
      unverified: true,
    }));

  // Offer a sensible "I don't know" escape hatch
  candidates.push({
    value: "",
    label: "Skip — I need to check the physical part",
    unverified: true,
  });

  return {
    id: `Q-CONFLICT-${partId}-${attribute}`,
    partId,
    attribute,
    impact: "conflict",
    title: `Sources disagree on ${labelFor(attribute).toLowerCase()}`,
    whyItMatters: `A listing can only publish one value for ${labelFor(attribute).toLowerCase()}. Picking the wrong one can cause a return or a safety issue.`,
    conflictingSources: relatedClaims.map((c) => c.sourceId),
    candidates,
    howToCheck:
      HOW_TO_CHECK[attribute] ??
      "Compare the sources directly against the physical part and photograph the evidence.",
  };
}

/**
 * Build a question from a missing-required-field assessment.
 */
function buildMissingQuestion(
  partId: string,
  attribute: string,
): Question {
  const quickValues: Record<string, string[]> = {
    condition: ["used - no visible damage", "used - defects present"],
    visibleDamage: ["no visible damage", "defects present - describe below"],
    electricalTestStatus: ["passed", "failed", "not_tested"],
    side: ["L", "R"],
    partType: ["mirror"],
  };
  const candidates: QuestionCandidate[] = (quickValues[attribute] ?? []).map((value) => ({
    value,
    label: value.replaceAll("_", " "),
    unverified: false,
  }));
  candidates.push({
    value: "",
    label: "Skip — no evidence available for this field",
    unverified: true,
  });

  return {
    id: `Q-MISSING-${partId}-${attribute}`,
    partId,
    attribute,
    impact: "missing_required",
    title: `${labelFor(attribute)} is required but has no evidence`,
    whyItMatters: `${labelFor(attribute)} is a required listing field. eBay Motors listings without it get de-ranked or rejected, and buyers cannot verify fitment.`,
    conflictingSources: [],
    candidates,
    howToCheck:
      HOW_TO_CHECK[attribute] ??
      "Find the information on the part label, in your inventory system, or by physically inspecting the part, then add it as a source.",
  };
}

/**
 * Build a question from an uncertain observation.
 */
function buildUncertainQuestion(
  partId: string,
  attribute: string,
  relatedClaims: ClaimRow[],
): Question {
  const candidates: QuestionCandidate[] = relatedClaims
    .filter((c) => c.value)
    .map((c) => ({
      value: c.value as string,
      sourceId: c.sourceId,
      label: c.value as string,
      unverified: true,
    }));

  candidates.push({
    value: "",
    label: "Skip — confirm this one later",
    unverified: true,
  });

  return {
    id: `Q-UNCERTAIN-${partId}-${attribute}`,
    partId,
    attribute,
    impact: "uncertain",
    title: `Please confirm ${labelFor(attribute).toLowerCase()}`,
    whyItMatters: `The extraction for ${labelFor(attribute).toLowerCase()} was not fully confident. Confirming it removes it from the "needs review" list.`,
    conflictingSources: relatedClaims.map((c) => c.sourceId),
    candidates,
    howToCheck:
      HOW_TO_CHECK[attribute] ??
      "Physically inspect the part and confirm or deny the observation. Photograph the result.",
  };
}

/**
 * Generate the open question queue for a part, ordered by priority:
 * conflicts first, then missing required fields, then uncertain observations.
 */
export function generateQuestions(partId: string): Question[] {
  const db = getDb();

  const assessments = db
    .select()
    .from(schema.assessments)
    .all()
    .filter((a) => a.partId === partId);

  const claims = db
    .select()
    .from(schema.claims)
    .all()
    .filter((c) => c.partId === partId);

  const claimsById = new Map(claims.map((c) => [c.id, c]));

  // Attributes already answered by the seller should not re-appear
  const decisions = db
    .select()
    .from(schema.decisions)
    .all()
    .filter((d) => d.partId === partId);
  const answered = new Set(decisions.map((d) => d.attribute));

  const questions: Question[] = [];

  for (const assessment of assessments) {
    if (answered.has(assessment.attribute)) continue;

    let related: ClaimRow[] = [];
    if (assessment.relatedClaimIds) {
      try {
        const ids = JSON.parse(assessment.relatedClaimIds) as string[];
        related = ids
          .map((id) => claimsById.get(id))
          .filter((c): c is NonNullable<typeof c> => c !== undefined);
      } catch {
        related = [];
      }
    }

    if (assessment.assessmentType === "conflict") {
      questions.push(buildConflictQuestion(partId, assessment.attribute, related));
    } else if (assessment.assessmentType === "missing") {
      questions.push(buildMissingQuestion(partId, assessment.attribute));
    } else if (assessment.assessmentType === "uncertain") {
      questions.push(buildUncertainQuestion(partId, assessment.attribute, related));
    }
  }

  // Sort: conflict → missing → uncertain
  const impactRank: Record<Question["impact"], number> = {
    conflict: 0,
    missing_required: 1,
    uncertain: 2,
  };

  return questions.sort(
    (a, b) => impactRank[a.impact] - impactRank[b.impact],
  );
}

/**
 * Record a seller decision and re-run verification + readiness.
 */
export function recordDecision(
  partId: string,
  attribute: string,
  answer: string,
  options: {
    answerType?: "candidate" | "free_entry" | "skip";
    note?: string;
    questionId?: string;
  } = {},
): { ok: boolean; error?: string } {
  const db = getDb();
  const now = new Date();

  const answerType = options.answerType ?? "free_entry";

  db.insert(schema.decisions)
    .values({
      id: `DEC-${partId}-${attribute}-${Date.now()}`,
      partId,
      questionId: options.questionId ?? null,
      attribute,
      answer,
      answerType,
      isVerified: true,
      note: options.note ?? null,
      createdAt: now,
    })
    .run();

  // Mark the attribute's claims as seller-confirmed
  const claims = db
    .select()
    .from(schema.claims)
    .all()
    .filter((c) => c.partId === partId && c.attribute === attribute);

  for (const claim of claims) {
    db.update(schema.claims)
      .set({ evidenceStatus: "seller_confirmed" })
      .where(eq(schema.claims.id, claim.id))
      .run();
  }

  db.insert(schema.events)
    .values({
      id: `EVT-DECISION-${partId}-${Date.now()}`,
      partId,
      eventType: "decision",
      payload: JSON.stringify({
        action: "seller_decision",
        attribute,
        answer,
        answerType,
      }),
      createdAt: now,
    })
    .run();

  return { ok: true };
}
