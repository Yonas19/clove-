/**
 * verify.ts — Internal verification: contradictions, missing required fields,
 * uncertain observations. Also runs reference checks against the local CSV.
 */

import { getDb, schema } from "./db/client";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";

// ─── Load reference fitment data ────────────────────────────────────────────
interface ReferenceRow {
  partNumber: string;
  donorMake: string;
  donorModel: string;
  donorYear: string;
  side: string;
  functions: string;
  fitmentNotes: string;
}

function loadReferenceData(): ReferenceRow[] {
  const csvPath = path.join(process.cwd(), "data", "reference_fitment.csv");
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: ReferenceRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] || "";
    });
    rows.push(row as unknown as ReferenceRow);
  }

  return rows;
}

// ─── Load required fields from schema ───────────────────────────────────────
function loadRequiredFields(): string[] {
  const schemaPath = path.join(process.cwd(), "schema", "mirror.json");
  if (!fs.existsSync(schemaPath)) return [];

  const content = fs.readFileSync(schemaPath, "utf-8");
  const parsed = JSON.parse(content);
  return parsed.attributes
    .filter((a: { required: boolean }) => a.required)
    .map((a: { name: string }) => a.name);
}

// ─── Main verification entry point ──────────────────────────────────────────
export interface VerificationResult {
  assessments: {
    id: string;
    attribute: string;
    assessmentType: "conflict" | "missing" | "uncertain" | "reference_check";
    severity: "info" | "warning" | "error";
    detail: string;
    relatedClaimIds?: string[];
    referenceId?: string;
    referenceDatasetVersion?: string;
  }[];
  missing: string[];
  conflicts: string[];
}

