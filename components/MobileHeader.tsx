'use client';
import BrandIcon from "@/components/BrandIcon";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

type MobileHeaderProps = {
    title: string;
    href?: string;
    subContent?: React.ReactNode;
    leftAccessory?: React.ReactNode;
    rightAccessory?: React.ReactNode;
    titleAlign?: "center" | "left";
    onMobileNavVisibilityChange?: (isOpen: boolean) => void;
};

export default function MobileHeader({
    title,
    href = "/",
    subContent,
    leftAccessory,
    rightAccessory,
    titleAlign = "center",
    onMobileNavVisibilityChange,
}: MobileHeaderProps) {
    const showTitle = title.trim().toLowerCase() !== "browsegyms";
    const [mobileNavOpen, setMobileNavOpen] = useState(true);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let lastY = window.scrollY;
        const SHOW_THRESHOLD = 12;
        const HIDE_THRESHOLD = 8;

        const handleScroll = () => {
            const currentY = window.scrollY;
            const delta = currentY - lastY;

            if (currentY <= 24) {
                setMobileNavOpen(true);
            } else if (delta >= HIDE_THRESHOLD) {
                setMobileNavOpen(false);
            } else if (delta <= -SHOW_THRESHOLD) {
                setMobileNavOpen(true);
            }

            lastY = currentY;
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        onMobileNavVisibilityChange?.(mobileNavOpen);
    }, [mobileNavOpen, onMobileNavVisibilityChange]);

    return (
        <>
            <header className="relative z-20 flex min-h-16 w-full items-center bg-white px-4 py-3 lg:hidden sm:px-6 dark:bg-neutral-900">
                <div
                    className="absolute inset-x-0 top-0 bg-white dark:bg-neutral-900 lg:hidden"
                    style={{ height: 'env(safe-area-inset-top, 0px)' }}
                />
                {leftAccessory && (
                    <div className="absolute left-4">
                        {leftAccessory}
                    </div>
                )}
                {titleAlign === "left" ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        {!showTitle && <BrandIcon href={href} />}
                        {showTitle && <h1 className="min-w-0 flex-1 select-none text-left font-roboto text-2xl tracking-tight text-[#22c55e] sm:text-3xl">
                            <Link href={href} className="block truncate cursor-pointer">
                                <span className="block truncate">{title}</span>
                            </Link>
                        </h1>}
                        <div className="flex shrink-0 items-center gap-2">
                            {rightAccessory}
                        </div>
                    </div>
                ) : (
                    <>
                        {!showTitle && <div className="flex w-full justify-center"><BrandIcon href={href} /></div>}
                        {showTitle && <h1
                            className="w-full select-none truncate px-10 text-center font-roboto text-2xl tracking-tight text-[#22c55e] sm:text-3xl"
                        >
                            <Link href={href} className="cursor-pointer">
                                <span>{title}</span>
                            </Link>
                        </h1>}
                        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
                            {rightAccessory}
                        </div>
                    </>
                )}
            </header>

            {subContent && (
                <div className={clsx("lg:hidden w-full bg-white dark:bg-neutral-900")}>
                    {subContent}
                </div>
            )}

        </>
    );
}
