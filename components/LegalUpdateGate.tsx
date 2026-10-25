"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type RequiredUpdate = "terms" | "privacy" | "both" | null;

export default function LegalUpdateGate() {
  const { status } = useSession();
  const pathname = usePathname();
  const [required, setRequired] = useState<RequiredUpdate>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      setRequired(null);
      return;
    }
    let active = true;
    fetch("/api/legal/acknowledgement", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => { if (active) setRequired(data.required ?? null) })
      .catch(() => undefined);
    return () => { active = false };
  }, [status]);

  const visible = required && !pathname.startsWith("/legal/");
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous };
  }, [visible]);

  if (!visible) return null;

  const accept = async () => {
    setAccepting(true);
    setError("");
    const response = await fetch("/api/legal/acknowledgement", { method: "POST" }).catch(() => null);
    setAccepting(false);
    if (!response?.ok) {
      setError("We couldn’t save your acceptance. Please try again.");
      return;
    }
    setRequired(null);
  };

  const title = required === "privacy" ? "We’ve updated our Privacy Policy" : "We’ve updated our Terms";
  return <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="legal-update-title" className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111411] p-6 text-white shadow-2xl sm:p-8">
      <h2 id="legal-update-title" className="text-2xl font-semibold sm:text-3xl">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-white/65">
        {required === "both" ? <>We’ve updated our <Link href="/legal/terms" className="font-bold text-[#22c55e] underline underline-offset-4">Terms of Service</Link> and <Link href="/legal/privacy" className="font-bold text-[#22c55e] underline underline-offset-4">Privacy Policy</Link>.</> : required === "terms" ? <>We’ve updated our <Link href="/legal/terms" className="font-bold text-[#22c55e] underline underline-offset-4">Terms of Service</Link>.</> : <>We’ve updated our <Link href="/legal/privacy" className="font-bold text-[#22c55e] underline underline-offset-4">Privacy Policy</Link>.</>} Please review the changes before continuing to use Browsegyms.
      </p>
      {error && <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
      <button type="button" disabled={accepting} onClick={() => void accept()} className="mt-6 w-full rounded-full border border-[#22c55e] bg-[#22c55e] px-5 py-3 text-sm font-black text-[#111411] transition hover:bg-[#111411] hover:text-[#22c55e] disabled:cursor-wait disabled:opacity-60">{accepting ? "Accepting…" : "Accept"}</button>
    </section>
  </div>;
}
