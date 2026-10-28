"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, MapPin, Plus, Search, Share2 } from "lucide-react";

type Gym = { id: string; name: string; address: string; coverPhotoUrl: string | null; isPublished: boolean; isClaimed: boolean; ownerEmails: string[] };
export default function AdminGymManager() {
    const [gyms, setGyms] = useState<Gym[]>([]);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [message, setMessage] = useState("");
    const [copiedAction, setCopiedAction] = useState<string | null>(null);
    const [visibleClaimOwnerGymId, setVisibleClaimOwnerGymId] = useState<string | null>(null);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadMoreMarker = useRef<HTMLDivElement>(null);
    const requestId = useRef(0);

    useEffect(() => {
        const media = window.matchMedia("(max-width: 767px)");
        const update = () => setIsMobile(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    const loadMore = useCallback(async () => {
        if (loading || !hasMore) return;
        const nextPage = page + 1;
        const id = ++requestId.current;
        setLoading(true);
        const gymResponse = await fetch(`/api/admin/gyms?q=${encodeURIComponent(query)}&page=${nextPage}`, { cache: "no-store" });
        if (gymResponse.ok) {
            const result = await gymResponse.json();
            if (id !== requestId.current) return;
            setGyms((current) => {
                const known = new Set(current.map((gym) => gym.id));
                return [...current, ...result.gyms.filter((gym: Gym) => !known.has(gym.id))];
            });
            setTotal(result.pagination.total);
            setPage(nextPage);
            setHasMore(nextPage < result.pagination.totalPages);
        }
        if (id === requestId.current) setLoading(false);
    }, [hasMore, loading, page, query]);

    useEffect(() => {
        const timer = window.setTimeout(async () => {
            const id = ++requestId.current;
            setLoading(true);
            const response = await fetch(`/api/admin/gyms?q=${encodeURIComponent(query)}&page=1`, { cache: "no-store" });
            if (!response.ok || id !== requestId.current) { if (id === requestId.current) setLoading(false); return; }
            const result = await response.json();
            setGyms(result.gyms);
            setPage(1);
            setTotal(result.pagination.total);
            setHasMore(result.pagination.totalPages > 1);
            setLoading(false);
        }, 200);
        return () => window.clearTimeout(timer);
    }, [query]);
    useEffect(() => {
        const marker = loadMoreMarker.current;
        if (!marker) return;
        const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMore(); }, { rootMargin: "300px 0px" });
        observer.observe(marker);
        return () => observer.disconnect();
    }, [loadMore]);
    useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

    async function shareGym(gym: Gym) {
        if (gym.isClaimed) return;
        setMessage("");
        const actionKey = `verify:${gym.id}`;
        setCopiedAction(actionKey);
        if (copyTimer.current) { clearTimeout(copyTimer.current); copyTimer.current = null; }
        const response = await fetch(`/api/admin/gyms/${gym.id}/invite`, { method: "POST" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { setCopiedAction(null); setMessage(result.message ?? "Unable to create a share link."); return; }
        try {
            await navigator.clipboard.writeText(result.url);
        } catch {
            window.prompt("Copy this gym verification link:", result.url);
        }
        copyTimer.current = setTimeout(() => { setCopiedAction((current) => current === actionKey ? null : current); copyTimer.current = null; }, 2000);
    }

    return <div className="space-y-10">
        {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
        <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 className="text-2xl font-semibold">Gym listings</h2></div>
                <Link href="/admin/gyms/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-4 py-2.5 text-sm font-bold text-black transition hover:bg-[#19a94e]"><Plus size={17} />Add new gym listing</Link>
            </div>
            <label className="mt-5 flex max-w-xl items-center gap-2 rounded-xl border border-black/10 bg-white px-3 dark:border-white/10 dark:bg-white/5"><Search size={17} className="text-zinc-400" /><input value={query} onChange={(event) => { requestId.current++; setQuery(event.target.value); setGyms([]); setPage(1); setHasMore(false); }} className="w-full bg-transparent py-3 text-sm outline-none" placeholder={isMobile?"Search listings":"Search current listings by name or address"} /></label>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {gyms.map((gym) => <article key={gym.id} className="group overflow-hidden rounded-2xl border border-black/10 bg-white transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5">
                    <Link href={`/admin/gyms/${gym.id}`} className="block"><div className="relative h-28 bg-zinc-100 dark:bg-white/10">{gym.coverPhotoUrl && <img src={gym.coverPhotoUrl} alt="" className="h-full w-full object-cover" />}</div>
                    <div className="p-4"><div className="min-w-0"><div className="flex items-center gap-1.5"><p className="truncate font-semibold">{gym.name}</p></div><p className="mt-1 flex items-start gap-1 text-xs text-zinc-500"><MapPin size={13} className="shrink-0" />{gym.address}</p></div><div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide"><span tabIndex={gym.isClaimed?0:undefined} aria-label={gym.isClaimed?`Claimed by ${gym.ownerEmails.join(", ")}`:undefined} onClick={gym.isClaimed?(event)=>{event.preventDefault();event.stopPropagation();setVisibleClaimOwnerGymId(current=>current===gym.id?null:gym.id)}:undefined} onKeyDown={gym.isClaimed?(event)=>{if(event.key!=="Enter"&&event.key!==" ")return;event.preventDefault();event.stopPropagation();setVisibleClaimOwnerGymId(current=>current===gym.id?null:gym.id)}:undefined} className={`group/claim relative rounded-full border px-2 py-1 ${gym.isClaimed?"cursor-help border-[#22c55e]/40 bg-[#22c55e]/10 text-[#16803d] dark:text-[#86efac]":"border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-white/10 dark:bg-white/10 dark:text-white/60"}`}>{gym.isClaimed?"Claimed":"Unclaimed"}{gym.isClaimed&&<span role="tooltip" className={`pointer-events-none absolute bottom-[calc(100%+.45rem)] left-0 z-30 hidden max-w-64 normal-case tracking-normal text-white md:group-hover/claim:block md:group-focus/claim:block ${visibleClaimOwnerGymId===gym.id?"!block":""}`}><span className="block rounded-lg border border-white/10 bg-[#111411] px-3 py-2 text-left text-xs font-semibold shadow-xl">{gym.ownerEmails.join(", ")}</span></span>}</span></div></div></Link>
                    <div className="space-y-2 border-t border-black/5 p-3 dark:border-white/10"><button type="button" disabled={gym.isClaimed} title={gym.isClaimed?"This listing is already claimed.":"Verification link"} data-copied={copiedAction===`verify:${gym.id}`} aria-live="polite" onClick={() => void shareGym(gym)} className={`gym-verification-copy-button flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:opacity-50 dark:disabled:border-white/15 dark:disabled:text-white/35 ${gym.isClaimed?"border-zinc-300 text-zinc-400 dark:border-white/15 dark:text-white/35":copiedAction===`verify:${gym.id}`?"scale-[1.02] border-[#22c55e] bg-[#22c55e] text-black":"border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10"}`}>{copiedAction===`verify:${gym.id}`&&!gym.isClaimed?<span className="flex animate-[copy-confirm_.35s_ease-out] items-center gap-2"><Check size={16} strokeWidth={3}/>Copied!</span>:<span className="flex items-center gap-2"><Share2 size={15}/><Copy size={14}/>Verification link</span>}</button></div>
                </article>)}
                {!loading && gyms.length === 0 && <p className="text-sm text-zinc-500">No gym listings found.</p>}
            </div>
            <div ref={loadMoreMarker} aria-hidden="true" className="h-px" />
            {loading && <div className="flex items-center justify-center gap-2 py-7 text-sm font-semibold text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading gyms…</div>}
            {!loading && total > 0 && !hasMore && <p className="py-6 text-center text-sm text-zinc-500">All {total} gym listings loaded.</p>}
        </section>
    </div>;
}
