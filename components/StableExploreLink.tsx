"use client";

import Link from "next/link";
import type { ReactNode, SyntheticEvent } from "react";

const MOBILE_GREEN = "#22c55e";
const MOBILE_TEXT = "#111411";

function preserveGreenColors(event: SyntheticEvent<HTMLAnchorElement>) {
    const link = event.currentTarget;
    link.style.setProperty("-webkit-tap-highlight-color", "transparent", "important");
    link.style.setProperty("background", MOBILE_GREEN, "important");
    link.style.setProperty("background-color", MOBILE_GREEN, "important");
    link.style.setProperty("background-image", "none", "important");
    link.style.setProperty("border-color", MOBILE_GREEN, "important");
    link.style.setProperty("color", MOBILE_TEXT, "important");
    link.style.setProperty("-webkit-text-fill-color", MOBILE_TEXT, "important");
    link.style.setProperty("filter", "none", "important");
    link.style.setProperty("opacity", "1", "important");
}

export default function StableExploreLink({ className, href = "/", children = "Explore Browsegyms" }: { className: string; href?: string; children?: ReactNode }) {
    const usesLandingHeaderStates = className.split(/\s+/).includes("landing-gym-listing-button");

    return (
        <Link
            href={href}
            className={className}
            style={usesLandingHeaderStates ? undefined : { backgroundColor: MOBILE_GREEN, color: MOBILE_TEXT }}
            onPointerDownCapture={usesLandingHeaderStates ? undefined : preserveGreenColors}
            onTouchStartCapture={usesLandingHeaderStates ? undefined : preserveGreenColors}
            onMouseDownCapture={usesLandingHeaderStates ? undefined : preserveGreenColors}
            onFocus={usesLandingHeaderStates ? undefined : preserveGreenColors}
            onClickCapture={usesLandingHeaderStates ? undefined : preserveGreenColors}
        >
            {children}
        </Link>
    );
}
