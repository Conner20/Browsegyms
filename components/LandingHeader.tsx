'use client';
import BrandIcon from "@/components/BrandIcon";

import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function LandingHeader() {
    const { status } = useSession();
    return (
        <header className="relative z-[1200] border-b bg-white text-[#1c241c] dark:border-white/10 dark:bg-[#0b0d0b] dark:text-white">
            <div className="landing-primary-header-row flex min-h-16 flex-wrap items-center gap-2 px-3 py-2 md:h-16 md:flex-nowrap md:gap-4 md:px-4 md:py-0">

                <BrandIcon />
                {status === 'unauthenticated' && <nav className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
                    <Link
                        href="/log-in"
                        className="px-2 py-2 text-xs font-semibold transition hover:text-[#22c55e] md:px-3 md:text-sm"
                    >
                        Log in
                    </Link>
                    <Link
                        href="/sign-up"
                        className="rounded-full bg-[#22c55e] px-3 py-2 text-xs font-bold text-black md:px-4 md:text-sm"
                    >
                        Sign up
                    </Link>
                </nav>}
            </div>
        </header>
    );
}
