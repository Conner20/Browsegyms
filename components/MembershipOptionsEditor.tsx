"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { BILLING_FREQUENCIES, MembershipOption, annualFeeTimingLabel, emptyMembershipOption, effectiveMonthlyPrice, membershipMonthlyBreakdown } from "@/lib/memberships";
import CurrencyInput from "@/components/CurrencyInput";
import UniversalCheckbox from "@/components/UniversalCheckbox";

const input = "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#22c55e] dark:border-white/10 dark:bg-black/20";
const label = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";
const MONTHS = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: new Date(2025, index, 1).toLocaleDateString("en-US", { month: "long" }) }));

export default function MembershipOptionsEditor({ options, availableAmenities, onChange, showErrors }: { options: MembershipOption[]; availableAmenities: string[]; onChange: (options: MembershipOption[]) => void; showErrors: boolean }) {
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set(options.filter(option => !option.name || !option.purchaseUrl || !option.access.length).map(option => option.id)));
  const [customContractIds, setCustomContractIds] = useState<Set<string>>(() => new Set(options.filter(option => !(option.contractLengthUnit === "months" && [1, 3, 6, 12, 24].includes(option.contractLength))).map(option => option.id)));
  const [contractDrafts, setContractDrafts] = useState<Record<string, string>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);
  useEffect(() => {
    const currentIds = new Set(options.map(option => option.id));
    setCustomContractIds(current => {
      const next = new Set([...current].filter(id => currentIds.has(id)));
      for (const option of options) if (!(option.contractLengthUnit === "months" && [1, 3, 6, 12, 24].includes(option.contractLength))) next.add(option.id);
      return next;
    });
    setContractDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => currentIds.has(id))));
  }, [options]);
  const update = (index: number, values: Partial<MembershipOption>) => onChange(options.map((option, itemIndex) => itemIndex === index ? { ...option, ...values } : option));
  const requestDelete = (optionId: string, index: number) => {
    if (pendingDeleteId === optionId) {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = null;
      setPendingDeleteId(null);
      setEditingIds(current => { const next = new Set(current); next.delete(optionId); return next; });
      setCustomContractIds(current => { const next = new Set(current); next.delete(optionId); return next; });
      setContractDrafts(current => { const next = { ...current }; delete next[optionId]; return next; });
      onChange(options.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    setPendingDeleteId(optionId);
    deleteTimer.current = setTimeout(() => { setPendingDeleteId(null); deleteTimer.current = null; }, 3000);
  };
  const fieldClass = (invalid: boolean) => `${input} ${showErrors && invalid ? "!border-red-500" : ""}`;
  const firstUrl = options[0]?.purchaseUrl ?? "";
  return <div className="space-y-4">
    {options.map((option, index) => { const editing = editingIds.has(option.id), optionName = option.name.trim() || `Membership option ${index + 1}`, effectiveUrl = option.purchaseUrl || firstUrl, presetContract = option.contractLengthUnit === "months" && [1, 3, 6, 12, 24].includes(option.contractLength), customContract = customContractIds.has(option.id) || !presetContract; const toggleEditing = () => setEditingIds(current => { const next = new Set(current); if(next.has(option.id))next.delete(option.id);else next.add(option.id);return next; }); return <article key={option.id} className="group rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 transition-colors hover:border-white dark:border-white/10 dark:bg-black/20 dark:hover:border-white">
      <div role="button" tabIndex={0} aria-expanded={editing} onClick={toggleEditing} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleEditing(); } }} className={`flex cursor-pointer items-center justify-between gap-3 ${editing ? "mb-4" : ""}`}>
        <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap"><h3 className="shrink-0 font-black">{optionName}</h3><span className="min-w-0 truncate text-xs font-semibold text-[#22c55e]" title={`$${effectiveMonthlyPrice(option).toFixed(2)}/mo avg`}>${effectiveMonthlyPrice(option).toFixed(2)}/mo avg</span><span className="min-w-0 truncate text-xs text-zinc-500" title={effectiveUrl}>{effectiveUrl || "Membership URL required"}</span></div>
        <div className="flex shrink-0 items-center gap-2">{options.length>1?<button type="button" data-confirming={pendingDeleteId === option.id} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); requestDelete(option.id, index); }} className="listing-option-delete-button grid h-[34px] w-[34px] place-items-center rounded-full border border-red-300 text-red-500 transition hover:border-red-400 hover:bg-red-50 dark:border-red-400/40 dark:hover:bg-red-500/10" aria-label={pendingDeleteId === option.id ? `Confirm removal of ${optionName}` : `Remove ${optionName}`}><Trash2 size={16}/></button>:<span aria-hidden="true" className="invisible grid h-[34px] w-[34px] place-items-center"><Trash2 size={16}/></span>}<ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-zinc-500 transition dark:text-zinc-400 group-hover:text-white ${editing ? "rotate-180" : ""}`}/></div>
      </div>
      {editing && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Option name<input className={fieldClass(!option.name)} value={option.name} onChange={event => update(index, { name: event.target.value })} placeholder="Standard Membership" /></label>
        <label className={label}>Price<CurrencyInput label={`${option.name||`Membership option ${index+1}`} price`} className={fieldClass(!Number.isFinite(option.price)||option.price<=0)} value={option.price} onChange={price=>update(index,{price})}/></label>
        <label className={label}>Billing frequency<select className={input} value={option.billingFrequency} onChange={event => update(index, { billingFrequency: event.target.value as MembershipOption["billingFrequency"] })}>{BILLING_FREQUENCIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{option.billingFrequency==="custom"&&<span className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Custom billing interval" type="number" min="1" step="1" className={fieldClass(option.billingInterval<1)} value={option.billingInterval} onChange={event=>update(index,{billingInterval:Number(event.target.value)})}/><select aria-label="Custom billing interval unit" className={input} value={option.billingIntervalUnit} onChange={event=>update(index,{billingIntervalUnit:event.target.value as MembershipOption["billingIntervalUnit"]})}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></span>}</label>
        <label className={label}>Contract length<select className={input} value={customContract?"other":String(option.contractLength)} onChange={event => { if(event.target.value==="other"){setCustomContractIds(current=>new Set(current).add(option.id));setContractDrafts(current=>({...current,[option.id]:String(option.contractLength||2)}));update(index,{contractLength:option.contractLength||2,contractLengthUnit:"months"});}else{setCustomContractIds(current=>{const next=new Set(current);next.delete(option.id);return next});setContractDrafts(current=>{const next={...current};delete next[option.id];return next});update(index,{contractLength:Number(event.target.value),contractLengthUnit:"months"});} }}><option value="1">Month-to-month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="24">24 months</option><option value="other">Other</option></select>{customContract&&<span className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Custom contract length" type="number" min="1" step="1" className={fieldClass(option.contractLength<1)} value={contractDrafts[option.id]??String(option.contractLength||"")} onChange={event=>{const value=event.target.value;setContractDrafts(current=>({...current,[option.id]:value}));update(index,{contractLength:value===""?0:Number(value)})}}/><select aria-label="Custom contract length unit" className={input} value={option.contractLengthUnit} onChange={event=>update(index,{contractLengthUnit:event.target.value as MembershipOption["contractLengthUnit"]})}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></span>}</label>
        <label className={label}>Enrollment/initiation fee<CurrencyInput label={`${option.name||`Membership option ${index+1}`} enrollment or initiation fee`} className={input} value={option.enrollmentFee} onChange={enrollmentFee=>update(index,{enrollmentFee})}/></label>
        <label className={label}>Annual fee<CurrencyInput label={`${option.name||`Membership option ${index+1}`} annual fee`} className={input} value={option.annualFee} onChange={annualFee=>update(index,{annualFee})}/></label>
        {option.annualFee>0&&<label className={`${label} sm:col-span-2`}>Annual fee timing<select className={input} value={option.annualFeeTiming} onChange={event=>update(index,{annualFeeTiming:event.target.value as MembershipOption["annualFeeTiming"]})}><option value="anniversary">On the anniversary of the customer&apos;s signup date</option><option value="after_joining">A set amount of time after joining</option><option value="fixed_date">On a fixed calendar date for everyone</option></select>{option.annualFeeTiming==="after_joining"&&<span className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Annual fee time after joining" type="number" min="1" step="1" className={fieldClass(!Number.isInteger(option.annualFeeOffset)||option.annualFeeOffset<1)} value={option.annualFeeOffset||""} onChange={event=>update(index,{annualFeeOffset:Number(event.target.value)})}/><select aria-label="Annual fee time unit" className={input} value={option.annualFeeOffsetUnit} onChange={event=>update(index,{annualFeeOffsetUnit:event.target.value as MembershipOption["annualFeeOffsetUnit"]})}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></span>}{option.annualFeeTiming==="fixed_date"&&<span className="mt-2 grid grid-cols-2 gap-2"><select aria-label="Annual fee month" className={input} value={option.annualFeeMonth} onChange={event=>{const annualFeeMonth=Number(event.target.value),maxDay=new Date(2025,annualFeeMonth,0).getDate();update(index,{annualFeeMonth,annualFeeDay:Math.min(option.annualFeeDay,maxDay)})}}>{MONTHS.map(month=><option key={month.value} value={month.value}>{month.label}</option>)}</select><select aria-label="Annual fee day" className={input} value={option.annualFeeDay} onChange={event=>update(index,{annualFeeDay:Number(event.target.value)})}>{Array.from({length:new Date(2025,option.annualFeeMonth,0).getDate()},(_,day)=><option key={day+1} value={day+1}>{day+1}</option>)}</select></span>}</label>}
        <label className={label}>Additional fees<CurrencyInput label={`${option.name||`Membership option ${index+1}`} additional fees`} className={input} value={option.additionalFees} onChange={additionalFees=>update(index,{additionalFees})}/></label>
        <label className={label}>Additional fee details <span className="text-xs font-normal text-zinc-400">Optional</span><input className={input} value={option.additionalFeesDetails} onChange={event => update(index, { additionalFeesDetails: event.target.value })} placeholder="Key fee, maintenance fee, etc." /></label>
        <fieldset className="rounded-xl border border-zinc-200 p-3 sm:col-span-2 dark:border-white/10"><label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-200"><span>Guest passes</span><UniversalCheckbox checked={option.guestPassesEnabled} onChange={event=>update(index,event.target.checked?{guestPassesEnabled:true,guestPassCount:option.guestPassCount>0?option.guestPassCount:1}:{guestPassesEnabled:false})}/></label>{option.guestPassesEnabled&&<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={label}>Number of guest passes<input aria-label="Number of guest passes" type="number" min="1" step="1" className={fieldClass(!Number.isInteger(option.guestPassCount)||option.guestPassCount<1)} value={option.guestPassCount||""} onChange={event=>update(index,{guestPassCount:Number(event.target.value)})}/></label><label className={label}>Frequency<select aria-label="Guest pass frequency" className={input} value={option.guestPassFrequency} onChange={event=>update(index,{guestPassFrequency:event.target.value as MembershipOption["guestPassFrequency"]})}><option value="day">Per day</option><option value="week">Per week</option><option value="month">Per month</option><option value="year">Per year</option></select></label></div>}</fieldset>
        <fieldset className="sm:col-span-2"><legend className={label}>What&apos;s included (access)</legend>{availableAmenities.length?<div className={`mt-2 flex min-w-0 flex-wrap items-start gap-2 rounded-xl border p-2 ${showErrors&&!option.access.some(item=>availableAmenities.includes(item))?"border-red-500":"border-zinc-200 dark:border-white/10"}`}>{availableAmenities.map(amenity=>{const checked=option.access.includes(amenity);return <label key={amenity} className={`inline-flex w-fit max-w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${checked?"border-[#22c55e] bg-[#22c55e]/10":"border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5"}`}><UniversalCheckbox checked={checked} onChange={()=>update(index,{access:checked?option.access.filter(item=>item!==amenity):[...option.access,amenity]})}/><span className="min-w-0 break-words">{amenity}</span></label>})}</div>:<p className={`mt-2 rounded-xl border p-3 text-sm ${showErrors?"border-red-500 text-red-500":"border-zinc-200 text-zinc-500 dark:border-white/10"}`}>Select amenities under Facility details before choosing membership access.</p>}</fieldset>
        <label className={`${label} sm:col-span-2`}>Membership purchase URL<input type="text" inputMode="url" className={fieldClass(index===0&&!option.purchaseUrl)} value={index>0&&!option.purchaseUrl ? options[0]?.purchaseUrl ?? "" : option.purchaseUrl} onChange={event => update(index, { purchaseUrl: event.target.value })} placeholder="gym.com/memberships" /></label>
        <label className={`${label} sm:col-span-2`}>Additional notes <span className="text-xs font-normal text-zinc-400">Optional</span><textarea rows={3} className={input} value={option.notes} onChange={event => update(index, { notes: event.target.value })} /></label>
      </div>
      <MembershipAverageBreakdown option={option} />
      </>}
    </article>; })}
    <button type="button" onClick={() => { const next = { ...emptyMembershipOption(), purchaseUrl: firstUrl }; setEditingIds(current => new Set(current).add(next.id)); onChange([...options, next]); }} className="gym-listing-primary-action gym-membership-add-action inline-flex items-center gap-2 rounded-xl border border-transparent bg-[#22c55e] px-6 py-2.5 text-sm font-black text-[#111411] transition hover:border-[#22c55e] hover:bg-zinc-50 hover:text-[#22c55e] dark:hover:bg-neutral-950"><Plus size={17}/>Add membership option</button>
  </div>;
}

function MembershipAverageBreakdown({ option }: { option: MembershipOption }) {
  const breakdown = membershipMonthlyBreakdown(option);
  const monthlyTerms = [breakdown.recurringMonthly, breakdown.annualFeeMonthly, breakdown.upfrontFeesMonthly]
    .filter(value => Number(value.toFixed(2)) > 0);
  const upfrontFormula = [option.enrollmentFee, option.additionalFees]
    .filter(value => Number(value.toFixed(2)) > 0)
    .map(value => `$${value.toFixed(2)}`)
    .join(" + ");
  return <details className="group mt-4 border-t border-zinc-200 pt-3 dark:border-white/10">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 text-sm font-semibold text-zinc-500 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">
      <span>View monthly average price breakdown</span>
      <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
    </summary>
    <div className="mt-3 space-y-3 rounded-xl bg-white p-4 [font-family:var(--font-anonymous-pro)] text-xs leading-6 tracking-wide text-zinc-600 dark:bg-black/20 dark:text-white/75">
      {Number(breakdown.recurringMonthly.toFixed(2)) > 0 && <div><span className="text-zinc-400 dark:text-white/40">Recurring price</span><p>{breakdown.recurringFormula} = ${breakdown.recurringMonthly.toFixed(2)}/mo</p></div>}
      {Number(breakdown.annualFeeMonthly.toFixed(2)) > 0 && <div><span className="text-zinc-400 dark:text-white/40">Annual fee</span><p>${option.annualFee.toFixed(2)} ÷ 12 months = ${breakdown.annualFeeMonthly.toFixed(2)}/mo</p><p>{annualFeeTimingLabel(option)}</p></div>}
      {Number(breakdown.upfrontFeesMonthly.toFixed(2)) > 0 && <div><span className="text-zinc-400 dark:text-white/40">One-time fees</span><p>{upfrontFormula} ÷ {breakdown.contractMonthsFormula} = ${breakdown.upfrontFeesMonthly.toFixed(2)}/mo</p></div>}
      {monthlyTerms.length > 0 && <div className="border-t border-zinc-200 pt-2 font-bold text-zinc-950 dark:border-white/10 dark:text-white"><p>{monthlyTerms.map(value => `$${value.toFixed(2)}`).join(" + ")} = ${breakdown.averageMonthly.toFixed(2)}/mo avg</p></div>}
      {!monthlyTerms.length && <p className="text-zinc-400">Enter membership pricing to calculate the monthly average.</p>}
    </div>
  </details>;
}
