"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
  Info,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import type { ReadinessReport, ReadinessStatus } from "@/lib/types";

const statusMeta: Record<
  ReadinessStatus,
  { label: string; color: string; bg: string; border: string; icon: typeof Shield }
> = {
  ready: {
    label: "Ready for seller review",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    icon: CheckCircle2,
  },
  info_missing: {
    label: "Information missing",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: Info,
  },
  specialist_review: {
    label: "Specialist review required",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: AlertTriangle,
  },
};

interface Props {
  readiness: ReadinessReport;
}

export default function ReadinessPanel({ readiness }: Props) {
  const meta = statusMeta[readiness.status] ?? statusMeta.info_missing;
  const StatusIcon = meta.icon;

  const passed = readiness.items.filter((i) => i.status === "pass");
  const failed = readiness.items.filter((i) => i.status === "fail");
  const priorityActions = [...failed].sort((a, b) => Number(b.blocking) - Number(a.blocking));

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border ${meta.border} ${meta.bg} p-5`}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
            <StatusIcon className={`h-6 w-6 ${meta.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className={`text-lg font-bold ${meta.color}`}>{meta.label}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Checklist{" "}
              <span className="font-mono">{readiness.checklistVersion}</span>{" "}
              &middot; {passed.length} of {readiness.items.length} checks passed
            </p>
          </div>
        </div>

        {readiness.requiredNextSteps.length > 0 && (
          <div className="mt-4 rounded-xl bg-white/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Required next steps
            </p>
            <ul className="mt-2 space-y-1.5">
              {readiness.requiredNextSteps.map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>

      {priorityActions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm">
          <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Prioritised seller action plan</h3>
          </div>
          <ol className="space-y-3 p-4">
            {priorityActions.map((item, index) => (
              <li key={item.id} className="flex gap-3 rounded-xl bg-white p-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.blocking ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>P{index + 1}</span>
                <div><p className="text-sm font-semibold text-slate-900">{item.label}</p><p className="mt-0.5 text-sm text-slate-600">{item.detail}</p></div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <ListChecks className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">
            Shipping and Listing Readiness
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {readiness.items.map((item, i) => {
            const isPass = item.status === "pass";
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-3 px-4 py-3.5"
              >
                <div className="mt-0.5 shrink-0">
                  {isPass ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {item.label}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        isPass
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {isPass ? "Pass" : "Fail"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.description}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      isPass ? "text-slate-600" : "text-red-700"
                    }`}
                  >
                    {item.detail}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {readiness.nextActions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm">
          <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">
              Next actions ({readiness.nextActions.length})
            </h3>
          </div>
          <ul className="space-y-2 p-4">
            {readiness.nextActions.map((action, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-amber-900"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
