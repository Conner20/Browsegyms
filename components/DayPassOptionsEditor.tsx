"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import CurrencyInput from "@/components/CurrencyInput";
import UniversalCheckbox from "@/components/UniversalCheckbox";
import { DayPassOption, dayPassDurationLabel, dayPassOptionLabel, defaultDayPassOptionName, emptyDayPassOption } from "@/lib/day-passes";

const input = "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#22c55e] dark:border-white/10 dark:bg-black/20";
const label = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";

export default function DayPassOptionsEditor({ options, availableAmenities, onChange, showErrors }: { options: DayPassOption[]; availableAmenities: string[]; onChange: (options: DayPassOption[]) => void; showErrors: boolean }) {
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set(options.filter(option => !option.name || !option.purchaseUrl || !option.access.length).map(option => option.id)));
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);
  const update = (index: number, values: Partial<DayPassOption>) => onChange(options.map((option, itemIndex) => itemIndex === index ? { ...option, ...values } : option));
  const requestDelete = (optionId: string, index: number) => {
    if (pendingDeleteId === optionId) {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = null;
      setPendingDeleteId(null);
      setEditingIds(current => { const next = new Set(current); next.delete(optionId); return next; });
      onChange(options.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    setPendingDeleteId(optionId);
    deleteTimer.current = setTimeout(() => { setPendingDeleteId(null); deleteTimer.current = null; }, 3000);
  };
  const firstUrl = options[0]?.purchaseUrl ?? "";
  return <div className="space-y-4">
    {options.map((option, index) => { const editing = editingIds.has(option.id), optionName = dayPassOptionLabel(option), effectiveUrl = option.purchaseUrl || firstUrl; const toggleEditing = () => setEditingIds(current => { const next = new Set(current); if (next.has(option.id)) next.delete(option.id); else next.add(option.id); return next; }); return <article key={option.id} className="group rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 transition-colors hover:border-white dark:border-white/10 dark:bg-black/20 dark:hover:border-white">
      <div role="button" tabIndex={0} aria-expanded={editing} onClick={toggleEditing} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleEditing(); } }} className={`flex cursor-pointer items-center justify-between gap-3 ${editing ? "mb-4" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap">
            <h3 className="shrink-0 font-black">{optionName}</h3>
            <span className="shrink-0 text-sm font-semibold text-[#22c55e]">${option.price.toFixed(2)}</span>
            <span className="min-w-0 truncate text-xs text-zinc-500" title={effectiveUrl}>
              {effectiveUrl || "Pass URL required"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {options.length > 1 ? <button type="button" data-confirming={pendingDeleteId === option.id} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); requestDelete(option.id, index); }} className="listing-option-delete-button grid h-[34px] w-[34px] place-items-center rounded-full border border-red-300 text-red-500 transition hover:border-red-400 hover:bg-red-50 dark:border-red-400/40 dark:hover:bg-red-500/10" aria-label={pendingDeleteId === option.id ? `Confirm removal of ${optionName}` : `Remove ${optionName}`}><Trash2 size={16}/></button> : <span aria-hidden="true" className="invisible grid h-[34px] w-[34px] place-items-center"><Trash2 size={16}/></span>}
          <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-zinc-500 transition dark:text-zinc-400 group-hover:text-white ${editing ? "rotate-180" : ""}`}/>
        </div>
      </div>
      {editing && <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Option name<input required className={`${input} ${showErrors && !option.name.trim() ? "!border-red-500" : ""}`} value={option.name} onChange={event => update(index, { name: event.target.value })} placeholder="Single-day Pass" /></label>
        <label className={label}>Price<CurrencyInput label={`${dayPassDurationLabel(option.durationDays)} price`} className={`${input} ${showErrors && (!Number.isFinite(option.price) || option.price < 0) ? "!border-red-500" : ""}`} value={option.price} onChange={price => update(index, { price })}/></label>
        <fieldset className="sm:col-span-2"><legend className={label}>What&apos;s included (access)</legend>{availableAmenities.length ? <div className={`mt-2 flex min-w-0 flex-wrap items-start gap-2 rounded-xl border p-2 ${showErrors && !option.access.some(item => availableAmenities.includes(item)) ? "border-red-500" : "border-zinc-200 dark:border-white/10"}`}>{availableAmenities.map(amenity => { const checked = option.access.includes(amenity); return <label key={amenity} className={`inline-flex w-fit max-w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${checked ? "border-[#22c55e] bg-[#22c55e]/10" : "border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5"}`}><UniversalCheckbox checked={checked} onChange={() => update(index, { access: checked ? option.access.filter(item => item !== amenity) : [...option.access, amenity] })}/><span className="min-w-0 break-words">{amenity}</span></label>; })}</div> : <p className={`mt-2 rounded-xl border p-3 text-sm ${showErrors ? "border-red-500 text-red-500" : "border-zinc-200 text-zinc-500 dark:border-white/10"}`}>Select amenities under Facility details before choosing pass access.</p>}</fieldset>
        <label className={`${label} sm:col-span-2`}>Pass URL<input required={index === 0} type="text" inputMode="url" className={`${input} ${showErrors && index === 0 && !option.purchaseUrl ? "!border-red-500" : ""}`} value={index > 0 && !option.purchaseUrl ? firstUrl : option.purchaseUrl} onChange={event => update(index, { purchaseUrl: event.target.value })} placeholder="gym.com/pass" /></label>
        <label className={`${label} sm:col-span-2`}>Description <span className="text-xs font-normal text-zinc-400">Optional</span><textarea rows={3} className={input} value={option.description} onChange={event => update(index, { description: event.target.value })} /></label>
      </div>}
    </article>; })}
    <button type="button" onClick={() => { const durationDays = Math.max(0, ...options.map(option => option.durationDays)) + 1; const next = { ...emptyDayPassOption(), name: defaultDayPassOptionName(durationDays), durationDays, purchaseUrl: firstUrl, access: [...(options[0]?.access ?? [])] }; setEditingIds(current => new Set(current).add(next.id)); onChange([...options, next]); }} className="green-button-ui gym-listing-primary-action inline-flex items-center gap-2 rounded-xl border px-6 py-2.5 text-sm font-black"><Plus size={17}/>Add pass option</button>
  </div>;
}
