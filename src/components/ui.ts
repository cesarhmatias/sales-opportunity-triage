import type { BudgetStatus, BuyerStatus, RequirementSupport, Stance, WorkflowFit } from "../domain/types";
import { TEAM } from "../domain/validation";

/* ---------- Class names (focus-visible outlines come from globals.css) ---------- */

export const cardClass = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
export const cardTitleClass = "text-base font-semibold text-slate-900";
export const labelClass = "block text-sm font-medium text-slate-700";
export const hintClass = "mt-1 text-xs text-slate-500";
export const errorTextClass = "mt-1 text-xs font-medium text-red-700";
export const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-600";
const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed";
export const primaryButtonClass = `${buttonBase} bg-blue-700 text-white hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-600`;
export const secondaryButtonClass = `${buttonBase} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400`;

/* ---------- Labels ---------- */

export const FIT_LABEL: Record<WorkflowFit, string> = {
  strong: "Strong",
  apparent: "Apparent",
  mixed: "Mixed",
  poor: "Poor",
};

export const BUYER_LABEL: Record<BuyerStatus, string> = {
  confirmed: "Confirmed",
  unknown: "Unknown",
  no_access: "No access",
};

export const BUDGET_LABEL: Record<BudgetStatus, string> = {
  confirmed: "Confirmed",
  not_confirmed: "Asked, not yet confirmed",
  unknown: "Unknown",
};

export const SUPPORT_LABEL: Record<RequirementSupport, string> = {
  supported: "Supported",
  custom_work: "Custom work",
  unsupported: "Unsupported",
};

export const STANCE_BADGE: Record<Stance, string> = {
  work_today: "bg-emerald-50 text-emerald-800 ring-emerald-600/30",
  queue_next: "bg-amber-50 text-amber-800 ring-amber-600/30",
  excluded: "bg-slate-100 text-slate-700 ring-slate-500/30",
};

export const ROLE_LABEL = { manager: "Sales Manager", rep: "Sales Rep" } as const;

export function teamMemberLabel(id: string): string {
  const member = TEAM.find((m) => m.id === id);
  return member ? `${member.name} (${ROLE_LABEL[member.role]})` : `Unknown (${id})`;
}

export function teamMemberName(id: string): string {
  return TEAM.find((m) => m.id === id)?.name ?? id;
}

/* ---------- Locale-independent formatting (identical on server and client) ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatTimestamp(iso: string): string {
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${formatDate(date)}, ${time} UTC`;
}

export function formatAcvShort(usd: number): string {
  return usd >= 1000 ? `$${Math.round(usd / 1000)}k` : `$${usd}`;
}

export function formatDays(days: number | null): string {
  if (days === null) return "Timeline unknown";
  if (days < 0) return `Date passed ${-days}d ago`;
  return `${days}d to decision`;
}