export function verifyPart(partId: string): VerificationResult {
  const db = getDb();
  const now = new Date();
  const allClaims = db.select().from(schema.claims).all().filter((c) => c.partId === partId);
  const decisions = db.select().from(schema.decisions).all().filter((d) => d.partId === partId && d.answerType !== "skip");
  const decisionByAttribute = new Map<string, string>();
  for (const decision of decisions) decisionByAttribute.set(decision.attribute, decision.answer);

  // Synthetic marketplace standard used by the demo. These fields are asked
  // after analysis and seller answers are recorded as auditable decisions.
  const requiredFields = [
    ...new Set([
      ...loadRequiredFields(),
      "condition",
      "includedComponents",
      "packagedDimensions",
      "packagedWeight",
    ]),
  ];
  const referenceData = loadReferenceData();

  const assessments: VerificationResult["assessments"] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];

  // Clear old assessments for THIS part only (not every part).
  const staleAssessments = db
    .select()
    .from(schema.assessments)
    .all()
    .filter((a) => a.partId === partId);

  for (const stale of staleAssessments) {
    db.delete(schema.assessments)
      .where(eq(schema.assessments.id, stale.id))
      .run();
  }

  // ─── Group claims by attribute ────────────────────────────────────────────
  const claimsByAttribute: Record<string, typeof allClaims> = {};
  for (const claim of allClaims) {
    if (!claimsByAttribute[claim.attribute]) {
      claimsByAttribute[claim.attribute] = [];
    }
    claimsByAttribute[claim.attribute].push(claim);
  }

  // ─── Check for conflicts (same attribute, different values) ───────────────
  for (const [attr, claims] of Object.entries(claimsByAttribute)) {
    const values = claims
      .map((c) => c.value?.trim())
      .filter((v) => v && v !== "—")
      .map((v) => v!.toLowerCase());
    const uniqueValues = [...new Set(values)];

    if (uniqueValues.length > 1) {
      const assessmentId = `ASM-${partId}-${attr}-conflict-${Date.now()}`;
      const claimIds = claims.map((c) => c.id);

      // Update claim evidence statuses to conflicting
      for (const claim of claims) {
        db.update(schema.claims)
          .set({ evidenceStatus: "conflicting" })
          .where(eq(schema.claims.id, claim.id))
          .run();
      }

      assessments.push({
        id: assessmentId,
        attribute: attr,
        assessmentType: "conflict",
        severity: "error",
        detail: `Sources disagree on "${attr}": ${claims.map((c) => `${c.value} (from ${c.language})`).join(" vs ")}. No auto-selection — seller must resolve.`,
        relatedClaimIds: claimIds,
      });
      conflicts.push(attr);

      db.insert(schema.assessments).values({
        id: assessmentId,
        partId,
        attribute: attr,
        assessmentType: "conflict",
        severity: "error",
        detail: assessments[assessments.length - 1].detail,
        relatedClaimIds: JSON.stringify(claimIds),
        createdAt: now,
      }).run();
    }
  }

  // ─── Check for missing required fields ────────────────────────────────────
  for (const field of requiredFields) {
    const fieldClaims = claimsByAttribute[field] || [];
    const decisionValue = decisionByAttribute.get(field)?.trim();
    const hasValue = Boolean(decisionValue) || fieldClaims.some(
      (c) => c.value && c.value.trim() !== "" && c.extractionStatus !== "failed",
    );

    if (!hasValue) {
      const assessmentId = `ASM-${partId}-${field}-missing-${Date.now()}`;
      missing.push(field);

      assessments.push({
        id: assessmentId,
        attribute: field,
        assessmentType: "missing",
        severity: "error",
        detail: `Required field "${field}" has no usable evidence. Please provide a source for this attribute.`,
      });

      db.insert(schema.assessments).values({
        id: assessmentId,
        partId,
        attribute: field,
        assessmentType: "missing",
        severity: "error",
        detail: assessments[assessments.length - 1].detail,
        createdAt: now,
      }).run();
    }
  }

  // OEM-marked parts require identity confirmation in this synthetic standard.
  const brand = decisionByAttribute.get("brand") || claimsByAttribute.brand?.find((claim) => claim.value)?.value || "";
  const oemRequired = /\boem\b|genuine/i.test(brand);
  if (oemRequired) {
    for (const field of ["vin", "oemPartNumber"]) {
      const value = decisionByAttribute.get(field)?.trim() || claimsByAttribute[field]?.find((claim) => claim.value)?.value?.trim();
      if (!value) {
        const id = `ASM-${partId}-${field}-missing-${Date.now()}`;
        assessments.push({
          id,
          attribute: field,
          assessmentType: "missing",
          severity: "error",
          detail: `OEM-marked part requires a ${field === "vin" ? "VIN" : "manufacturer OEM part number"} before listing.`,
        });
        missing.push(field);
        db.insert(schema.assessments).values({ id, partId, attribute: field, assessmentType: "missing", severity: "error", detail: assessments[assessments.length - 1].detail, createdAt: now }).run();
      }
    }

    const oemPartNumber = decisionByAttribute.get("oemPartNumber") || claimsByAttribute.oemPartNumber?.find((claim) => claim.value)?.value;
    const partNumber = decisionByAttribute.get("partNumber") || claimsByAttribute.partNumber?.find((claim) => claim.value)?.value;
    if (oemPartNumber && partNumber && oemPartNumber.trim().toLowerCase() !== partNumber.trim().toLowerCase()) {
      const id = `ASM-${partId}-oemPartNumber-conflict-${Date.now()}`;
      assessments.push({ id, attribute: "oemPartNumber", assessmentType: "conflict", severity: "error", detail: "OEM part number does not match the listed part number. Confirm the manufacturer label before publishing." });
      conflicts.push("oemPartNumber");
      db.insert(schema.assessments).values({ id, partId, attribute: "oemPartNumber", assessmentType: "conflict", severity: "error", detail: assessments[assessments.length - 1].detail, createdAt: now }).run();
    }
  }

  // ─── Check for uncertain claims ───────────────────────────────────────────
  for (const claim of allClaims) {
    if (claim.uncertainty === "high" || claim.extractionStatus === "uncertain") {
      const assessmentId = `ASM-${partId}-${claim.attribute}-uncertain-${Date.now()}`;

      assessments.push({
        id: assessmentId,
        attribute: claim.attribute,
        assessmentType: "uncertain",
        severity: "warning",
        detail: `Observation for "${claim.attribute}" is uncertain (from ${claim.originalText}). Seller confirmation needed.`,
        relatedClaimIds: [claim.id],
      });

      db.insert(schema.assessments).values({
        id: assessmentId,
        partId,
        attribute: claim.attribute,
        assessmentType: "uncertain",
        severity: "warning",
        detail: assessments[assessments.length - 1].detail,
        relatedClaimIds: JSON.stringify([claim.id]),
        createdAt: now,
      }).run();
    }
  }

  // ─── Reference check: part number match ───────────────────────────────────
  const pnClaims = claimsByAttribute["partNumber"] || [];
  for (const claim of pnClaims) {
    if (!claim.value) continue;
    const match = referenceData.find(
      (r) => r.partNumber.toLowerCase() === claim.value!.toLowerCase(),
    );

    if (match) {
      // Update claim to reference_supported
      db.update(schema.claims)
        .set({ evidenceStatus: "reference_supported" })
        .where(eq(schema.claims.id, claim.id))
        .run();

      assessments.push({
        id: `ASM-${partId}-pn-ref-${Date.now()}`,
        attribute: "partNumber",
        assessmentType: "reference_check",
        severity: "info",
        detail: `Part number "${claim.value}" matches reference data. Fitment: ${match.fitmentNotes}.`,
        referenceId: match.partNumber,
        referenceDatasetVersion: "reference_fitment.csv v1",
      });

      db.insert(schema.assessments).values({
        id: assessments[assessments.length - 1].id,
        partId,
        attribute: "partNumber",
        assessmentType: "reference_check",
        severity: "info",
        detail: assessments[assessments.length - 1].detail,
        referenceId: match.partNumber,
        referenceDatasetVersion: "reference_fitment.csv v1",
        createdAt: now,
      }).run();
    }
  }

  // Log verification event
  db.insert(schema.events).values({
    id: `EVT-VERIFY-${partId}-${Date.now()}`,
    partId,
    eventType: "verification",
    payload: JSON.stringify({
      assessments: assessments.length,
      conflicts: conflicts.length,
      missing: missing.length,
    }),
    createdAt: now,
  }).run();

  return { assessments, missing, conflicts };
}
