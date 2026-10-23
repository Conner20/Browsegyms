"use client";

import { signOut } from "next-auth/react";

export default function ReferralSwitchAccount({ returnTo }: { returnTo: string }) {
  return <button type="button" onClick={() => signOut({ callbackUrl: returnTo })} className="mt-6 rounded-xl bg-[#22c55e] px-5 py-3 font-black text-black">Switch account</button>;
}
