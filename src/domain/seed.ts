import { addDays } from "./dates";
import type { ProspectFacts } from "./types";

export const SAMPLE_REFERENCE_DATE = "2026-03-10";
export const FOCUS_SLOTS = 3;

const NO_BUYER_INFO = { status: "unknown", name: null, title: null } as const;

/**
 * The six starting prospects, encoded only from what was stated.
 * Relative timelines ("decide within 14 days") are anchored to the sample reference date.
 */
export const SEED_PROSPECTS: readonly ProspectFacts[] = [
  {
    id: "alder",
    company: "Alder",
    potentialAcvUsd: 120_000,
    workflowFit: "poor",
    economicBuyer: { ...NO_BUYER_INFO },
    budget: "unknown",
    targetDecisionDate: addDays(SAMPLE_REFERENCE_DATE, 180),
    requirements: [{ description: "Regulated workflow", support: "unsupported" }],
  },
  {
    id: "birch",
    company: "Birch",
    potentialAcvUsd: 24_000,
    workflowFit: "strong",
    // Buyer confirmed; no name or title was given, so none is recorded.
    economicBuyer: { status: "confirmed", name: null, title: null },
    budget: "unknown",
    targetDecisionDate: addDays(SAMPLE_REFERENCE_DATE, 14),
    requirements: [],
  },
  {
    id: "cedar",
    company: "Cedar",
    potentialAcvUsd: 70_000,
    workflowFit: "apparent",
    economicBuyer: { ...NO_BUYER_INFO },
    budget: "unknown",
    targetDecisionDate: null,
    requirements: [],
  },
  {
    id: "delta",
    company: "Delta",
    potentialAcvUsd: 45_000,
    workflowFit: "strong",
    economicBuyer: { ...NO_BUYER_INFO },
    budget: "confirmed",
    targetDecisionDate: addDays(SAMPLE_REFERENCE_DATE, 30),
    requirements: [],
  },
  {
    id: "elm",
    company: "Elm",
    potentialAcvUsd: 90_000,
    workflowFit: "mixed",
    economicBuyer: { ...NO_BUYER_INFO },
    budget: "unknown",
    targetDecisionDate: addDays(SAMPLE_REFERENCE_DATE, 60),
    requirements: [{ description: "Custom integration", support: "custom_work" }],
  },
  {
    id: "fern",
    company: "Fern",
    potentialAcvUsd: 18_000,
    workflowFit: "strong",
    economicBuyer: { ...NO_BUYER_INFO },
    budget: "not_confirmed",
    targetDecisionDate: addDays(SAMPLE_REFERENCE_DATE, 14),
    requirements: [],
  },
];
