import type { BuyerStatus, TriageEntry, WorkflowFit } from "../domain/types";

export type AllocationBucket = "all" | "focus" | "outside" | "excluded";
export type TimelineBucket = "all" | "le14" | "15to30" | "31to60" | "gt60" | "unknown";

export interface QueueFilters {
  search: string;
  bucket: AllocationBucket;
  fit: WorkflowFit | "all";
  decisionMaker: BuyerStatus | "all";
  timeline: TimelineBucket;
}

export const EMPTY_FILTERS: QueueFilters = {
  search: "",
  bucket: "all",
  fit: "all",
  decisionMaker: "all",
  timeline: "all",
};

export const BUCKET_OPTIONS: { value: AllocationBucket; label: string }[] = [
  { value: "all", label: "All buckets" },
  { value: "focus", label: "Today's focus" },
  { value: "outside", label: "Outside today's slots (eligible)" },
  { value: "excluded", label: "Excluded by gate" },
];

export const FIT_OPTIONS: { value: WorkflowFit | "all"; label: string }[] = [
  { value: "all", label: "Any fit" },
  { value: "strong", label: "Strong" },
  { value: "apparent", label: "Apparent" },
  { value: "mixed", label: "Mixed" },
  { value: "poor", label: "Poor" },
];

export const DECISION_MAKER_OPTIONS: { value: BuyerStatus | "all"; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "confirmed", label: "Confirmed" },
  { value: "unknown", label: "Unknown" },
  { value: "no_access", label: "No access" },
];

export const TIMELINE_OPTIONS: { value: TimelineBucket; label: string }[] = [
  { value: "all", label: "Any timeline" },
  { value: "le14", label: "14 days or fewer" },
  { value: "15to30", label: "15–30 days" },
  { value: "31to60", label: "31–60 days" },
  { value: "gt60", label: "More than 60 days" },
  { value: "unknown", label: "Unknown or passed" },
];

export function timelineBucket(daysToDecision: number | null): Exclude<TimelineBucket, "all"> {
  if (daysToDecision === null || daysToDecision < 0) return "unknown";
  if (daysToDecision <= 14) return "le14";
  if (daysToDecision <= 30) return "15to30";
  if (daysToDecision <= 60) return "31to60";
  return "gt60";
}

function bucketOf(entry: TriageEntry): Exclude<AllocationBucket, "all"> {
  if (entry.evaluation.stance === "excluded") return "excluded";
  return entry.evaluation.inFocusSlot ? "focus" : "outside";
}

export function hasActiveFilters(filters: QueueFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.bucket !== "all" ||
    filters.fit !== "all" ||
    filters.decisionMaker !== "all" ||
    filters.timeline !== "all"
  );
}

/**
 * Filters already-triaged entries for display only. Triage always runs on the full
 * set first, so filtering never promotes a prospect into a focus slot.
 */
export function filterEntries(entries: readonly TriageEntry[], filters: QueueFilters): TriageEntry[] {
  const query = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    const { facts, evaluation } = entry;
    if (query && !facts.company.toLowerCase().includes(query)) return false;
    if (filters.bucket !== "all" && bucketOf(entry) !== filters.bucket) return false;
    if (filters.fit !== "all" && facts.workflowFit !== filters.fit) return false;
    if (filters.decisionMaker !== "all" && facts.economicBuyer.status !== filters.decisionMaker) return false;
    if (filters.timeline !== "all" && timelineBucket(evaluation.daysToDecision) !== filters.timeline) return false;
    return true;
  });
}
