'use client';

import Link from 'next/link';

export default function LandingFooter() {
    return (
        <footer className="border-t border-white/10 bg-[#090b09]">
            <div className="mx-auto flex flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-white/50 sm:flex-row sm:px-6 lg:max-w-7xl">
                <span>
                    Browse Gyms
                </span>
                <div className="flex flex-wrap items-center justify-center gap-4">
                    <Link href="/legal/terms" className="transition hover:text-[#22c55e]">
                        Terms of Use
                    </Link>
                    <Link href="/legal/privacy" className="transition hover:text-[#22c55e]">
                        Privacy Policy
                    </Link>
                    <Link href="/legal/contact" className="transition hover:text-[#22c55e]">
                        Contact Us
                    </Link>
                </div>
            </div>
        </footer>
    );
}
