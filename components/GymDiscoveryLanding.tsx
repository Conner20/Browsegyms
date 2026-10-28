"use client";
import { readStoredValue, writeStoredValue, removeStoredValue } from "@/lib/browser-storage";
import BrandIcon from "@/components/BrandIcon";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  ExternalLink,
  LocateFixed,
  Mail,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Menu,
  Navigation,
  Phone,
  Search,
  ShieldCheck,
  SquarePen,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import FacilityLookup from "@/components/FacilityLookup";
import { AMENITY_OPTIONS, EQUIPMENT_OPTIONS } from "@/lib/facility-options";
import {
  MembershipOption,
  annualFeeTimingLabel,
  billingFrequencyLabel,
  cleanMembershipOptions,
  contractLengthLabel,
  effectiveMonthlyPrice,
  lowestMembershipOption,
  membershipMonthlyBreakdown,
} from "@/lib/memberships";
import {
  DayPassOption,
  cleanDayPassOptions,
  dayPassDurationLabel,
  lowestDayPassOption,
} from "@/lib/day-passes";
import ProfileMenu from "@/components/ProfileMenu";
export type LandingGym = {
  id: string;
  name: string;
  isVerified?: boolean;
  area: string;
  address: string;
  distance: number;
  type: string;
  equipment: string[];
  amenities: string[];
  hours: string;
  phone: string;
  contactEmail?: string | null;
  site: string;
  photo: string;
  photoUrls?: string[];
  lat?: number | null;
  lng?: number | null;
  dayPassPrice?: number | null;
  dayPassDetails?: string | null;
  dayPassUrl?: string | null;
  dayPassOptions?: DayPassOption[] | unknown;
  membershipPrice?: number | null;
  membershipDetails?: string | null;
  membershipOptions?: MembershipOption[] | unknown;
};
type Suggestion = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  country?: string;
};
type PricingMode = "dayPass" | "membership";
const GROUPS = {
  "Gym type": [
    "Open",
    "Personal training gym",
    "Group training gym",
    "Specialty gym/studio",
  ],
  Equipment: EQUIPMENT_OPTIONS,
  Amenities: AMENITY_OPTIONS,
};
const money = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`,
  dayPassOptionsFor = (g: LandingGym) => {
    const options = cleanDayPassOptions(g.dayPassOptions);
    return options.length
      ? options
      : g.dayPassPrice != null
        ? [{ id: "legacy-day-pass", price: g.dayPassPrice, durationDays: Math.max(1, Number(g.dayPassDetails) || 1), purchaseUrl: g.dayPassUrl?.trim() || g.site?.trim() || "", access: g.amenities }]
        : [];
  },
  dayPassChoice = (g: LandingGym) => lowestDayPassOption(dayPassOptionsFor(g)),
  membershipOptionsFor = (g: LandingGym) =>
    cleanMembershipOptions(g.membershipOptions),
  membershipChoice = (g: LandingGym) =>
    lowestMembershipOption(membershipOptionsFor(g)),
  cost = (g: LandingGym, mode: PricingMode = "dayPass") =>
    mode === "membership"
      ? membershipChoice(g)
        ? effectiveMonthlyPrice(membershipChoice(g)!)
        : (g.membershipPrice ?? 0)
      : (dayPassChoice(g)?.price ?? g.dayPassPrice ?? 0),
  costText = (g: LandingGym, mode: PricingMode = "dayPass") =>
    cost(g, mode)
      ? money(cost(g, mode))
      : mode === "membership"
        ? "Not listed"
        : "Free";
const miles = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) => {
  const r = 3958.8,
    d = (n: number) => (n * Math.PI) / 180,
    x =
      Math.sin(d(b.lat - a.lat) / 2) ** 2 +
      Math.cos(d(a.lat)) *
        Math.cos(d(b.lat)) *
        Math.sin(d(b.lng - a.lng) / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const dayPassAccess = (value?: string | null) => {
  const raw = value?.trim().toLowerCase() ?? "",
    numeric = Number(raw),
    words: Record<string, number> = {
      single: 1,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
    };
  const days =
    Number.isInteger(numeric) && numeric > 0
      ? numeric
      : (Object.entries(words).find(([word]) => raw.includes(word))?.[1] ?? 1);
  const labels = ["", "Single", "Two", "Three", "Four", "Five", "Six", "Seven"];
  return `${labels[days] || days}-day access`;
};
const gymHoursForDisplay = (value: string) =>
  value.replace(
    /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:AM|PM))/gi,
    (_, hourText: string, minute: string) => {
      const hour = Number(hourText);
      const suffix = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minute} ${suffix}`;
    },
  );
