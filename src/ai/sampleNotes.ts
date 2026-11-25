/**
 * Demo call notes for the copilot panel. Written in a rep's voice, parameterized by
 * company so they work on whichever prospect is open (they're tuned for Cedar).
 */
export interface SampleNote {
  id: "buyer-confirmed" | "guardrail";
  label: string;
  description: string;
  text: (company: string) => string;
}

export const SAMPLE_NOTES: readonly SampleNote[] = [
  {
    id: "buyer-confirmed",
    label: "Sample: buyer confirmed, 21-day window",
    description: "Maya Lin is confirmed as the final decision maker; budget not yet discussed.",
    text: (company) =>
      `Discovery call with ${company} today. Maya Lin, VP of Operations, confirmed she is the final decision maker for this purchase.
They want to make a buying decision within 21 days.
Budget hasn't been discussed with finance yet. I'll send the pricing deck in 2 days.`,
  },
  {
    id: "guardrail",
    label: "Sample: tricky note (negation & uncertainty)",
    description: "Hedged, negated and hypothetical statements that should leave every field unchanged.",
    text: (company) =>
      `Quick call with ${company}. Their CFO isn't the one who signs off, and we still need to learn who the final decision maker is.
If budget is approved next quarter they might move fast, and they hope to decide "sometime soon" but gave no date.
Their IT lead asked whether we support regulated workflows; they said they don't need one today.
A partner told us ${company} already has budget set aside. I'll follow up with a security pack in 3 days.`,
  },
];
