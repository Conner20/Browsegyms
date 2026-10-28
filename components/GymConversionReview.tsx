"use client";
import Link from "next/link";
import { Trash2 } from "lucide-react";

import { useMemo, useState } from "react";
import type { ConversionReviewRow, ConversionReviewStatus } from "@/lib/conversion-review";

const PAGE_SIZE = 5;
type Decision = Exclude<ConversionReviewStatus, "check_later">;
const choices: { value: Decision; label: string }[] = [
  { value: "purchased", label: "Yes" },
  { value: "not_found", label: "No" },
];

export default function GymConversionReview({ initialRows }: { initialRows: ConversionReviewRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [historyPage, setHistoryPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const pendingRows = useMemo(() => rows.filter(row => row.status === "check_later"), [rows]);
  const confirmedRows = useMemo(() => rows.filter(row => row.status === "purchased"), [rows]);
  const unanswered = pendingRows.filter(row => !decisions[row.id]).length;
  const canSubmit = unanswered === 0 && !saving;
  const pageCount = Math.max(1, Math.ceil(confirmedRows.length / PAGE_SIZE));
  const visibleConfirmedRows = confirmedRows.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);

  const update = (id: string, status: Decision) => setDecisions(current => ({ ...current, [id]: status }));
  const submit = async () => {
    setSaving(true);
    setMessage("");
    const submittedAt = new Date().toISOString();
    const submitted = pendingRows.map(row => ({ clickId: row.id, status: decisions[row.id] }));
    const response = await fetch("/api/referrals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisions: submitted }) });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setMessage(result.message ?? "Unable to save the review."); return; }
    setRows(current => current.map(row => row.status === "check_later" ? { ...row, status: decisions[row.id], confirmedAt: submittedAt } : row));
    setDecisions({});
    setHistoryPage(1);
    setMessage("Referral confirmations saved. You may now exit this page.");
  };
  const removeConfirmation = async (row: ConversionReviewRow) => {
    setDeletingId(row.id);
    setMessage("");
    const response = await fetch("/api/referrals", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clickId: row.id }) });
    const result = await response.json().catch(() => ({}));
    setDeletingId(null);
    if (!response.ok) { setMessage(result.message ?? "Unable to remove the confirmation."); return; }
    setRows(current => current.map(item => item.id === row.id ? { ...item, status: "check_later", confirmedAt: undefined } : item));
    setDecisions(current => { const next = { ...current }; delete next[row.id]; return next; });
    setHistoryPage(page => Math.max(1, Math.min(page, Math.ceil((confirmedRows.length - 1) / PAGE_SIZE))));
    setMessage("Referral confirmation removed. It is ready to review again.");
  };

  return <div className="text-white">
    <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#111411] shadow-2xl">
      <header className="border-b border-white/10 p-6 sm:p-8">
        <p className="max-w-2xl text-sm leading-6 text-white/60">Review each referral and confirm whether they purchased the selected day pass or membership.</p>
      </header>

      {pendingRows.length ? <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-white/45"><tr><th className="p-4">User email</th><th>Offer</th><th>Clicked</th><th className="pr-4">Purchased?</th></tr></thead>
            <tbody>{pendingRows.map(row => <tr key={row.id} className="border-t border-white/10"><td className="p-4 font-semibold">{row.email}</td><td className="font-semibold">{row.offer}</td><td>{new Date(row.clickedAt).toLocaleString()}</td><td className="py-3 pr-4"><div className="flex gap-1.5">{choices.map(choice => <button key={choice.value} type="button" onClick={() => update(row.id, choice.value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${decisions[row.id] === choice.value ? "green-button-ui border-[#22c55e]" : "border-white/15 text-white/65 hover:border-white/40"}`}>{choice.label}</button>)}</div></td></tr>)}</tbody>
          </table>
        </div>
        <footer className="border-t border-white/10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-4"><button type="button" disabled={!canSubmit} onClick={() => void submit()} className={`w-full rounded-full border px-6 py-3 text-sm font-black transition sm:w-auto ${canSubmit ? "green-button-ui border-[#22c55e]" : "cursor-not-allowed border-[#166534] bg-[#14532d] text-[#86efac]"}`}>{saving ? "Submitting…" : "Submit confirmations"}</button></div>
        </footer>
      </> : <div className="border-b border-white/10 p-8 text-center text-white/55">There are no unconfirmed referrals to review.</div>}

      {message && <p role="status" className={`border-b border-white/10 px-6 py-4 text-sm font-bold sm:px-8 ${message.startsWith("Referral") ? "text-[#86efac]" : "text-red-300"}`}>{message}</p>}

      <details className="group p-6 sm:p-8">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black">
          <span>Previous confirmations ({confirmedRows.length})</span>
          <span className="text-xl text-white/50 transition group-open:rotate-45">+</span>
        </summary>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          {confirmedRows.length ? <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-white/45"><tr><th className="p-4">User email</th><th>Offer</th><th>Clicked</th><th>Confirmed</th><th className="pr-4 text-right">Remove</th></tr></thead>
            <tbody>{visibleConfirmedRows.map(row => <tr key={row.id} className="border-t border-white/10"><td className="p-4 font-semibold">{row.email}</td><td className="font-semibold">{row.offer}</td><td>{new Date(row.clickedAt).toLocaleString()}</td><td>{row.confirmedAt ? new Date(row.confirmedAt).toLocaleString() : "Confirmed"}</td><td className="py-2 pr-4 text-right"><button type="button" disabled={deletingId===row.id} aria-label={`Remove confirmation for ${row.email}`} title="Remove confirmation" onClick={()=>void removeConfirmation(row)} className="inline-grid h-9 w-9 place-items-center rounded-full border border-red-400/35 text-red-300 transition hover:border-red-300 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-40"><Trash2 className="h-4 w-4"/></button></td></tr>)}</tbody>
          </table> : <p className="p-6 text-center text-sm text-white/50">No previous confirmations.</p>}
        </div>
        {confirmedRows.length > PAGE_SIZE && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={historyPage === 1} onClick={() => setHistoryPage(page => Math.max(1, page - 1))} className="rounded-full border border-white/15 px-4 py-2 font-bold disabled:opacity-35">Previous</button><span className="text-white/55">Page {historyPage} of {pageCount}</span><button type="button" disabled={historyPage === pageCount} onClick={() => setHistoryPage(page => Math.min(pageCount, page + 1))} className="rounded-full border border-white/15 px-4 py-2 font-bold disabled:opacity-35">Next</button></div>}
      </details>
    </section>
    <div className="flex justify-center py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="gym-owner-back-button rounded-xl border border-white/20 bg-transparent px-6 py-2.5 text-sm font-black text-white/75 transition hover:border-white hover:text-white">Back</Link>
    </div>
  </div>;
}