const blockMobileGhostTap = () => {
  const previous = document.getElementById("landing-location-touch-shield");
  previous?.remove();
  const shield = document.createElement("div");
  shield.id = "landing-location-touch-shield";
  shield.setAttribute("aria-hidden", "true");
  Object.assign(shield.style, {
    position: "fixed",
    inset: "0",
    zIndex: "99999",
    background: "transparent",
    pointerEvents: "auto",
    WebkitTapHighlightColor: "transparent",
  });
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  shield.addEventListener("click", swallow, true);
  shield.addEventListener("pointerdown", swallow, true);
  shield.addEventListener("pointerup", swallow, true);
  document.body.appendChild(shield);
  window.setTimeout(() => shield.remove(), 500);
};
const dismissMobileKeyboard = () => {
  if (window.innerWidth >= 768) return;
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  )
    active.blur();
};
const createBrowserId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  return `visitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};
const lookupCity = async (lat: number, lng: number) => {
  try {
    const response = await fetch(
      `/api/landing-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      city?: string;
      state?: string;
      country?: string;
    };
    return data.city
      ? {
          city: data.city,
          state: data.state || "",
          country: data.country || "",
        }
      : null;
  } catch {
    return null;
  }
};
export default function GymDiscoveryLanding({
  initiallySignedIn = false,
  isAdmin = false,
  managedGymId = null,
}: {
  initiallySignedIn?: boolean;
  isAdmin?: boolean;
  managedGymId?: string | null;
}) {
  const { status } = useSession(),
    signedIn =
      status === "authenticated" ||
      (status === "loading" && initiallySignedIn);
  const [all, setAll] = useState<LandingGym[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [compare, setCompare] = useState<string[]>([]),
    [compareMode, setCompareMode] = useState(false),
    [filterOpen, setFilterOpen] = useState(false),
    [mobile, setMobile] = useState<"list" | "map">("list"),
    [isPhoneViewport, setIsPhoneViewport] = useState(false),
    [query, setQuery] = useState(""),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [locationMenuOpen, setLocationMenuOpen] = useState(false),
    [locationLoading, setLocationLoading] = useState(false),
    [locationConsentOpen, setLocationConsentOpen] = useState(false),
    [location, setLocation] = useState("Washington, DC"),
    [origin, setOrigin] = useState({ lat: 38.9072, lng: -77.0369 }),
    [radius, setRadius] = useState(25),
    [limit, setLimit] = useState(250),
    [filters, setFilters] = useState<string[]>([]),
    [equipmentFilters, setEquipmentFilters] = useState<string[]>([]),
    [amenityFilters, setAmenityFilters] = useState<string[]>([]),
    [sort, setSort] = useState<"distance" | "price">("distance"),
    [pricingMode, setPricingMode] = useState<PricingMode>("dayPass"),
    [favorites, setFavorites] = useState<string[]>([]),
    [favoritesOnly, setFavoritesOnly] = useState(false),
    [visibleGymCount, setVisibleGymCount] = useState(9),
    [listWidth, setListWidth] = useState(510),
    [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(
      null,
    ),
    [profileWidths, setProfileWidths] = useState<Record<string, number>>({}),
    [defaultProfileWidth, setDefaultProfileWidth] = useState(390),
    [dayPassPrompt, setDayPassPrompt] = useState<{
      gym: LandingGym;
      intent: PricingMode;
      optionId?: string;
    } | null>(null),
    [purchaseConfirmation, setPurchaseConfirmation] = useState<{
      gymId: string;
      gymName: string;
      intent: PricingMode;
    } | null>(null),
    [showSwipeHint, setShowSwipeHint] = useState(false);
  const visitor = useRef(""),
    visit = useRef(""),
    started = useRef(0),
    searchOverride = useRef(false),
    preCompareSelected = useRef<string | null>(null),
    listRef = useRef<HTMLDivElement>(null),
    listLoadMoreRef = useRef<HTMLDivElement>(null);
  const track = (eventType: string, data: Record<string, unknown> = {}) =>
    visitor.current &&
    fetch("/api/analytics/landing-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        visitorId: visitor.current,
        visitId: visit.current,
        ...data,
      }),
      keepalive: true,
    }).catch(() => {});
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhoneViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!filterOpen) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      rootOverflow: root.style.overflow,
    };

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [filterOpen]);
  useEffect(() => {
    let cancelled = false,
      recorded = false;
    if (
      readStoredValue(localStorage, "browsegyms_location_consent") !== "true" ||
      !navigator.geolocation
    )
      return;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserCoords(coords);
        if (!searchOverride.current) {
          setOrigin(coords);
          setLocation("Current location");
          window.dispatchEvent(
            new CustomEvent("landing_location_changed", { detail: coords }),
          );
          if (!recorded) {
            recorded = true;
            const place = await lookupCity(coords.lat, coords.lng);
            track("LOCATION_USED", {
              metadata: { source: "automatic", ...place },
            });
          }
        }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);
  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(
      "main>section>aside:first-child",
    );
    if (!panel) return;
    const down = (event: PointerEvent) => {
      if (
        window.innerWidth < 768 ||
        panel.getBoundingClientRect().right - event.clientX > 12
      )
        return;
      event.preventDefault();
      const startX = event.clientX,
        startWidth = panel.getBoundingClientRect().width;
      document.body.classList.add("resizing-gym-list");
      const move = (moveEvent: PointerEvent) =>
        setListWidth(
          Math.max(
            460,
            Math.min(
              720,
              window.innerWidth * 0.7,
              startWidth + moveEvent.clientX - startX,
            ),
          ),
        );
      const up = () => {
        document.body.classList.remove("resizing-gym-list");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    panel.addEventListener("pointerdown", down);
    return () => panel.removeEventListener("pointerdown", down);
  }, []);
  useEffect(() => {
    visitor.current =
      readStoredValue(localStorage, "browsegyms_visitor_id") || createBrowserId();
    writeStoredValue(localStorage, "browsegyms_visitor_id", visitor.current);
    visit.current = createBrowserId();
    writeStoredValue(sessionStorage, "browsegyms_visit_id", visit.current);
    started.current = Date.now();
    track("VISIT", { metadata: { referrer: document.referrer || null } });
    const end = () =>
      navigator.sendBeacon?.(
        "/api/analytics/landing-event",
        new Blob(
          [
            JSON.stringify({
              eventType: "TIME_SPENT",
              visitorId: visitor.current,
              visitId: visit.current,
              durationMs: Date.now() - started.current,
            }),
          ],
          { type: "application/json" },
        ),
      );
    addEventListener("pagehide", end);
    return () => removeEventListener("pagehide", end);
  }, []);
  useEffect(() => {
    fetch("/api/landing-gyms", { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => setAll(x.gyms ?? []));
  }, []);
  useEffect(() => {
    if (status === "loading") return;
    if (signedIn)
      fetch("/api/gym-favorites")
        .then((r) => r.json())
        .then((x) => setFavorites(x.gymIds ?? []));
    else
      try {
        setFavorites(
          JSON.parse(readStoredValue(localStorage, "browsegyms_favorite_gyms") || "[]"),
        );
      } catch {}
  }, [signedIn, status]);
  useEffect(() => {
    if (compareMode) track("COMPARE_OPENED");
  }, [compareMode]);
  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setLocationLoading(false);
      return;
    }
    let cancelled = false;
    setLocationLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/landing-geocode?q=${encodeURIComponent(query)}`)
        .then((response) => response.json())
        .then((result) => {
          if (!cancelled) setSuggestions(result.results ?? []);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLocationLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    const referenceLocation = searchOverride.current ? origin : null;
    window.dispatchEvent(
      new CustomEvent("landing_reference_location_changed", {
        detail: referenceLocation,
      }),
    );
  }, [origin.lat, origin.lng, location]);
  useEffect(() => {
    if (!signedIn) return;
    const showPending = () => {
      if (document.visibilityState !== "visible") return;
      for (const intent of ["dayPass", "membership"] as const) {
        const key = `browsegyms_pending_${intent === "membership" ? "membership" : "day_pass"}_confirmation`;
        try {
          const raw = readStoredValue(localStorage, key);
          if (!raw) continue;
          const pending = JSON.parse(raw) as {
            gymId?: string;
            gymName?: string;
            openedAt?: number;
          };
          if (
            !pending.gymId ||
            Date.now() - Number(pending.openedAt || 0) < 750
          )
            continue;
          const gymName =
            pending.gymName ||
            all.find((gym) => gym.id === pending.gymId)?.name ||
            "this gym";
          setPurchaseConfirmation({ gymId: pending.gymId, gymName, intent });
          break;
        } catch {
          removeStoredValue(localStorage, key);
        }
      }
    };
    window.addEventListener("focus", showPending);
    document.addEventListener("visibilitychange", showPending);
    const timer = window.setTimeout(showPending, 1000);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", showPending);
      document.removeEventListener("visibilitychange", showPending);
    };
  }, [signedIn, all]);
  useEffect(() => {
    const handle = (event: Event) => {
      const { gym, destination, optionId, optionName, price } = (
        event as CustomEvent<{
          gym: LandingGym;
          destination: string;
          optionId: string;
          optionName: string;
          price: number;
        }>
      ).detail;
      const clickedAt = new Date().toISOString();
      track("MEMBERSHIP_CLICKED", {
        gymId: gym.id,
        metadata: { optionId, optionName, price, url: destination, clickedAt },
      });
      writeStoredValue(localStorage, "browsegyms_membership_clicked_at", clickedAt);
      if (!signedIn) {
        setDayPassPrompt({ gym, intent: "membership", optionId });
        return;
      }
      writeStoredValue(localStorage,
        "browsegyms_pending_membership_confirmation",
        JSON.stringify({
          gymId: gym.id,
          gymName: gym.name,
          openedAt: Date.now(),
        }),
      );
      const external = window.open(
        destination,
        "_blank",
        "noopener,noreferrer",
      );
      external?.focus();
    };
    window.addEventListener("landing_membership_claim", handle);
    return () => window.removeEventListener("landing_membership_claim", handle);
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    (async () => {
      let local: string[] = [];
      try {
        local = JSON.parse(
          readStoredValue(localStorage, "browsegyms_favorite_gyms") || "[]",
        );
      } catch {}
      const response = await fetch("/api/gym-favorites", { cache: "no-store" });
      if (!response.ok) return;
      const remote: string[] = (await response.json()).gymIds ?? [],
        merged = [...new Set([...remote, ...local])];
      await Promise.all(
        local
          .filter((id) => !remote.includes(id))
          .map((gymId) =>
            fetch("/api/gym-favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ gymId }),
            }),
          ),
      );
      if (active) {
        setFavorites(merged);
        removeStoredValue(localStorage, "browsegyms_favorite_gyms");
      }
    })();
    return () => {
      active = false;
    };
  }, [signedIn]);
  const pricedGyms = useMemo(
      () =>
        all.filter(
          (g) =>
            pricingMode === "dayPass" ||
            (membershipOptionsFor(g).length > 0 && cost(g, pricingMode) > 0),
        ),
      [all, pricingMode],
    ),
    maxDistance = useMemo(
      () =>
        Number(
          Math.max(
            0,
            ...pricedGyms.map((g) =>
              g.lat != null && g.lng != null
                ? miles(origin, { lat: g.lat, lng: g.lng })
                : (g.distance ?? 0),
            ),
          ).toFixed(1),
        ),
      [origin, pricedGyms],
    ),
    maxPrice = useMemo(
      () =>
        Math.ceil(Math.max(0, ...pricedGyms.map((g) => cost(g, pricingMode)))),
      [pricedGyms, pricingMode],
    );
  useEffect(() => {
    if (all.length) setLimit(maxPrice);
  }, [all.length, maxPrice, pricingMode]);
  useEffect(() => {
    if (all.length) setRadius(maxDistance);
  }, [all.length, maxDistance]);
  const gyms = useMemo(
    () =>
      all
        .map((g) => ({
          ...g,
          distance:
            g.lat != null && g.lng != null
              ? Number(miles(origin, { lat: g.lat, lng: g.lng }).toFixed(1))
              : (g.distance ?? 0),
        }))
        .filter(
          (g) =>
            (pricingMode !== "membership" ||
              (membershipOptionsFor(g).length > 0 &&
                cost(g, pricingMode) > 0)) &&
            (!favoritesOnly || favorites.includes(g.id)) &&
            g.distance <= radius &&
            cost(g, pricingMode) <= limit &&
            (filters.filter((f) => GROUPS["Gym type"].includes(f)).length ===
              0 ||
              filters
                .filter((f) => GROUPS["Gym type"].includes(f))
                .some((f) => g.type.toLowerCase() === f.toLowerCase())) &&
            equipmentFilters.every((filter) => g.equipment.some(value => value.toLowerCase().includes(filter.toLowerCase()))) &&
            amenityFilters.every((filter) => g.amenities.some(value => value.toLowerCase().includes(filter.toLowerCase()))),
        )
        .sort((a, b) =>
          sort === "price"
            ? cost(a, pricingMode) - cost(b, pricingMode)
            : a.distance - b.distance,
        ),
    [
      all,
      favorites,
      favoritesOnly,
      filters,
      equipmentFilters,
      amenityFilters,
      limit,
      origin,
      pricingMode,
      radius,
      sort,
    ],
  );
  const visibleGyms = gyms.slice(0, visibleGymCount);
  useEffect(() => {
    setVisibleGymCount(9);
    listRef.current?.scrollTo({ top: 0 });
  }, [amenityFilters, equipmentFilters, favoritesOnly, filters, limit, origin, pricingMode, radius, sort]);
  useEffect(() => {
    const root = listRef.current,
      target = listLoadMoreRef.current;
    if (!root || !target || visibleGymCount >= gyms.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting)
          setVisibleGymCount((current) => Math.min(current + 9, gyms.length));
      },
      { root, rootMargin: "250px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [gyms.length, visibleGymCount]);
  const choose = (p: Suggestion) => {
    dismissMobileKeyboard();
    searchOverride.current = true;
    setOrigin({ lat: p.lat, lng: p.lng });
    setLocation(p.label);
    setQuery("");
    setSuggestions([]);
    setLocationMenuOpen(false);
    window.dispatchEvent(
      new CustomEvent("landing_location_changed", {
        detail: { lat: p.lat, lng: p.lng },
      }),
    );
    track("LOCATION_SEARCHED", {
      metadata: {
        location: p.label,
        city: p.city || "",
        state: p.state || "",
        country: p.country || "",
      },
    });
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    if (suggestions[0]) choose(suggestions[0]);
  };
  const requestCurrentLocation = (
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (window.innerWidth < 768) {
      const icon = event?.currentTarget.querySelector("svg");
      icon?.classList.remove("location-icon-spinning");
      if (icon) {
        void icon.getBoundingClientRect();
        icon.classList.add("location-icon-spinning");
        window.setTimeout(
          () => icon.classList.remove("location-icon-spinning"),
          700,
        );
      }
    }
    navigator.geolocation?.getCurrentPosition(
      async (p) => {
        searchOverride.current = false;
        const coords = { lat: p.coords.latitude, lng: p.coords.longitude };
        setUserCoords(coords);
        setOrigin(coords);
        setLocation("Current location");
        window.dispatchEvent(
          new CustomEvent("landing_location_changed", { detail: coords }),
        );
        const place = await lookupCity(coords.lat, coords.lng);
        track("LOCATION_USED", { metadata: { source: "manual", ...place } });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };
  const locate = (event?: React.MouseEvent<HTMLButtonElement>) => {
    dismissMobileKeyboard();
    setLocationMenuOpen(false);
    if (readStoredValue(localStorage, "browsegyms_location_consent") === "true") {
      requestCurrentLocation(event);
      return;
    }
    setLocationConsentOpen(true);
  };
  const favorite = async (id: string) => {
    const removing = favorites.includes(id),
      next = removing ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    track(removing ? "FAVORITE_REMOVED" : "FAVORITE_ADDED", { gymId: id });
    if (!signedIn) {
      writeStoredValue(localStorage, "browsegyms_favorite_gyms", JSON.stringify(next));
      return;
    }
    const r = await fetch("/api/gym-favorites", {
      method: removing ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gymId: id }),
    });
    if (!r.ok) setFavorites(favorites);
  };
  const toggleCompare = (g: LandingGym) => {
    const remove = compare.includes(g.id),
      next = remove
        ? compare.filter((x) => x !== g.id)
        : compare.length < 4
          ? [...compare, g.id]
          : compare;
    track(remove ? "COMPARE_REMOVED" : "COMPARE_ADDED", { gymId: g.id });
    setCompare(next);
    setSelected(remove ? (next.at(-1) ?? null) : g.id);
  };
  const claim = (g: LandingGym, option?: DayPassOption) => {
    const selectedOption = option ?? (dayPassOptionsFor(g).length === 1 ? dayPassOptionsFor(g)[0] : null);
    if (dayPassOptionsFor(g).length > 1 && !selectedOption) return;
    const rawDestination = selectedOption?.purchaseUrl?.trim() || dayPassOptionsFor(g)[0]?.purchaseUrl?.trim() || g.dayPassUrl?.trim() || g.site?.trim() || "",
      destination = rawDestination
        ? /^https?:\/\//i.test(rawDestination)
          ? rawDestination
          : `https://${rawDestination}`
        : null,
      clickedAt = new Date().toISOString();
    track("DAY_PASS_CLICKED", {
      gymId: g.id,
      metadata: { optionId: selectedOption?.id, durationDays: selectedOption?.durationDays, price: selectedOption?.price ?? cost(g, "dayPass"), url: destination, clickedAt },
    });
    writeStoredValue(localStorage, "browsegyms_day_pass_clicked_at", clickedAt);
    if (signedIn) {
      if (destination) {
        writeStoredValue(localStorage,
          "browsegyms_pending_day_pass_confirmation",
          JSON.stringify({
            gymId: g.id,
            gymName: g.name,
            openedAt: Date.now(),
          }),
        );
        const external = window.open(
          destination,
          "_blank",
          "noopener,noreferrer",
        );
        external?.focus();
      }
      return;
    }
    setDayPassPrompt({ gym: g, intent: "dayPass", optionId: selectedOption?.id });
  };
  const chosen = gyms.find((g) => g.id === selected);
  const panels = compare.length
    ? compare
        .map((id) => gyms.find((g) => g.id === id))
        .filter((g): g is LandingGym => Boolean(g))
    : chosen
      ? [chosen]
      : [];
  const selectedGymIndex = selected
      ? gyms.findIndex((gym) => gym.id === selected)
      : -1,
    mobileCarouselPanels =
      selectedGymIndex >= 0
        ? [...gyms.slice(selectedGymIndex), ...gyms.slice(0, selectedGymIndex)]
        : [];
  const showSwipeTutorial = () => {
    if (window.innerWidth >= 768) return;
    try {
      if (
        readStoredValue(localStorage, "browsegyms_profile_swipe_compare_seen_v2") ===
        "true"
      )
        return;
    } catch {}
    setShowSwipeHint(true);
  };
  const dismissSwipeTutorial = () => {
    if (!showSwipeHint) return;
    try {
      writeStoredValue(localStorage, "browsegyms_profile_swipe_compare_seen_v2", "true");
    } catch {}
    setShowSwipeHint(false);
  };
  const changePricingMode = () => {
    const next: PricingMode =
        pricingMode === "dayPass" ? "membership" : "dayPass",
      eligible = all.filter(
        (g) =>
          next === "dayPass" ||
          (membershipOptionsFor(g).length > 0 && cost(g, next) > 0),
      );
    setPricingMode(next);
    setLimit(Math.ceil(Math.max(0, ...eligible.map((g) => cost(g, next)))));
    setRadius(
      Number(
        Math.max(
          0,
          ...eligible.map((g) =>
            g.lat != null && g.lng != null
              ? miles(origin, { lat: g.lat, lng: g.lng })
              : (g.distance ?? 0),
          ),
        ).toFixed(1),
      ),
    );
  };
  return (
    <main
      style={{ "--gym-list-width": `${listWidth}px` } as React.CSSProperties}
      className="gym-discovery-page min-h-[100dvh] bg-[#f7f7f4] text-[#1c241c] dark:bg-[#070907] dark:text-white"
    >
      <header className="relative z-[1200] border-b bg-white dark:border-white/10 dark:bg-[#0b0d0b]">
        <div className="flex min-h-16 flex-nowrap items-center gap-2 px-3 py-2 md:h-16 md:gap-4 md:px-4 md:py-0">
          <BrandIcon />
          <form
            onSubmit={search}
            onFocus={() => setLocationMenuOpen(true)}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setLocationMenuOpen(false);
            }}
            role="search"
            className="landing-location-search relative z-[1300] mx-auto flex h-10 min-w-0 flex-1 basis-auto items-center rounded-xl border border-zinc-300 bg-white shadow-sm transition-colors focus-within:border-zinc-400 md:order-none md:max-w-[720px] dark:border-white/15 dark:bg-[#111411] dark:focus-within:border-white/30"
          >
            <Search className="ml-4 h-4 w-4 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setLocationMenuOpen(true)}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
              placeholder="Search by location"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                }}
                aria-label="Clear location search"
                className="landing-search-clear mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-500 transition hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {locationMenuOpen && (
              <div className="absolute inset-x-0 top-12 z-[1400] rounded-2xl border border-white/10 bg-[#111411] p-1 text-white shadow-2xl">
                <button
                  type="button"
                  onPointerDown={(event) => {
                    if (event.pointerType !== "mouse") {
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.dataset.touchPending = "true";
                    }
                  }}
                  onPointerUp={(event) => {
                    if (event.pointerType !== "mouse") {
                      event.preventDefault();
                      event.stopPropagation();
                      const button = event.currentTarget;
                      blockMobileGhostTap();
                      window.setTimeout(() => {
                        delete button.dataset.touchPending;
                        locate();
                      }, 50);
                    }
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.currentTarget.dataset.touchPending === "true")
                      return;
                    locate(event);
                  }}
                  className="flex w-full touch-manipulation items-center gap-2 rounded-xl p-3 text-left text-sm font-bold transition hover:bg-white/10"
                >
                  <LocateFixed className="h-4 w-4 shrink-0 text-[#22c55e]" />
                  Use my location
                </button>
                {query.trim().length >= 3 && (
                  <div className="mt-1 border-t border-white/10 pt-1">
                    {locationLoading ? (
                      <div
                        className="flex h-12 items-center justify-center"
                        aria-label="Loading locations"
                      >
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#22c55e]" />
                      </div>
                    ) : suggestions.length ? (
                      suggestions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onPointerDown={(event) => {
                            if (event.pointerType !== "mouse") {
                              event.preventDefault();
                              event.stopPropagation();
                              event.currentTarget.dataset.touchPending = "true";
                            }
                          }}
                          onPointerUp={(event) => {
                            if (event.pointerType !== "mouse") {
                              event.preventDefault();
                              event.stopPropagation();
                              const button = event.currentTarget;
                              blockMobileGhostTap();
                              window.setTimeout(() => {
                                delete button.dataset.touchPending;
                                choose(p);
                              }, 50);
                            }
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (
                              event.currentTarget.dataset.touchPending ===
                              "true"
                            )
                              return;
                            choose(p);
                          }}
                          className="flex w-full touch-manipulation items-start gap-2 rounded-xl p-3 text-left text-sm transition hover:bg-white/10"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]" />
                          <span>{p.label}</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-sm text-white/50">
                        No locations found
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
          {!signedIn && (
            <nav className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
              <Link
                href="/log-in"
                className="landing-auth-login filter-pill landing-toolbar-button"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="landing-auth-signup filter-pill landing-toolbar-button"
              >
                Sign up
              </Link>
            </nav>
          )}
        </div>
        <div className="landing-action-row flex h-[58px] flex-nowrap items-center gap-3 overflow-x-auto border-t px-4 dark:border-white/10">
          {managedGymId && (
            <button
              type="button"
              onClick={() => window.location.assign("/gym-listing/edit")}
              className="filter-pill landing-toolbar-button landing-action-listing"
            >
              <SquarePen className="h-4 w-4" />
              <span className="landing-action-label landing-listing-label">
                My Listing
              </span>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => window.location.assign("/admin")}
              className="filter-pill landing-toolbar-button landing-action-admin"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="landing-action-label landing-admin-label">
                Admin
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`filter-pill landing-toolbar-button landing-action-favorites ${favoritesOnly ? "!border-[#22c55e] !bg-[#22c55e] !text-black" : ""}`}
          >
            <Star
              className={`h-4 w-4 ${favoritesOnly ? "fill-current" : ""}`}
            />
            <span className="landing-action-label landing-favorites-label">
              Favorites
            </span>
          </button>
          <button
            onClick={() => {
              setFilterOpen(true);
              track("FILTER_OPENED");
            }}
            className={`filter-pill landing-toolbar-button landing-action-filters ${filters.length > 0 || radius < maxDistance || limit < maxPrice ? "!border-[#22c55e] !bg-[#22c55e] !text-black" : ""}`}
          >
            <SlidersHorizontal />
            <span className="landing-action-label landing-filters-label">
              Filters
            </span>
          </button>
          <span className="landing-toolbar-description whitespace-nowrap text-xs text-zinc-500">
            Distance · Price · Gym type · Equipment · Amenities
          </span>
          {!signedIn && (
            <nav className="ml-auto flex shrink-0 items-center gap-1 md:hidden">
              <button
                type="button"
                onClick={() => window.location.assign("/log-in")}
                id="landing-mobile-login"
                className="landing-mobile-auth-button"
                style={{ background: "transparent" }}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/sign-up")}
                id="landing-mobile-signup"
                className="landing-mobile-auth-button"
                style={{ background: "#22c55e", color: "#111411" }}
              >
                Sign up
              </button>
            </nav>
          )}
          {signedIn && <ProfileMenu labeled className="ml-auto" />}
        </div>
      </header>
      <section
        data-mobile-view={mobile}
        className="relative flex h-[calc(100dvh-122px)] overflow-hidden"
      >
        <aside
          className={`landing-mobile-list-pane ${mobile === "map" ? "hidden" : "flex"} w-full flex-col border-r md:flex md:w-[510px] dark:border-white/10`}
        >
          <div className="flex items-start justify-between gap-3 p-4">
            <div>
              <h1 className="text-xl font-black md:text-2xl">
                {compareMode
                  ? `${compare.length} Selected`
                  : "Browse nearby gyms"}
              </h1>
              <p className="text-xs text-zinc-500">
                Near {location} · {gyms.length} results
              </p>
            </div>
            {!isPhoneViewport && (
              <button
                onClick={() => {
                  if (compareMode) {
                    setCompare([]);
                    setCompareMode(false);
                    setSelected(preCompareSelected.current);
                  } else {
                    preCompareSelected.current = selected;
                    if (selected) {
                      setCompare((current) =>
                        current.includes(selected)
                          ? current
                          : [selected, ...current].slice(0, 4),
                      );
                      track("COMPARE_ADDED", {
                        gymId: selected,
                        metadata: { source: "selected_gym" },
                      });
                    }
                    setCompareMode(true);
                  }
                }}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition hover:-translate-y-0.5 ${compareMode ? "border-[#22c55e] bg-[#22c55e] text-black shadow-[0_5px_18px_rgba(34,197,94,.25)]" : "border-[#22c55e] bg-[#22c55e] text-black"}`}
              >
                {compareMode ? "Done" : "Compare"}
              </button>
            )}
          </div>
          <div className="landing-mobile-sort-row scrollbar-slim flex items-center gap-2 overflow-x-auto px-4 pb-4 text-xs text-zinc-500">
            <span>Sort by</span>
            <div
              onClickCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const next = sort === "distance" ? "price" : "distance";
                setSort(next);
                track("SORT_CHANGED", { metadata: { sort: next } });
              }}
              className="landing-sort-switch inline-flex rounded-full border border-black/10 bg-white p-1 shadow-sm dark:border-white/15 dark:bg-[#111411]"
            >
              <button
                type="button"
                onClick={() => {
                  setSort("distance");
                  track("SORT_CHANGED", { metadata: { sort: "distance" } });
                }}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 font-bold transition ${sort === "distance" ? "bg-[#22c55e] text-black" : "text-zinc-500 hover:text-black dark:text-white/55 dark:hover:text-white"}`}
              >
                Distance
              </button>
              <button
                type="button"
                onClick={() => {
                  setSort("price");
                  track("SORT_CHANGED", { metadata: { sort: "price" } });
                }}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 font-bold transition ${sort === "price" ? "bg-[#22c55e] text-black" : "text-zinc-500 hover:text-black dark:text-white/55 dark:hover:text-white"}`}
              >
                Price
              </button>
            </div>
            <div
              onClickCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                changePricingMode();
              }}
              className="landing-pricing-switch ml-auto inline-flex rounded-full border border-black/10 bg-white p-1 shadow-sm dark:border-white/15 dark:bg-[#111411]"
            >
              <button
                type="button"
                onClick={() => setPricingMode("dayPass")}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 font-bold transition ${pricingMode === "dayPass" ? "bg-[#22c55e] text-black" : "text-zinc-500 dark:text-white/55"}`}
              >
                Day Pass
              </button>
              <button
                type="button"
                onClick={() => setPricingMode("membership")}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 font-bold transition ${pricingMode === "membership" ? "bg-[#22c55e] text-black" : "text-zinc-500 dark:text-white/55"}`}
              >
                Membership
              </button>
            </div>
          </div>
          <div
            ref={listRef}
            className="scrollbar-slim flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-1"
          >
            {visibleGyms.map((g) => (
              <Card
                key={g.id}
                gym={g}
                pricingMode={pricingMode}
                active={
                  !isPhoneViewport && panels.some((panel) => panel.id === g.id)
                }
                compared={compare.includes(g.id)}
                compareMode={compareMode}
                select={() =>
                  compareMode
                    ? toggleCompare(g)
                    : (setCompare([]),
                      setSelected(selected === g.id ? null : g.id),
                      selected !== g.id &&
                        (showSwipeTutorial(),
                        track("GYM_OPENED", { gymId: g.id }),
                        false))
                }
                showFavorite
                favorited={favorites.includes(g.id)}
                toggleFavorite={() => favorite(g.id)}
              />
            ))}
            {!gyms.length && (
              <div className="rounded-2xl border p-8 text-center">
                <Dumbbell className="mx-auto" />
                <b>No exact matches</b>
              </div>
            )}
            {visibleGymCount < gyms.length && (
              <div
                ref={listLoadMoreRef}
                aria-hidden="true"
                className="flex h-12 items-center justify-center text-xs font-semibold text-zinc-500"
              >
                Loading more gyms…
              </div>
            )}
          </div>
        </aside>
        <div
          className={`landing-mobile-map-pane ${mobile === "list" ? "hidden" : "block"} relative flex-1 md:block`}
        >
          <GymMap
            visible={!isPhoneViewport || mobile === "map"}
            pricingMode={pricingMode}
            gyms={gyms}
            selectedIds={panels.map((panel) => panel.id)}
            favorites={favorites}
            userCoords={userCoords}
            center={origin}
            select={(id) => {
              if (id === null) {
                setSelected(null);
                setCompare([]);
                setCompareMode(false);
                return;
              }
              const gym = gyms.find((item) => item.id === id);
              if (compareMode && gym) {
                toggleCompare(gym);
                return;
              }
              setCompare([]);
              if (selected === id) {
                setSelected(null);
                return;
              }
              setSelected(id);
              track("GYM_OPENED", { gymId: id, metadata: { source: "map" } });
            }}
          />
          <ProfileTray
            pricingMode={pricingMode}
            panels={
              isPhoneViewport && !compareMode ? mobileCarouselPanels : panels
            }
            widths={profileWidths}
            defaultWidth={defaultProfileWidth}
            resize={(id, width) =>
              setProfileWidths((current) => ({ ...current, [id]: width }))
            }
            closeGym={(gym) => {
              setCompare((current) => current.filter((id) => id !== gym.id));
              if (isPhoneViewport || selected === gym.id) setSelected(null);
            }}
            pass={claim}
            website={(gym) =>
              track("WEBSITE_CLICKED", {
                gymId: gym.id,
                metadata: { url: gym.site },
              })
            }
            directions={(gym) =>
              track("DIRECTIONS_CLICKED", {
                gymId: gym.id,
                metadata: { address: gym.address },
              })
            }
            favorites={favorites}
            toggleFavorite={favorite}
            swipeHint={showSwipeHint}
            onSwipeHintDismiss={dismissSwipeTutorial}
          />
        </div>
        {mobile === "list" && (
          <div
            onClick={() => {
              setSelected(null);
              setCompare([]);
            }}
            className={`mobile-list-profile-overlay absolute inset-0 z-[1000] md:hidden ${panels.length ? "pointer-events-auto" : "pointer-events-none"}`}
          >
            <ProfileTray
              pricingMode={pricingMode}
              panels={
                isPhoneViewport && !compareMode ? mobileCarouselPanels : panels
              }
              widths={profileWidths}
              defaultWidth={defaultProfileWidth}
              resize={(id, width) =>
                setProfileWidths((current) => ({ ...current, [id]: width }))
              }
              closeGym={(gym) => {
                setCompare((current) => current.filter((id) => id !== gym.id));
                if (isPhoneViewport || selected === gym.id) setSelected(null);
              }}
              pass={claim}
              website={(gym) =>
                track("WEBSITE_CLICKED", {
                  gymId: gym.id,
                  metadata: { url: gym.site },
                })
              }
              directions={(gym) =>
                track("DIRECTIONS_CLICKED", {
                  gymId: gym.id,
                  metadata: { address: gym.address },
                })
              }
              favorites={favorites}
              toggleFavorite={favorite}
              swipeHint={showSwipeHint}
              onSwipeHintDismiss={dismissSwipeTutorial}
            />
          </div>
        )}
        <div className="landing-mobile-view-toggle absolute bottom-5 left-1/2 z-[1500] h-11 w-20 -translate-x-1/2 rounded-full bg-[#22c55e] md:hidden">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMobile((current) => (current === "list" ? "map" : "list"));
            }}
            className="landing-mobile-view-toggle-button flex h-full w-full items-center justify-center rounded-full bg-transparent px-3 text-sm font-black text-black"
          >
            {mobile === "list" ? (
              <>
                <MapIcon className="mr-1 inline" />
                Map
              </>
            ) : (
              <>
                <Menu className="mr-1 inline" />
                List
              </>
            )}
          </button>
        </div>
      </section>
      <footer className="flex h-8 shrink-0 items-center justify-center gap-4 border-t border-black/10 bg-white px-3 text-[11px] font-semibold text-zinc-500 dark:border-white/10 dark:bg-[#090b09] dark:text-white/50">
        <Link
          href="/legal/terms"
          className="whitespace-nowrap transition hover:text-[#22c55e]"
        >
          Terms of Use
        </Link>
        <Link
          href="/legal/privacy"
          className="whitespace-nowrap transition hover:text-[#22c55e]"
        >
          Privacy Policy
        </Link>
        <Link
          href="/legal/contact"
          className="whitespace-nowrap transition hover:text-[#22c55e]"
        >
          Contact Us
        </Link>
      </footer>
      {locationConsentOpen && (
        <Shell close={() => setLocationConsentOpen(false)} slideUp>
          <div className="p-7 text-center text-white">
            <h2 className="text-2xl font-black">Allow Location Access?</h2>
            <div className="mx-auto mt-3 max-w-xl space-y-3 text-sm leading-6 text-white/60">
              <p>
                Browse Gyms uses your precise location to show you nearby matches
                and improve recommendations.
              </p>
              <p>
                By selecting &quot;Agree,&quot; you consent to Browse Gyms&apos;s
                collection and use of your precise location as described in our{" "}
                <Link
                  href="/legal/terms"
                  className="whitespace-nowrap font-semibold text-[#22c55e] underline underline-offset-2"
                >
                  Terms of Use
                </Link>{" "}
                and{" "}
                <Link
                  href="/legal/privacy"
                  className="whitespace-nowrap font-semibold text-[#22c55e] underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLocationConsentOpen(false)}
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-black text-white transition hover:border-white"
              >
                Disagree
              </button>
              <button
                type="button"
                onClick={() => {
                  writeStoredValue(localStorage, "browsegyms_location_consent", "true");
                  setLocationConsentOpen(false);
                  requestCurrentLocation();
                }}
                className="rounded-full border border-[#22c55e] bg-[#22c55e] px-5 py-3 text-sm font-black text-black transition hover:bg-[#19a94e]"
              >
                Agree
              </button>
            </div>
          </div>
        </Shell>
      )}
      {filterOpen && (
        <Filters
          pricingMode={pricingMode}
          radius={radius}
          limit={limit}
          maxRadius={maxDistance}
          maxLimit={maxPrice}
          resultCount={gyms.length}
          setRadius={setRadius}
          setLimit={setLimit}
          filters={filters}
          equipmentFilters={equipmentFilters}
          amenityFilters={amenityFilters}
          toggle={(f) => setFilters((a) => a.includes(f) ? a.filter((x) => x !== f) : [...a, f])}
          setEquipmentFilters={setEquipmentFilters}
          setAmenityFilters={setAmenityFilters}
          close={() => setFilterOpen(false)}
          apply={() => {
            track("FILTER_APPLIED", { metadata: {
              ...(radius < maxDistance ? { distance: radius } : {}),
              ...(limit < maxPrice ? pricingMode === "membership" ? { membershipPrice: limit } : { dayPassPrice: limit } : {}),
              gymTypes: filters.filter((filter) => GROUPS["Gym type"].includes(filter)),
              equipment: equipmentFilters,
              amenities: amenityFilters,
            } });
            setFilterOpen(false);
          }}
          clear={() => {
            setFilters([]);
            setEquipmentFilters([]);
            setAmenityFilters([]);
            setRadius(maxDistance);
            setLimit(maxPrice);
            track("FILTER_CLEARED");
          }}
        />
      )}
      {dayPassPrompt && (
        <Shell close={() => setDayPassPrompt(null)} slideUp>
          <div className="relative p-7 text-center text-white">
            <button
              type="button"
              onClick={() => setDayPassPrompt(null)}
              className="absolute right-4 top-4 rounded-full p-2 transition hover:bg-white/10"
              aria-label="Close"
            >
              <X />
            </button>
            <h2 className="text-2xl font-black">Sign up to continue</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/60">
              Create a free account to claim the{" "}
              {dayPassPrompt.intent === "membership"
                ? "membership"
                : "day pass"}
              .
            </p>
            <Link
              href={`/sign-up?gymId=${encodeURIComponent(dayPassPrompt.gym.id)}${dayPassPrompt.intent === "membership" ? "&intent=membership" : ""}${dayPassPrompt.optionId ? `&optionId=${encodeURIComponent(dayPassPrompt.optionId)}` : ""}`}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#22c55e] px-6 py-3 font-black text-black transition hover:bg-[#19a94e]"
            >
              Sign up
            </Link>
            <p className="mt-4 text-xs text-white/45">
              Already have an account?{" "}
              <Link
                className="font-bold text-[#22c55e] hover:underline"
                href={`/log-in?callbackUrl=${encodeURIComponent(`/${dayPassPrompt.intent === "membership" ? "membership" : "day-pass"}/${dayPassPrompt.gym.id}${dayPassPrompt.optionId ? `?optionId=${encodeURIComponent(dayPassPrompt.optionId)}` : ""}`)}`}
              >
                Log in
              </Link>
            </p>
            <p className="mx-auto mt-4 max-w-md text-balance text-[10px] leading-4 text-white/45">
              By signing up, you agree to the{" "}
              <Link
                href="/legal/terms"
                className="whitespace-nowrap font-semibold text-white/70 underline underline-offset-2"
              >
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link
                href="/legal/privacy"
                className="whitespace-nowrap font-semibold text-white/70 underline underline-offset-2"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </Shell>
      )}
      {purchaseConfirmation && (
        <Shell
          close={() => {
            removeStoredValue(localStorage,
              `browsegyms_pending_${purchaseConfirmation.intent === "membership" ? "membership" : "day_pass"}_confirmation`,
            );
            setPurchaseConfirmation(null);
          }}
        >
          <div className="p-7 text-center text-white">
            <h2 className="mx-auto max-w-md text-2xl font-black">
              Did you get a{" "}
              {purchaseConfirmation.intent === "membership"
                ? "membership"
                : "day pass"}{" "}
              from {purchaseConfirmation.gymName}?
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  track(
                    purchaseConfirmation.intent === "membership"
                      ? "MEMBERSHIP_CLAIM_CONFIRMED"
                      : "DAY_PASS_CLAIM_CONFIRMED",
                    { gymId: purchaseConfirmation.gymId },
                  );
                  removeStoredValue(localStorage,
                    `browsegyms_pending_${purchaseConfirmation.intent === "membership" ? "membership" : "day_pass"}_confirmation`,
                  );
                  setPurchaseConfirmation(null);
                }}
                className="rounded-full border border-[#22c55e] bg-[#22c55e] px-5 py-3 text-sm font-black text-black transition hover:bg-black hover:text-[#22c55e]"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  track(
                    purchaseConfirmation.intent === "membership"
                      ? "MEMBERSHIP_CLAIM_DECLINED"
                      : "DAY_PASS_CLAIM_DECLINED",
                    { gymId: purchaseConfirmation.gymId },
                  );
                  removeStoredValue(localStorage,
                    `browsegyms_pending_${purchaseConfirmation.intent === "membership" ? "membership" : "day_pass"}_confirmation`,
                  );
                  setPurchaseConfirmation(null);
                }}
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-black transition hover:border-white hover:text-white"
              >
                No
              </button>
            </div>
          </div>
        </Shell>
      )}
    </main>
  );
}
function VerifiedBadge() {
  return (
    <span
      className="group/verified relative inline-flex shrink-0 items-center"
      aria-label="Verified gym"
    >
      <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-md bg-[#111411] px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition group-hover/verified:opacity-100"
      >
        Verified
      </span>
    </span>
  );
}
export function Card({
  gym: g,
  active,
  compared,
  compareMode,
  pricingMode = "dayPass",
  select,
  showFavorite = false,
  favorited = false,
  toggleFavorite,
  hideDistance = false,
  hidePrice = false,
  compact = false,
}: {
  gym: LandingGym;
  pricingMode?: PricingMode;
  active: boolean;
  compared: boolean;
  compareMode: boolean;
  select: () => void;
  showFavorite?: boolean;
  favorited?: boolean;
  toggleFavorite?: () => void;
  hideDistance?: boolean;
  hidePrice?: boolean;
  compact?: boolean;
}) {
  return (
    <article
      onClick={select}
      className={`group cursor-pointer overflow-hidden border bg-white shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#111411] ${compact ? "rounded-xl" : "rounded-2xl"} ${compareMode ? "gym-card-compare-wiggle" : ""} ${active || compared ? "!border-[#22c55e] ring-2 ring-[#22c55e]/25" : ""}`}
    >
      <div className={`flex ${compact ? "h-[108px]" : "min-h-[148px]"}`}>
        <div className="relative w-[35%] shrink-0 overflow-hidden bg-zinc-200">
          {g.photo ? (
            <img
              src={g.photo}
              alt={`${g.name} cover`}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Dumbbell />
            </div>
          )}
          {!hideDistance && (
            <span className="absolute left-2 top-2 z-10 rounded-full border border-white/20 bg-black/80 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur">
              {Number.isFinite(g.distance)
                ? `${g.distance.toFixed(g.distance < 10 ? 1 : 0)} mi`
                : "Distance unavailable"}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
          <div className="flex justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-lg font-black">{g.name}</h2>
              {g.isVerified && <VerifiedBadge />}
            </div>
            {showFavorite &&
              (compareMode ? (
                <button
                  type="button"
                  aria-label={
                    compared
                      ? `Remove ${g.name} from comparison`
                      : `Add ${g.name} to comparison`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    select();
                  }}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${compared ? "border-[#22c55e] bg-[#22c55e] text-black" : "border-zinc-400 bg-transparent text-transparent"}`}
                >
                  {compared && <Check className="h-4 w-4" strokeWidth={3} />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite?.();
                  }}
                  className="rounded-full p-1 hover:bg-black/5"
                >
                  <Star
                    className={`h-5 w-5 ${favorited ? "fill-[#22c55e] text-[#22c55e]" : "text-zinc-400"}`}
                  />
                </button>
              ))}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{g.address}</p>
          {!hidePrice && (
            <p className="mt-2">
              <b className="text-lg">{costText(g, pricingMode)}</b>
              {cost(g, pricingMode) > 0 && (
                <span className="text-xs text-zinc-500">
                  {" "}
                  {pricingMode === "membership" ? "/ month" : "/ day pass"}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
function GymMap({
  visible,
  pricingMode,
  gyms,
  selectedIds,
  favorites,
  userCoords,
  center,
  select,
}: {
  visible: boolean;
  pricingMode: PricingMode;
  gyms: LandingGym[];
  selectedIds: string[];
  favorites: string[];
  userCoords: { lat: number; lng: number } | null;
  center: { lat: number; lng: number };
  select: (id: string | null) => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    markers = useRef<any[]>([]),
    userMarker = useRef<any>(null),
    referenceMarker = useRef<any>(null),
    selectRef = useRef(select),
    markerInteraction = useRef<{ id: string; at: number } | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [referenceLocation, setReferenceLocation] = useState<{
      lat: number;
      lng: number;
    } | null>(null);
  const selectionKey =
    typeof window !== "undefined" && window.innerWidth < 768
      ? ""
      : selectedIds.join("|");
  useEffect(() => {
    selectRef.current = select;
  }, [select]);
  useEffect(() => {
    let dead = false;
    import("leaflet")
      .then(({ default: L }) => {
        if (dead || !mapEl.current || map.current) return;
        map.current = L.map(mapEl.current, {
          center: [38.9072, -77.0369],
          zoom: 12,
          zoomControl: true,
          scrollWheelZoom: true,
          zoomAnimation: true,
          markerZoomAnimation: true,
          fadeAnimation: true,
          zoomAnimationThreshold: 8,
          wheelDebounceTime: 30,
        });
        L.tileLayer(
          `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY ?? "")}`,
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 20,
          },
        ).addTo(map.current);
        map.current.on("click", (event: any) => {
          const target = event.originalEvent?.target;
          const markerTarget =
            target instanceof Element &&
            Boolean(target.closest(".leaflet-marker-icon"));
          if (!markerTarget && window.innerWidth >= 768)
            selectRef.current(null);
        });
        setReady(true);
        setError(null);
      })
      .catch(() => !dead && setError("OpenStreetMap could not load."));
    return () => {
      dead = true;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);
  useEffect(() => {
    const updateReferenceLocation = (event: Event) => {
      const detail = (event as CustomEvent<{ lat: number; lng: number } | null>)
        .detail;
      setReferenceLocation(
        detail && Number.isFinite(detail.lat) && Number.isFinite(detail.lng)
          ? detail
          : null,
      );
    };
    window.addEventListener(
      "landing_reference_location_changed",
      updateReferenceLocation,
    );
    return () =>
      window.removeEventListener(
        "landing_reference_location_changed",
        updateReferenceLocation,
      );
  }, []);
  useEffect(() => {
    const element = mapEl.current;
    if (!element) return;
    let markerPress: { x: number; y: number; moved: boolean } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (window.innerWidth >= 768) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".leaflet-marker-icon")) {
        markerPress = { x: event.clientX, y: event.clientY, moved: false };
        return;
      }
      markerPress = null;
      selectRef.current(null);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!markerPress) return;
      if (
        Math.hypot(
          event.clientX - markerPress.x,
          event.clientY - markerPress.y,
        ) > 8
      )
        markerPress.moved = true;
    };
    const pointerUp = (event: PointerEvent) => {
      if (!markerPress) return;
      const dragged =
        markerPress.moved ||
        Math.hypot(
          event.clientX - markerPress.x,
          event.clientY - markerPress.y,
        ) > 8;
      markerPress = null;
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener("pointerdown", pointerDown, true);
    element.addEventListener("pointermove", pointerMove, true);
    element.addEventListener("pointerup", pointerUp, true);
    element.addEventListener("pointercancel", pointerUp, true);
    return () => {
      element.removeEventListener("pointerdown", pointerDown, true);
      element.removeEventListener("pointermove", pointerMove, true);
      element.removeEventListener("pointerup", pointerUp, true);
      element.removeEventListener("pointercancel", pointerUp, true);
    };
  }, []);
  useEffect(() => {
    if (
      !map.current ||
      !ready ||
      !Number.isFinite(center.lat) ||
      !Number.isFinite(center.lng)
    )
      return;
    if (window.innerWidth >= 768) {
      map.current.setView([center.lat, center.lng], 13, { animate: true });
      return;
    }
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      const element = mapEl.current;
      if (
        !map.current ||
        !element ||
        element.clientWidth <= 0 ||
        element.clientHeight <= 0
      )
        return;
      map.current.invalidateSize({ pan: false, animate: false });
      const size = map.current.getSize();
      if (
        !Number.isFinite(size.x) ||
        !Number.isFinite(size.y) ||
        size.x <= 0 ||
        size.y <= 0
      )
        return;
      map.current.flyTo([center.lat, center.lng], 13, {
        animate: true,
        duration: 0.5,
        easeLinearity: 0.25,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [center.lat, center.lng, ready, visible]);
  useEffect(() => {
    const animateToRequestedLocation = (event: Event) => {
      if (!visible || !map.current || !ready) return;
      const detail = (event as CustomEvent<{ lat: number; lng: number }>)
        .detail;
      if (
        !detail ||
        !Number.isFinite(detail.lat) ||
        !Number.isFinite(detail.lng)
      )
        return;
      window.requestAnimationFrame(() => {
        const element = mapEl.current;
        if (
          !map.current ||
          !element ||
          element.clientWidth <= 0 ||
          element.clientHeight <= 0
        )
          return;
        map.current.invalidateSize({ pan: false, animate: false });
        map.current.flyTo([detail.lat, detail.lng], 13, {
          animate: true,
          duration: 0.5,
          easeLinearity: 0.25,
        });
      });
    };
    window.addEventListener(
      "landing_location_changed",
      animateToRequestedLocation,
    );
    return () =>
      window.removeEventListener(
        "landing_location_changed",
        animateToRequestedLocation,
      );
  }, [ready, visible]);
  useEffect(() => {
    if (!map.current || !ready || !visible) return;
    const frame = window.requestAnimationFrame(() =>
      map.current?.invalidateSize({ pan: false, animate: false }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [ready, visible]);
  useEffect(() => {
    if (ready && window.innerWidth < 768)
      map.current?.attributionControl?.remove();
  }, [ready]);
  useEffect(() => {
    if (!ready || !mapEl.current) return;
    const observer = new ResizeObserver(() =>
      map.current?.invalidateSize({ pan: false }),
    );
    observer.observe(mapEl.current);
    return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    if (!map.current || !ready) return;
    import("leaflet").then(({ default: L }) => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = gyms.flatMap((g) => {
        if (g.lat == null || g.lng == null) return [];
        const favorite = favorites.includes(g.id),
          active = selectionKey.split("|").includes(g.id),
          width = favorite ? 96 : 76;
        const star = favorite
          ? '<span class="map-favorite-star" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'
          : "";
        const icon = L.divIcon({
          className: "",
          html: `<div class="map-price-pin${active ? " active" : ""}${favorite ? " favorite" : ""}">${star}<strong>${pricingMode === "membership" && cost(g, pricingMode) > 0 ? money(Math.floor(cost(g, pricingMode))) : costText(g, pricingMode)}</strong></div>`,
          iconSize: [width, 42],
          iconAnchor: [width / 2, 38],
        });
        const marker = L.marker([g.lat, g.lng], {
          icon,
          title: g.name,
          bubblingMouseEvents: false,
          riseOnHover: false,
        }).addTo(map.current);
        const openProfile = (event: any) => {
          const now = performance.now();
          if (
            markerInteraction.current?.id === g.id &&
            now - markerInteraction.current.at < 400
          )
            return;
          markerInteraction.current = { id: g.id, at: now };
          const originalEvent = event.originalEvent ?? event;
          originalEvent?.preventDefault?.();
          originalEvent?.stopPropagation?.();
          selectRef.current(g.id);
        };
        marker.on("click", openProfile);
        if (window.innerWidth < 768) {
          const element = marker.getElement();
          if (element) L.DomEvent.on(element, "pointerup", openProfile);
        }
        return [marker];
      });
    });
  }, [favorites, gyms, pricingMode, ready, selectionKey]);
  useEffect(() => {
    if (!map.current || !ready) return;
    referenceMarker.current?.remove();
    referenceMarker.current = null;
    if (!referenceLocation) return;
    let cancelled = false;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !map.current) return;
      const icon = L.divIcon({
        className: "",
        html: '<div class="searched-location-pin" aria-hidden="true"><span></span></div>',
        iconSize: [30, 38],
        iconAnchor: [15, 36],
      });
      referenceMarker.current = L.marker(
        [referenceLocation.lat, referenceLocation.lng],
        { icon, interactive: false, keyboard: false, zIndexOffset: 900 },
      ).addTo(map.current);
    });
    return () => {
      cancelled = true;
      referenceMarker.current?.remove();
      referenceMarker.current = null;
    };
  }, [ready, referenceLocation]);
  useEffect(() => {
    if (!map.current || !ready || !userCoords) return;
    import("leaflet").then(({ default: L }) => {
      userMarker.current?.remove();
      userMarker.current = L.circleMarker([userCoords.lat, userCoords.lng], {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#22c55e",
        fillOpacity: 1,
        className: "current-location-dot",
        interactive: window.innerWidth >= 768,
      })
        .addTo(map.current)
        .bindTooltip("Your location", { direction: "top" });
    });
  }, [ready, userCoords]);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b100c]">
      <div ref={mapEl} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-[#0b100c] p-8 text-center text-white">
          <div>
            <MapIcon className="mx-auto mb-3 text-[#4f9a69]" />
            <b>Map couldn&apos;t load</b>
            <p className="mt-1 text-sm text-white/50">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
function ProfileTray({
  pricingMode,
  panels,
  widths,
  defaultWidth,
  resize,
  closeGym,
  pass,
  website,
  directions,
  favorites,
  toggleFavorite,
  swipeHint = false,
  onSwipeHintDismiss,
}: {
  pricingMode: PricingMode;
  panels: LandingGym[];
  widths: Record<string, number>;
  defaultWidth: number;
  resize: (id: string, width: number) => void;
  closeGym: (gym: LandingGym) => void;
  pass: (gym: LandingGym, option?: DayPassOption) => void;
  website: (gym: LandingGym) => void;
  directions: (gym: LandingGym) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  swipeHint?: boolean;
  onSwipeHintDismiss?: () => void;
}) {
  const trayRef = useRef<HTMLElement>(null);
  const mobileOpenCycle = useRef(0),
    previousFirstPanelId = useRef<string | null>(null);
  const [renderedPanels, setRenderedPanels] = useState(panels);
  const [mobileReadyId, setMobileReadyId] = useState<string | null>(null);
  const mobileViewport =
      typeof window !== "undefined" && window.innerWidth < 768,
    firstPanelId = panels[0]?.id ?? null;
  if (mobileViewport && firstPanelId !== previousFirstPanelId.current)
    mobileOpenCycle.current += 1;
  previousFirstPanelId.current = firstPanelId;
  const visiblePanels = mobileViewport
    ? mobileReadyId === firstPanelId
      ? panels
      : panels.slice(0, 1)
    : panels.length
      ? panels
      : renderedPanels;
  useEffect(() => {
    if (panels.length) {
      setRenderedPanels(panels);
      return;
    }
    const timer = window.setTimeout(() => setRenderedPanels([]), 300);
    return () => window.clearTimeout(timer);
  }, [panels]);
  useEffect(() => {
    if (!mobileViewport || !firstPanelId) {
      setMobileReadyId(null);
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      setMobileReadyId(firstPanelId),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [firstPanelId, mobileViewport]);
  useEffect(() => {
    trayRef.current?.scrollTo({ left: 0 });
  }, [panels[0]?.id]);
  return (
    <aside
      ref={trayRef}
      onClick={(event) => event.stopPropagation()}
      onScroll={(event) => {
        if (swipeHint && Math.abs(event.currentTarget.scrollLeft) > 12)
          onSwipeHintDismiss?.();
      }}
      className={`gym-profile-carousel ${swipeHint ? "gym-profile-swipe-tutorial" : ""} scrollbar-slim absolute bottom-3 right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] gap-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#090b09]/95 p-3 shadow-2xl backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out ${panels.length ? "pointer-events-auto translate-x-0 opacity-100" : "pointer-events-none translate-x-[105%] opacity-0"}`}
    >
      {visiblePanels.map((gym, index) => (
        <div
          key={mobileViewport ? `${gym.id}:${mobileOpenCycle.current}` : gym.id}
          className="gym-profile-presence"
          style={{ width: widths[gym.id] ?? defaultWidth }}
        >
          <ProfileResizeHandle
            width={widths[gym.id] ?? defaultWidth}
            resize={(width) => resize(gym.id, width)}
          />
          <DetailPanel
            pricingMode={pricingMode}
            gym={gym}
            primary={index === 0}
            close={() => closeGym(gym)}
            pass={(option) => pass(gym, option)}
            onWebsite={() => website(gym)}
            onDirections={() => directions(gym)}
            favorited={favorites.includes(gym.id)}
            onFavorite={() => toggleFavorite(gym.id)}
          />
        </div>
      ))}
      {swipeHint && panels.length > 1 && (
        <div role="status" className="gym-swipe-hint">
          <span className="gym-swipe-gesture" aria-hidden="true">
            <ChevronLeft className="gym-swipe-chevron gym-swipe-chevron-first" />
            <ChevronLeft className="gym-swipe-chevron gym-swipe-chevron-second" />
          </span>
          <span>Swipe to compare</span>
        </div>
      )}
    </aside>
  );
}
function ProfileResizeHandle({
  width,
  resize,
}: {
  width: number;
  resize: (width: number) => void;
}) {
  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX,
      startWidth = width;
    document.body.classList.add("resizing-gym-profile");
    const move = (moveEvent: PointerEvent) =>
      resize(
        Math.max(300, Math.min(640, startWidth + startX - moveEvent.clientX)),
      );
    const up = () => {
      document.body.classList.remove("resizing-gym-profile");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      className="gym-profile-resize-handle"
      onPointerDown={start}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize gym profile"
    />
  );
}
const equipment = (items: string[]) => {
  const clean = items.filter((x) => x && !/^(?:not listed|other)$/i.test(x)).map((x) => x.replace(/\s*×\s*(\d+)$/, (_, quantity: string) => quantity === "1" ? "" : ` (${quantity})`)),
    db = clean.filter((x) => /dumbbell/i.test(x) && /\d+\+?\s*lb/i.test(x)),
    weights = db.map((x) => Number(x.match(/(\d+)\+?\s*lb/i)?.[1] || 0));
  return [
    ...new Set([
      ...clean.filter((x) => !db.includes(x)),
      ...(weights.length
        ? [`Dumbbell maximum weight: ${Math.max(...weights)}+ lb`]
        : []),
    ]),
  ];
};
export function DetailPanel({
  gym: g,
  pricingMode = "dayPass",
  primary,
  close,
  pass,
  hideActions = false,
  onWebsite,
  onDirections,
  favorited = false,
  onFavorite,
}: {
  gym: LandingGym;
  pricingMode?: PricingMode;
  primary: boolean;
  close: () => void;
  pass: (option?: DayPassOption) => void;
  hideActions?: boolean;
  onWebsite?: () => void;
  onDirections?: () => void;
  favorited?: boolean;
  onFavorite?: () => void;
}) {
  const controlsOpenedAt = useRef(Date.now());
  const [photo, setPhoto] = useState(0),
    [expanded, setExpanded] = useState(false),
    [mobileImageControls, setMobileImageControls] = useState(true),
    [selectedDayPassId, setSelectedDayPassId] = useState<string | null>(() => {
      const options = dayPassOptionsFor(g);
      return options.length === 1 ? options[0].id : null;
    }),
    [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(
      () => {
        const options = membershipOptionsFor(g);
        return options.length === 1 ? options[0].id : null;
      },
    ),
    [expandedMembershipIds, setExpandedMembershipIds] = useState<Set<string>>(
      () => new Set(),
    );
  const photos = [g.photo, ...(g.photoUrls ?? [])].filter(
    (value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index,
  );
  const equipmentItems = equipment(g.equipment);
  const amenityItems = g.amenities.filter(
    (item) => item && !/^(?:not listed|other)$/i.test(item),
  );
  const dayPassOptions = dayPassOptionsFor(g),
    selectedDayPass = dayPassOptions.find((option) => option.id === selectedDayPassId) ?? null,
    displayedDayPass = selectedDayPass ?? dayPassChoice(g),
    membershipOptions = membershipOptionsFor(g),
    selectedMembership =
      membershipOptions.find((option) => option.id === selectedMembershipId) ??
      null;
  const membershipDestination =
    selectedMembership?.purchaseUrl?.trim() ||
    membershipOptions[0]?.purchaseUrl?.trim() ||
    "";
  const siteHref = /^https?:\/\//i.test(g.site) ? g.site : `https://${g.site}`;
  const openMembership = () => {
    if (!membershipDestination || !selectedMembership) return;
    const destination = /^https?:\/\//i.test(membershipDestination)
      ? membershipDestination
      : `https://${membershipDestination}`;
    window.dispatchEvent(
      new CustomEvent("landing_membership_claim", {
        detail: {
          gym: g,
          destination,
          optionId: selectedMembership.id,
          optionName: selectedMembership.name,
          price: effectiveMonthlyPrice(selectedMembership),
        },
      }),
    );
  };
  useEffect(() => {
    if (primary && window.innerWidth < 768) {
      controlsOpenedAt.current = Date.now();
      setMobileImageControls(true);
    }
  }, [g.id, primary]);
  return (
    <article
      onClickCapture={(event) => {
        const target = event.target;
        if (
          window.innerWidth < 768 &&
          Date.now() - controlsOpenedAt.current < 300 &&
          target instanceof Element &&
          target.closest(".mobile-profile-image")
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      className="relative h-full w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#111411] text-white"
    >
      <div
        className={`scrollbar-slim h-full overflow-y-auto ${hideActions ? "pb-5" : "pb-24"}`}
      >
        <div
          data-image-expanded={expanded}
          data-mobile-controls-visible={mobileImageControls}
          className={`relative bg-[#263027] transition-[height] duration-500 ease-out ${expanded ? "h-[360px]" : "h-48"}`}
        >
          {photos[photo] ? (
            <img
              src={photos[photo]}
              alt={`${g.name} photo ${photo + 1}`}
              onClick={() => {
                if (window.innerWidth < 768)
                  setMobileImageControls((value) => !value);
              }}
              className="mobile-profile-image h-full w-full object-cover transition duration-300"
            />
          ) : (
            <div className="grid h-full place-items-center text-white/40">
              <Dumbbell className="h-12 w-12" />
            </div>
          )}
          {onFavorite && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFavorite();
              }}
              aria-label={favorited ? "Remove saved gym" : "Save gym"}
              className="mobile-profile-favorite absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-transparent bg-black/75 text-white md:hidden"
            >
              <Star
                className={`h-5 w-5 ${favorited ? "fill-[#22c55e] text-[#22c55e]" : "text-white"}`}
              />
            </button>
          )}
          {!hideActions && (
            <button
              type="button"
              onClick={close}
              aria-label="Close gym profile"
              className="mobile-profile-close absolute right-3 top-3 rounded-full border border-transparent bg-black/75 p-2 transition hover:border-zinc-400 hover:bg-black/75 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="absolute bottom-3 right-3 rounded-full border border-transparent bg-black/75 p-2 transition hover:border-zinc-400 hover:bg-black/75 hover:text-white"
            aria-label={expanded ? "Reduce image" : "Enlarge image"}
          >
            {expanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setPhoto((photo + photos.length - 1) % photos.length)
                }
                data-photo-arrow="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-transparent bg-black/65 p-2 transition hover:border-zinc-400 hover:bg-black/65 hover:text-white"
                aria-label="Previous photo"
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                onClick={() => setPhoto((photo + 1) % photos.length)}
                data-photo-arrow="true"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-transparent bg-black/65 p-2 transition hover:border-zinc-400 hover:bg-black/65 hover:text-white"
                aria-label="Next photo"
              >
                <ChevronRight />
              </button>
              <div className="mobile-photo-indicators absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {photos.map((_, index) => (
                  <button
                    type="button"
                    key={index}
                    aria-label={`Photo ${index + 1}`}
                    onClick={() => setPhoto(index)}
                    className={`h-1.5 rounded-full transition-all ${photo === index ? "w-6 bg-[#22c55e]" : "w-1.5 bg-white/70"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="space-y-5 p-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="text-2xl font-black">{g.name}</h3>
                {g.isVerified && <VerifiedBadge />}
              </div>
              <p className="shrink-0 text-right text-sm font-semibold leading-none text-white/50">
                {g.type}
              </p>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p>
                <b className="text-xl">
                  {pricingMode === "dayPass" && displayedDayPass
                    ? displayedDayPass.price > 0
                      ? money(displayedDayPass.price)
                      : "Free"
                    : costText(g, pricingMode)}
                </b>
                {(pricingMode === "dayPass" ? (displayedDayPass?.price ?? cost(g, pricingMode)) : cost(g, pricingMode)) > 0 && (
                  <span className="text-sm text-white/50">
                    {" "}
                    {pricingMode === "membership" ? "/ month" : "/ day pass"}
                  </span>
                )}
              </p>
              <span className="shrink-0 text-right text-sm font-semibold text-white/50">
                {pricingMode === "membership"
                  ? "Monthly membership"
                  : displayedDayPass
                    ? dayPassDurationLabel(displayedDayPass.durationDays)
                    : dayPassAccess(g.dayPassDetails)}
              </span>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <p className="flex gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-[#22c55e]" />
              <b>{g.address}</b>
            </p>
            <p className="flex gap-3">
              <Navigation className="h-5 w-5 shrink-0 text-[#22c55e]" />
              <span>{g.distance} miles away</span>
            </p>
            <p className="flex gap-3">
              <Clock3 className="h-5 w-5 shrink-0 text-[#22c55e]" />
              <span className="whitespace-pre-line">{gymHoursForDisplay(g.hours)}</span>
            </p>
            {g.phone && (
              <a
                href={`tel:${g.phone.replace(/[^\d+]/g, "")}`}
                className="flex gap-3 transition hover:text-[#22c55e]"
              >
                <Phone className="h-5 w-5 shrink-0 text-[#22c55e]" />
                <span className="underline decoration-white/25 underline-offset-4">
                  {g.phone}
                </span>
              </a>
            )}
            {g.contactEmail && (
              <a
                href={`mailto:${g.contactEmail}`}
                className="flex gap-3 transition hover:text-[#22c55e]"
              >
                <Mail className="h-5 w-5 shrink-0 text-[#22c55e]" />
                <span className="truncate underline decoration-white/25 underline-offset-4">
                  {g.contactEmail}
                </span>
              </a>
            )}
            {g.site && (
              <a
                href={siteHref}
                target="_blank"
                rel="noreferrer"
                onClick={onWebsite}
                className="flex gap-3 transition hover:text-[#22c55e]"
              >
                <ExternalLink className="h-5 w-5 shrink-0 text-[#22c55e]" />
                <span className="truncate underline decoration-white/25 underline-offset-4">
                  {g.site}
                </span>
              </a>
            )}
          </div>
          {pricingMode === "dayPass" && dayPassOptions.length > 0 && (
            <section>
              <h4 className="font-black">Choose a day pass</h4>
              <div className="mt-3 space-y-2">
                {dayPassOptions.map((option) => {
                  const selected = selectedDayPass?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedDayPassId(current => current === option.id ? null : option.id)}
                      className={`block w-full rounded-lg border px-3 py-3 text-left transition ${selected ? "border-white ring-1 ring-white" : "border-white/[.08] hover:border-white/15"}`}
                    >
                      <span className="flex items-center gap-3">
                        <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[#22c55e] bg-[#22c55e] text-black" : "border-white/30"}`}>
                          {selected && (
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 font-black">{dayPassDurationLabel(option.durationDays)}</span>
                        <b className="shrink-0 text-[#22c55e]">{money(option.price)}</b>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {pricingMode === "membership" && (
            <section>
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-black">Choose a membership</h4>
              </div>
              <div className="mt-3 space-y-2">
                {membershipOptions.length ? (
                  membershipOptions.map((option) => {
                    const selected = selectedMembership?.id === option.id,
                      open = expandedMembershipIds.has(option.id),
                      breakdown = membershipMonthlyBreakdown(option),
                      monthlyTerms = [
                        breakdown.recurringMonthly,
                        breakdown.annualFeeMonthly,
                        breakdown.upfrontFeesMonthly,
                      ].filter((value) => Number(value.toFixed(2)) > 0),
                      upfrontFormula = [
                        option.enrollmentFee,
                        option.additionalFees,
                      ]
                        .filter((value) => value > 0)
                        .map((value) => `${value.toFixed(2)}`)
                        .join(" + ");
                    return (
                      <article
                        key={option.id}
                        onClick={() =>
                          setSelectedMembershipId((current) =>
                            current === option.id ? null : option.id,
                          )
                        }
                        className={`cursor-pointer overflow-hidden rounded-lg border bg-transparent transition ${selected ? "border-white ring-1 ring-white" : "border-white/[.08] hover:border-white/15"}`}
                      >
                        <div className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-left">
                          <span
                            aria-hidden="true"
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[#22c55e] bg-[#22c55e] text-black" : "border-white/30 bg-transparent"}`}
                          >
                            {selected && (
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            )}
                          </span>
                          <h5 className="min-w-0 flex-1 truncate font-black text-white">
                            {option.name}
                          </h5>
                          <div className="shrink-0 text-right">
                            <span className="whitespace-nowrap">
                              <b className="text-base text-[#22c55e]">{`${effectiveMonthlyPrice(option).toFixed(2)}`}</b>
                              <span className="ml-1 text-[10px] font-semibold text-white/45">
                                /mo avg
                              </span>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedMembershipIds((current) => {
                                const next = new Set(current);
                                if (next.has(option.id)) next.delete(option.id);
                                else next.add(option.id);
                                return next;
                              });
                            }}
                            aria-label={`${open ? "Collapse" : "Expand"} ${option.name} details`}
                            aria-expanded={open}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-white/65 transition hover:text-white"
                          >
                            <span>Details</span>
                            <ChevronDown
                              className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
                            />
                          </button>
                        </div>
                        {open && (
                          <div className="border-t border-white/[.08] px-3 py-2.5 text-sm text-white/70">
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                              <div>
                                <dt className="text-white/45">
                                  Contract length
                                </dt>
                                <dd>{contractLengthLabel(option)}</dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-white/45">
                                  Membership price
                                </dt>
                                <dd className="font-black text-white">
                                  {money(option.price)}{" "}
                                  <span className="font-medium text-white/50">
                                    · {billingFrequencyLabel(option)} billing
                                  </span>
                                </dd>
                              </div>
                              {option.enrollmentFee > 0 && (
                                <div>
                                  <dt className="text-white/45">
                                    Enrollment fee
                                  </dt>
                                  <dd>{money(option.enrollmentFee)}</dd>
                                </div>
                              )}
                              {option.annualFee > 0 && (
                                <div className="col-span-2">
                                  <dt className="text-white/45">Annual fee</dt>
                                  <dd>{money(option.annualFee)} · {annualFeeTimingLabel(option)}</dd>
                                </div>
                              )}
                              {option.additionalFees > 0 && (
                                <div>
                                  <dt className="text-white/45">
                                    Additional fees
                                  </dt>
                                  <dd>{money(option.additionalFees)}</dd>
                                </div>
                              )}
                              {option.guestPassesEnabled && option.guestPassCount > 0 && (
                                <div className="col-span-2">
                                  <dt className="text-white/45">Guest passes</dt>
                                  <dd className="text-white">{option.guestPassCount} guest {option.guestPassCount === 1 ? "pass" : "passes"} per {option.guestPassFrequency}</dd>
                                </div>
                              )}
                            </dl>
                            {option.additionalFees > 0 &&
                              option.additionalFeesDetails && (
                                <p className="mt-2 text-xs">
                                  <b className="text-white">Fee details:</b>{" "}
                                  {option.additionalFeesDetails}
                                </p>
                              )}
                            <div className="mt-3 text-xs">
                              <p className="text-white/45">Included access</p>
                              <p className="mt-1 text-white">
                                {option.access.filter((item) => !/^other$/i.test(item)).join(", ")}
                              </p>
                            </div>
                            {option.notes && (
                              <div className="mt-2 text-xs">
                                <p className="text-white/45">
                                  Additional notes
                                </p>
                                <p className="mt-1 whitespace-pre-line text-white/80">
                                  {option.notes}
                                </p>
                              </div>
                            )}
                            <details className="group/breakdown mt-3 border-t border-white/[.08] pt-2">
                              <summary
                                onClick={(event) => event.stopPropagation()}
                                className="flex cursor-pointer list-none items-center justify-between py-1 text-xs font-semibold text-white/65 transition hover:text-white"
                              >
                                <span>View monthly average breakdown</span>
                                <ChevronDown className="h-3.5 w-3.5 transition group-open/breakdown:rotate-180" />
                              </summary>
                              <div className="mt-2 space-y-3 px-1 py-2 [font-family:var(--font-anonymous-pro)] text-xs leading-6 tracking-wide text-white/75">
                                {breakdown.recurringMonthly > 0 && (
                                  <div>
                                    <span className="text-white/40">
                                      Recurring price
                                    </span>
                                    <p>
                                      {breakdown.recurringFormula} = $
                                      {breakdown.recurringMonthly.toFixed(2)}/mo
                                    </p>
                                  </div>
                                )}
                                {option.annualFee > 0 && (
                                  <div>
                                    <span className="text-white/40">
                                      Annual fee
                                    </span>
                                    <p>
                                      ${option.annualFee.toFixed(2)} ÷ 12 months = $
                                      {breakdown.annualFeeMonthly.toFixed(2)}/mo
                                    </p>
                                    <p>{annualFeeTimingLabel(option)}</p>
                                  </div>
                                )}
                                {breakdown.upfrontFees > 0 && (
                                  <div>
                                    <span className="text-white/40">
                                      One-time fees
                                    </span>
                                    <p>
                                      {upfrontFormula} ÷{" "}
                                      {breakdown.contractMonthsFormula} = $
                                      {breakdown.upfrontFeesMonthly.toFixed(2)}
                                      /mo
                                    </p>
                                  </div>
                                )}
                                {monthlyTerms.length > 0 && (
                                  <div className="border-t border-white/10 pt-2 font-bold text-white">
                                    <p>
                                      {monthlyTerms
                                        .map((value) => `$${value.toFixed(2)}`)
                                        .join(" + ")} = $
                                      {breakdown.averageMonthly.toFixed(2)}/mo avg
                                    </p>
                                  </div>
                                )}
                              </div>
                            </details>
                          </div>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <p className="text-sm text-white/60">
                    No membership options are listed.
                  </p>
                )}
              </div>
            </section>
          )}
          {equipmentItems.length > 0 && (
            <Disclosure title="Equipment">
              <Grid items={equipmentItems} />
            </Disclosure>
          )}
          {amenityItems.length > 0 && (
            <Disclosure title="Amenities">
              <Grid
                items={amenityItems}
                highlightedItems={
                  pricingMode === "membership"
                    ? (selectedMembership?.access ?? [])
                    : (selectedDayPass?.access ?? [])
                }
              />
            </Disclosure>
          )}
        </div>
      </div>
      {!hideActions && (
        <div className="mobile-profile-actions absolute inset-x-0 bottom-0 flex gap-2 border-t border-white/10 bg-[#111411]/95 p-4 backdrop-blur">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(g.address)}`}
            target="_blank"
            rel="noreferrer"
            onClick={onDirections}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#22c55e] px-3 py-3 text-xs font-black text-[#22c55e] transition hover:bg-[#22c55e] hover:text-black"
          >
            <Navigation className="h-4 w-4" />
            Directions
          </a>
          <button
            type="button"
            disabled={
              pricingMode === "membership"
                ? !selectedMembership || !membershipDestination
                : !selectedDayPass || !(selectedDayPass.purchaseUrl || dayPassOptions[0]?.purchaseUrl || g.dayPassUrl || g.site)
            }
            onClick={pricingMode === "membership" ? openMembership : () => pass(selectedDayPass ?? undefined)}
            className="mobile-claim-button flex-1 rounded-full bg-[#22c55e] px-3 py-3 text-xs font-black text-black transition hover:bg-[#19a94e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pricingMode === "membership"
              ? "Claim Membership"
              : "Claim Day Pass"}
          </button>
        </div>
      )}
    </article>
  );
}
export function LandingMapProfilePreview({ gym }: { gym: LandingGym }) {
  return (
    <div className="h-[760px] max-h-[80vh] min-h-[560px]">
      <DetailPanel
        gym={gym}
        primary
        close={() => {}}
        pass={() => {}}
        hideActions
      />
    </div>
  );
}
export function LandingGymProfilePreview({ gym }: { gym: LandingGym }) {
  return <LandingMapProfilePreview gym={gym} />;
}
function Disclosure({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-t border-white/[.08]">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-bold text-white/85 transition hover:text-white">
        {title}
        <ChevronDown className="h-4 w-4 text-white/35 transition group-open:rotate-180 group-open:text-[#22c55e]" />
      </summary>
      {children}
    </details>
  );
}
function Grid({
  items,
  highlightedItems = [],
}: {
  items: string[];
  highlightedItems?: string[];
}) {
  const highlighted = new Set(
    highlightedItems.map((item) => item.trim().toLowerCase()),
  );
  return (
    <div className="flex flex-wrap gap-1.5 pb-3">
      {items
        .filter((x) => !/^not listed$/i.test(x))
        .map((x) => {
          const active = highlighted.has(x.trim().toLowerCase());
          return (
            <span
              key={x}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${active ? "border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]" : "border-white/[.08] text-white/70"}`}
            >
              {x}
            </span>
          );
        })}
    </div>
  );
}
function Shell({
  children,
  close,
  wide = false,
  slideUp = false,
  fixedFooter = false,
}: {
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
  slideUp?: boolean;
  fixedFooter?: boolean;
}) {
  return (
    <div
      onMouseDown={close}
      className={`fixed inset-0 z-[2000] flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6 ${slideUp ? "mobile-signup-overlay" : ""}`}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`max-h-[92dvh] w-full rounded-t-3xl bg-[#111411] md:max-h-[94vh] md:rounded-3xl ${fixedFooter ? "flex h-[min(92dvh,40rem)] flex-col overflow-hidden md:h-[min(94vh,40rem)]" : "overflow-auto"} ${wide ? "max-w-6xl" : "max-w-2xl"} ${slideUp ? "mobile-signup-sheet" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
function Top({ title, close }: { title: string; close: () => void }) {
  return (
    <div className="flex justify-between border-b border-white/10 p-5 text-white">
      <h2 className="text-2xl font-black">{title}</h2>
      <button onClick={close}>
        <X />
      </button>
    </div>
  );
}
function Filters({
  pricingMode,
  radius,
  limit,
  maxRadius,
  maxLimit,
  resultCount,
  setRadius,
  setLimit,
  filters,
  equipmentFilters,
  amenityFilters,
  toggle,
  setEquipmentFilters,
  setAmenityFilters,
  close,
  apply,
  clear,
}: {
  pricingMode: PricingMode;
  radius: number;
  limit: number;
  maxRadius: number;
  maxLimit: number;
  resultCount: number;
  setRadius: (n: number) => void;
  setLimit: (n: number) => void;
  filters: string[];
  equipmentFilters: string[];
  amenityFilters: string[];
  toggle: (s: string) => void;
  setEquipmentFilters: (items: string[]) => void;
  setAmenityFilters: (items: string[]) => void;
  close: () => void;
  apply: () => void;
  clear: () => void;
}) {
  return (
    <Shell close={close} fixedFooter>
      <Top title="Filters" close={close} />
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 text-white">
        <label className="block font-black">
          Distance · {Number(radius.toFixed(1))} miles
          <input
            className="mt-3 w-full accent-[#22c55e]"
            type="range"
            min="0"
            max={maxRadius}
            step="0.1"
            value={Math.min(radius, maxRadius)}
            onChange={(e) => setRadius(+e.target.value)}
          />
        </label>
        <label className="block font-black">
          {pricingMode === "membership" ? "Membership price" : "Day-pass price"}{" "}
          · {money(limit)}
          <input
            className="mt-3 w-full accent-[#22c55e]"
            type="range"
            min="0"
            max={maxLimit}
            step="1"
            value={Math.min(limit, maxLimit)}
            onChange={(e) => setLimit(+e.target.value)}
          />
        </label>
        <section>
            <h3 className="mb-3 font-black">Gym type</h3>
            <div className="flex flex-wrap gap-2">
              {GROUPS["Gym type"].map((f) => {
                const selected = filters.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(f)}
                    className={`landing-filter-option box-border inline-flex h-9 min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium leading-none ${selected ? "border-[#22c55e] bg-[#22c55e] text-black" : "border-white/15 bg-transparent text-white"}`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
        </section>
        <section><h3 className="font-black">Equipment</h3><FacilityLookup label="Equipment" options={EQUIPMENT_OPTIONS} selected={equipmentFilters} onChange={setEquipmentFilters} dark allowCustom={false}/></section>
        <section><h3 className="font-black">Amenities</h3><FacilityLookup label="Amenities" options={AMENITY_OPTIONS} selected={amenityFilters} onChange={setAmenityFilters} dark allowCustom={false}/></section>
      </div>
      <div className="z-20 flex shrink-0 items-center justify-between border-t border-white/10 bg-[#111411] p-4 text-white">
        <button
          type="button"
          onClick={clear}
          className="filter-clear-all inline-flex h-11 items-center justify-center rounded-full border border-white px-6 py-0 font-black text-white transition-colors"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={apply}
          className="filter-show-results h-11 rounded-full bg-[#22c55e] px-6 py-0 font-black text-black"
        >
          Show {resultCount} {resultCount === 1 ? "result" : "results"}
        </button>
      </div>
    </Shell>
  );
}
