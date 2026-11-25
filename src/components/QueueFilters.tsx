import { Search } from "lucide-react";
import {
  BUCKET_OPTIONS,
  DECISION_MAKER_OPTIONS,
  FIT_OPTIONS,
  TIMELINE_OPTIONS,
  hasActiveFilters,
  type QueueFilters as Filters,
} from "../lib/queueFilters";
import { inputClass, labelClass, secondaryButtonClass } from "./ui";

interface QueueFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}

function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} className={inputClass} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function QueueFilters({ filters, onChange, onClear }: QueueFiltersProps) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });

  return (
    <form
      role="search"
      aria-label="Search and filter prospects"
      onSubmit={(event) => event.preventDefault()}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label htmlFor="queue-search" className={labelClass}>
          Search prospects
        </label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 mt-0.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id="queue-search"
            type="search"
            className={`${inputClass} pl-8`}
            placeholder="Company name"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FilterSelect
          id="filter-bucket"
          label="Allocation bucket"
          value={filters.bucket}
          options={BUCKET_OPTIONS}
          onChange={(v) => set("bucket", v)}
        />
        <FilterSelect id="filter-fit" label="Workflow fit" value={filters.fit} options={FIT_OPTIONS} onChange={(v) => set("fit", v)} />
        <FilterSelect
          id="filter-decision-maker"
          label="Decision maker"
          value={filters.decisionMaker}
          options={DECISION_MAKER_OPTIONS}
          onChange={(v) => set("decisionMaker", v)}
        />
        <FilterSelect
          id="filter-timeline"
          label="Buying timeline"
          value={filters.timeline}
          options={TIMELINE_OPTIONS}
          onChange={(v) => set("timeline", v)}
        />
      </div>
      {hasActiveFilters(filters) && (
        <button type="button" className={`${secondaryButtonClass} w-full`} onClick={onClear}>
          Clear all filters
        </button>
      )}
    </form>
  );
}
