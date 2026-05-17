"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Search } from "lucide-react";

import {
  fetchLearnerLookup,
  type LearnerLookupItem,
} from "@/lib/students/student-lookup";

type LearnerPickerProps = {
  label: string;
  tenantSlug: string;
  value: LearnerLookupItem | null;
  onChange: (learner: LearnerLookupItem | null) => void;
  fetchLearners?: typeof fetchLearnerLookup;
  hint?: string;
};

export function LearnerPicker({
  label,
  tenantSlug,
  value,
  onChange,
  fetchLearners = fetchLearnerLookup,
  hint,
}: LearnerPickerProps) {
  const inputId = useId();
  const selectedLabel = value ? `${value.name} (${value.admissionNumber})` : "";
  const [query, setQuery] = useState(selectedLabel);
  const [results, setResults] = useState<LearnerLookupItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canSearch = useMemo(
    () => tenantSlug.trim().length > 0 && query.trim().length >= 2 && query !== selectedLabel,
    [query, selectedLabel, tenantSlug],
  );

  useEffect(() => {
    if (!canSearch) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      fetchLearners({ tenantSlug, query, limit: 8 })
        .then((items) => {
          if (cancelled) {
            return;
          }

          setResults(items);
          setError(null);
        })
        .catch((lookupError) => {
          if (cancelled) {
            return;
          }

          setResults([]);
          setError(
            lookupError instanceof Error
              ? lookupError.message
            : "Learner search failed.",
          );
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [canSearch, fetchLearners, query, tenantSlug]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-800" htmlFor={inputId}>
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          className="input-base pl-9"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults([]);
            onChange(null);
          }}
          placeholder="Search name or admission number"
          autoComplete="off"
        />
      </div>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {results.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {results.map((learner) => (
            <button
              key={learner.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none"
              onClick={() => {
                onChange(learner);
                setQuery(`${learner.name} (${learner.admissionNumber})`);
                setResults([]);
              }}
            >
              <span>
                <span className="block font-medium text-slate-900">{learner.name}</span>
                <span className="block text-xs text-slate-500">
                  {learner.classLabel ?? "No active class recorded"}
                </span>
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                {learner.admissionNumber}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
