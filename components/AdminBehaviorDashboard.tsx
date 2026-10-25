"use client";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

type TrendMetric =
  | "users"
  | "uniqueVisitors"
  | "gymProfilesOpened"
  | "uniqueDayPassClickers"
  | "confirmedDayPasses"
  | "uniqueMembershipClickers"
  | "confirmedMemberships";
type Point = {
  date: string;
  users: number;
  uniqueVisitors: number;
  gymProfilesOpened: number;
  uniqueDayPassClickers: number;
  confirmedDayPasses: number;
  uniqueMembershipClickers: number;
  confirmedMemberships: number;
  changed: TrendMetric[];
};
type ClaimUser = {
  email: string;
  clicks: number;
  clickTimestamps: string[];
  status: "confirmed" | "declined" | "unsure";
};
type GymMetric = {
  gymId: string;
  name: string;
  reportEmail: string;
  opens: number;
  favorites: number;
  compares: number;
  dayPassClicks: number;
  websiteVisits: number;
  confirmedClaims: number;
  signups: number;
  membershipClicks: number;
  confirmedMemberships: number;
  membershipSignups: number;
  claimUsers: ClaimUser[];
};
type ClaimClickLog = {
  id: string;
  email: string | null;
  gymId: string | null;
  gym: string;
  offer: string;
  gymResponse: "Purchased" | "Not Purchased" | "Active" | "Inactive" | null;
  clickedAt: string;
  status: "confirmed" | "user_reported" | "unconfirmed";
  userStatus: "confirmed" | "declined" | "unsure";
  gymConfirmed: boolean;
  userConfirmed: boolean;
  userConfirmedAt: string | null;
  gymConfirmedAt: string | null;
  confirmationAt: string | null;
  claimType?: "Day pass" | "Membership";
};
type CityMetric = {
  city: string;
  state: string;
  country: string;
  count: number;
};
type Data = {
  days: number;
  summary: Record<string, number>;
  gyms: GymMetric[];
  claimClickLogs: ClaimClickLog[];
  membershipClickLogs: ClaimClickLog[];
  filters: { name: string; uses: number }[];
  cities: CityMetric[];
  userGrowth: { date: string; users: number }[];
  trendData: Point[];
};
const labels: Record<string, string> = {
  visitors: "Unique visitors",
  visits: "Visits",
  returningVisits: "Repeat visits",
  gymOpens: "Gym profiles opened",
  directionsClicks: "Directions clicks",
  favoritesAdded: "Favorites added",
  favoritesRemoved: "Favorites removed",
  comparisons: "Gyms compared",
  compareViews: "Comparison views",
  dayPassClicks: "Day-pass clicks",
  uniqueDayPassClickers: "Unique Claim Day Pass clickers",
  dayPassClaims: "Confirmed day passes",
  gymConfirmedDayPasses: "Confirmed day passes by gym",
  uniqueDayPassClaimers: "Users who got a day pass",
  dayPassSignups: "Signups after day-pass click",
  membershipClicks: "Membership clicks",
  uniqueMembershipClickers: "Unique Claim Membership clickers",
  membershipClaims: "Confirmed memberships",
  gymConfirmedMemberships: "Confirmed memberships by gym",
  uniqueMembershipClaimers: "Users who got a membership",
  membershipSignups: "Signups after membership click",
  filterUses: "Filter changes",
  locationSearches: "Location searches",
};
const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const trendMetrics: { key: TrendMetric; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "uniqueVisitors", label: "Unique visitors" },
  { key: "gymProfilesOpened", label: "Gym profiles opened" },
  { key: "uniqueDayPassClickers", label: "Unique Claim Day Pass clickers" },
  { key: "confirmedDayPasses", label: "Confirmed day passes" },
  {
    key: "uniqueMembershipClickers",
    label: "Unique Claim Membership clickers",
  },
  { key: "confirmedMemberships", label: "Confirmed memberships" },
];
function UserGrowthChart({ points }: { points: Point[] }) {
  const viewport = useRef<HTMLDivElement>(null),
    plot = useRef<HTMLDivElement>(null),
    scrubbing = useRef(false),
    [viewportWidth, setViewportWidth] = useState(800),
    [metric, setMetric] = useState<TrendMetric>("users"),
    [tip, setTip] = useState<{ x: number; y: number; point: Point } | null>(
      null,
    ),
    [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    setViewportWidth(Math.max(320, node.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(Math.max(320, entry.contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [metric]);
  const metricLabel = trendMetrics.find((item) => item.key === metric)!.label,
    changedPoints = points.filter((point) => point.changed.includes(metric)),
    boundaryPoints = points.length > 1 ? [points[0], points.at(-1)!] : points,
    visiblePoints = changedPoints.length ? changedPoints : boundaryPoints,
    first = visiblePoints.length
      ? Date.parse(`${visiblePoints[0].date}T00:00:00Z`)
      : Date.now(),
    last = visiblePoints.length
      ? Date.parse(`${visiblePoints.at(-1)!.date}T00:00:00Z`)
      : first,
    width = viewportWidth,
    height = 260,
    p = { l: 48, r: 24, t: 24, b: 42 },
    values = visiblePoints.map((point) => point[metric]),
    max = Math.max(1, ...values),
    rawMin = Math.min(...values),
    min = values.length > 1 && rawMin < max ? rawMin : 0,
    constant =
      values.length > 1 && values.every((value) => value === values[0]);
  const x = (date: string) =>
      first === last
        ? (p.l + width - p.r) / 2
        : p.l +
          ((Date.parse(`${date}T00:00:00Z`) - first) / (last - first)) *
            (width - p.l - p.r),
    y = (value: number) =>
      visiblePoints.length === 1 || constant
        ? p.t + (height - p.t - p.b) / 2
        : p.t + ((max - value) / Math.max(1, max - min)) * (height - p.t - p.b),
    path = visiblePoints
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${x(point.date)},${y(point[metric])}`,
      )
      .join(" ");
  const tipFromClientX = (clientX: number) => {
    const node = plot.current;
    if (!node || !visiblePoints.length) return;
    const rect = node.getBoundingClientRect(),
      localX = Math.max(p.l, Math.min(width - p.r, clientX - rect.left)),
      point = visiblePoints.reduce((closest, candidate) =>
        Math.abs(x(candidate.date) - localX) <
        Math.abs(x(closest.date) - localX)
          ? candidate
          : closest,
      );
    setTip({ x: x(point.date), y: y(point[metric]), point });
  };
  const startScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    scrubbing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setShowGuide(true);
    tipFromClientX(event.clientX);
  };
  const moveScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    event.preventDefault();
    tipFromClientX(event.clientX);
  };
  const endScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelScrub = () => {
    scrubbing.current = false;
    setTip(null);
    setShowGuide(false);
  };
  useEffect(() => {
    setTip(null);
    setShowGuide(false);
  }, [width, visiblePoints.length, metric]);
  return (
    <section className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-white/[.04]">
      <div className="border-b border-black/5 p-5 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-black">{metricLabel} over time</h3>
          <label className="relative inline-flex items-center">
            <span className="sr-only">Metric</span>
            <select value={metric} onChange={(event) => setMetric(event.target.value as TrendMetric)} className="min-w-56 appearance-none rounded-lg border border-black/10 bg-transparent py-2 pl-3 pr-9 text-left text-sm font-semibold text-black outline-none transition hover:border-[#22c55e] focus:border-[#22c55e] dark:border-white/15 dark:text-white">
              {trendMetrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          </label>
        </div>
      </div>
      {!visiblePoints.length ? (
        <p className="p-8 text-center text-sm text-zinc-500">
          No {metricLabel.toLowerCase()} history is available for this period.
        </p>
      ) : (
        <div ref={viewport} className="overflow-hidden">
          <div
            ref={plot}
            className="admin-trend-plot relative"
            style={{ width, height }}
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={cancelScrub}
            onMouseLeave={() => {
              if (!scrubbing.current) {
                setTip(null);
                setShowGuide(false);
              }
            }}
          >
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`${metricLabel} over time`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const lineY = p.t + ratio * (height - p.t - p.b),
                  value = Math.round(max - (max - min) * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={p.l}
                      x2={width - p.r}
                      y1={lineY}
                      y2={lineY}
                      className="stroke-zinc-200 dark:stroke-white/10"
                    />
                    <text
                      x={p.l - 9}
                      y={lineY + 4}
                      textAnchor="end"
                      className="fill-zinc-400 text-[10px]"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}
              <path
                d={path}
                fill="none"
                stroke="#22c55e"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {showGuide && tip && (
                <line
                  x1={tip.x}
                  x2={tip.x}
                  y1={p.t}
                  y2={height - p.b}
                  stroke="#22c55e"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity=".8"
                />
              )}
              {visiblePoints.map((point) => {
                const pointX = x(point.date),
                  pointY = y(point[metric]);
                return (
                  <circle
                    key={point.date}
                    cx={pointX}
                    cy={pointY}
                    r="5"
                    fill="#22c55e"
                    stroke="#111411"
                    strokeWidth="2"
                    className="cursor-pointer"
                    tabIndex={0}
                    onMouseEnter={() => {
                      setShowGuide(false);
                      setTip({ x: pointX, y: pointY, point });
                    }}
                    onFocus={() => {
                      setShowGuide(false);
                      setTip({ x: pointX, y: pointY, point });
                    }}
                  >
                    <title>
                      {formatDate(point.date)}: {point[metric].toLocaleString()}
                    </title>
                  </circle>
                );
              })}
              <text
                x={first === last ? width / 2 : p.l}
                y={height - 14}
                textAnchor={first === last ? "middle" : "start"}
                className="fill-zinc-500 text-[10px]"
              >
                {formatDate(visiblePoints[0].date)}
              </text>
              {first !== last && (
                <text
                  x={width - p.r}
                  y={height - 14}
                  textAnchor="end"
                  className="fill-zinc-500 text-[10px]"
                >
                  {formatDate(visiblePoints.at(-1)!.date)}
                </text>
              )}
            </svg>
            {tip && (
              <div
                className={`pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-xl border border-white/10 bg-[#111411] px-3 py-2 text-center text-xs text-white shadow-xl ${tip.y < 82 ? "translate-y-3" : "-translate-y-[calc(100%+12px)]"}`}
                style={{
                  left: Math.max(80, Math.min(width - 80, tip.x)),
                  top: tip.y,
                }}
              >
                <b className="block text-sm">
                  {tip.point[metric].toLocaleString()}
                </b>
                <span className="text-white/60">
                  {formatDate(tip.point.date)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const headerDescriptions: Record<string, string> = {
  Gym: "The gym represented by this row.",
  "Profile opens": "The number of unique users who clicked the gym listing.",
  Favorites: "The number of unique users who favorited the gym.",
  Compared: "The number of unique users who added the gym to a comparison.",
  "Day-pass clicks / confirms":
    "Unique users who clicked Claim Day Pass, followed by unique users who confirmed getting a day pass.",
  "Website visits":
    "The number of unique users who followed the gym website link.",
  "Day-pass signups":
    "The number of unique users who created an account after clicking Claim Day Pass.",
  "Day-pass rate":
    "Unique Claim Day Pass clickers divided by unique profile openers.",
  "Membership clicks / confirms":
    "Unique users who clicked Claim Membership, followed by unique users who confirmed getting a membership.",
  "Membership signups":
    "The number of unique users who created an account after clicking Claim Membership.",
  "Membership rate":
    "Unique Claim Membership clickers divided by unique profile openers.",
};
type HeaderTip = { label: string; left: number; top: number };
function MetricHeader({
  label,
  setTip,
}: {
  label: string;
  setTip: Dispatch<SetStateAction<HeaderTip | null>>;
}) {
  const usesTap = () =>
      window.matchMedia("(max-width: 767px), (hover: none), (pointer: coarse)")
        .matches,
    position = (button: HTMLButtonElement) => {
      const rect = button.getBoundingClientRect();
      return {
        label,
        left: Math.max(
          140,
          Math.min(window.innerWidth - 140, rect.left + rect.width / 2),
        ),
        top: rect.bottom + 8,
      };
    };
  return (
    <th>
      <button
        type="button"
        className="admin-gym-funnel-header inline-flex items-center gap-1 border-b border-dotted border-zinc-400 text-left transition hover:text-[#22c55e]"
        onClick={(event) => {
          window.dispatchEvent(
            new CustomEvent("gym_funnel_sort", { detail: label }),
          );
          if (usesTap()) {
            const next = position(event.currentTarget);
            setTip((current) => (current?.label === label ? null : next));
          }
        }}
        onMouseEnter={(event) => {
          if (!usesTap()) setTip(position(event.currentTarget));
        }}
        onMouseLeave={() => {
          if (!usesTap()) setTip(null);
        }}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">
          ↕
        </span>
      </button>
    </th>
  );
}
function GymDemandFunnel({ gyms, days }: { gyms: GymMetric[]; days: number }) {
  const [lookup, setLookup] = useState(""),
    [selected, setSelected] = useState<GymMetric | null>(null),
    [copied, setCopied] = useState(false),
    [headerTip, setHeaderTip] = useState<HeaderTip | null>(null),
    [page, setPage] = useState(1),
    [sortLabel, setSortLabel] = useState("Profile opens"),
    [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const sortValue = (gym: GymMetric) =>
    sortLabel === "Gym"
      ? gym.name
      : sortLabel === "Profile opens"
        ? gym.opens
        : sortLabel === "Favorites"
          ? gym.favorites
          : sortLabel === "Compared"
            ? gym.compares
            : sortLabel === "Day-pass clicks / confirms"
              ? gym.dayPassClicks
              : sortLabel === "Website visits"
                ? gym.websiteVisits
                : sortLabel === "Day-pass signups"
                  ? gym.signups
                  : sortLabel === "Membership clicks / confirms"
                    ? gym.membershipClicks
                    : sortLabel === "Membership signups"
                      ? gym.membershipSignups
                      : sortLabel === "Membership rate"
                        ? gym.opens
                          ? gym.membershipClicks / gym.opens
                          : 0
                        : gym.opens
                          ? gym.dayPassClicks / gym.opens
                          : 0;
  const matching = lookup.trim()
      ? gyms.filter((gym) =>
          gym.name.toLowerCase().includes(lookup.trim().toLowerCase()),
        )
      : gyms,
    filtered = [...matching].sort((a, b) => {
      const left = sortValue(a),
        right = sortValue(b),
        comparison =
          typeof left === "string" && typeof right === "string"
            ? left.localeCompare(right)
            : Number(left) - Number(right);
      return sortDirection === "asc" ? comparison : -comparison;
    }),
    totalPages = Math.max(1, Math.ceil(filtered.length / 5)),
    shown = filtered.slice((page - 1) * 5, page * 5);
  useEffect(() => setPage(1), [lookup, gyms]);
  useEffect(() => {
    const sort = (event: Event) => {
      const label = (event as CustomEvent<string>).detail;
      setPage(1);
      setSortDirection((current) =>
        label === sortLabel ? (current === "desc" ? "asc" : "desc") : "desc",
      );
      setSortLabel(label);
    };
    window.addEventListener("gym_funnel_sort", sort);
    return () => window.removeEventListener("gym_funnel_sort", sort);
  }, [sortLabel]);
  useEffect(() => {
    if (selected)
      setSelected(gyms.find((gym) => gym.gymId === selected.gymId) ?? null);
  }, [gyms]);
  useEffect(() => {
    if (
      !headerTip ||
      !window.matchMedia("(max-width: 767px), (hover: none), (pointer: coarse)")
        .matches
    )
      return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(
          target instanceof Element &&
          target.closest(".admin-gym-funnel-header")
        )
      )
        setHeaderTip(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [headerTip]);
  const periodLabel =
    days === 7
      ? "Past week"
      : days === 30
        ? "Past month"
        : days === 365
          ? "Past year"
          : "All time";
  const userActivity = selected?.claimUsers.length
    ? selected.claimUsers
        .map(
          (user) =>
            `Email: ${user.email}\nClicked Claim Day Pass: Yes\nClick timestamp${user.clickTimestamps.length === 1 ? "" : "s"}: ${user.clickTimestamps.map((timestamp) => new Date(timestamp).toLocaleString()).join("; ")}`,
        )
        .join("\n\n")
    : "No identifiable users clicked Claim Day Pass during this reporting period.";
  const report = selected
    ? `Send to: ${selected.reportEmail || "No email available"}\n\n${selected.name} — Browsegyms demand report\nReporting period: ${periodLabel}\n\nUnique users who opened the listing: ${selected.opens}\nUnique users who favorited the listing: ${selected.favorites}\nUnique users who compared the gym: ${selected.compares}\nUnique users who clicked Claim Day Pass: ${selected.dayPassClicks}\nUnique users who visited the gym website: ${selected.websiteVisits}\nUnique users who confirmed getting a day pass: ${selected.confirmedClaims}\nUsers who signed up after clicking Claim Day Pass: ${selected.signups}\nClaim-click rate: ${selected.opens ? Math.round((selected.dayPassClicks / selected.opens) * 100) : 0}%\n\nThis report measures unique users during the selected reporting period.\n\nUser Claim Day Pass activity\n\n${userActivity}`
    : "";
  const copy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const status = (value: ClaimUser["status"]) =>
    value === "confirmed"
      ? { icon: "✓", label: "Confirmed", className: "text-[#22c55e]" }
      : value === "declined"
        ? { icon: "×", label: "Did not get pass", className: "text-red-400" }
        : { icon: "?", label: "Unsure", className: "text-amber-400" };
  return (
    <section className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-white/[.04]">
      {headerTip &&
        typeof document !== "undefined" &&
        (window.matchMedia(
          "(max-width: 767px), (hover: none), (pointer: coarse)",
        ).matches ? (
          createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed inset-x-4 z-[10000] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-white/10 bg-[#111411] px-4 py-3 text-sm font-medium normal-case leading-6 text-white shadow-2xl"
              style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {headerDescriptions[headerTip.label]}
            </div>,
            document.body,
          )
        ) : (
          <div
            role="tooltip"
            className="admin-gym-funnel-tooltip pointer-events-none fixed z-[5000] w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-[#111411] px-3 py-2 text-xs normal-case leading-5 text-white shadow-2xl"
            style={{ left: headerTip.left, top: headerTip.top }}
          >
            {headerDescriptions[headerTip.label]}
          </div>
        ))}
      <div className="border-b border-black/5 p-5 dark:border-white/10">
        <h3 className="font-black">Gym demand funnel</h3>
        <input
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          className="mt-4 w-full rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-[#22c55e] dark:border-white/15"
          placeholder="Look up a gym"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="admin-gym-funnel-table w-full min-w-[1320px] table-fixed text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500 [&_th]:px-4 [&_th]:py-4 [&_th]:align-bottom [&_th]:leading-4">
            <tr>
              {[
                "Gym",
                "Profile opens",
                "Favorites",
                "Compared",
                "Website visits",
                "Day-pass clicks / confirms",
                "Day-pass signups",
                "Day-pass rate",
                "Membership clicks / confirms",
                "Membership signups",
                "Membership rate",
              ].map((label) => (
                <MetricHeader key={label} label={label} setTip={setHeaderTip} />
              ))}
            </tr>
          </thead>
          <tbody className="[&_td]:px-4 [&_td]:py-4">
            {shown.map((g) => (
              <tr
                key={g.gymId}
                className="border-t border-black/5 dark:border-white/10"
              >
                <td>
                  <Link href={`/admin/gyms/${g.gymId}`} className="font-bold transition hover:text-[#22c55e]">
                    {g.name}
                  </Link>
                </td>
                <td>{g.opens}</td>
                <td>{g.favorites}</td>
                <td>{g.compares}</td>
                <td>{g.websiteVisits}</td>
                <td>
                  <span className="font-semibold">{g.dayPassClicks}</span>
                  <span className="mx-1.5 text-zinc-400">/</span>
                  <span>{g.confirmedClaims}</span>
                </td>
                <td>{g.signups}</td>
                <td>
                  {g.opens ? Math.round((g.dayPassClicks / g.opens) * 100) : 0}%
                </td>
                <td>
                  <span className="font-semibold">{g.membershipClicks}</span>
                  <span className="mx-1.5 text-zinc-400">/</span>
                  <span>{g.confirmedMemberships}</span>
                </td>
                <td>{g.membershipSignups}</td>
                <td>
                  {g.opens
                    ? Math.round((g.membershipClicks / g.opens) * 100)
                    : 0}
                  %
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-zinc-500">
                  No gym matches that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 5 && (
        <div className="flex items-center justify-center gap-3 border-t border-black/5 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] hover:font-black hover:ring-1 hover:ring-[#22c55e] disabled:opacity-40 dark:border-white/15"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] hover:font-black hover:ring-1 hover:ring-[#22c55e] disabled:opacity-40 dark:border-white/15"
          >
            Next
          </button>
        </div>
      )}
      {selected && (
        <div className="border-t border-black/5 p-5 dark:border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-black">{selected.name} report</h4>
              <p className="text-xs text-zinc-500">
                Ready to copy into an email to the gym.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="rounded-full border border-[#22c55e] px-4 py-2 text-sm font-bold text-[#22c55e] transition hover:bg-[#22c55e] hover:text-black"
              >
                {copied ? "Copied!" : "Copy report"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-zinc-500 transition hover:border-white hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
          <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-black/5 bg-zinc-50 p-4 font-sans text-sm leading-6 dark:border-white/10 dark:bg-black/20">
            {report}
          </pre>
          <h5 className="mt-6 font-black">Users who clicked Claim Day Pass</h5>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-2">Email</th>
                  <th>Clicks</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selected.claimUsers.map((user) => {
                  const detail = status(user.status);
                  return (
                    <tr
                      key={user.email}
                      className="border-t border-black/5 dark:border-white/10"
                    >
                      <td className="py-3 font-semibold">{user.email}</td>
                      <td>{user.clicks}</td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-2 font-bold ${detail.className}`}
                        >
                          <span className="text-lg">{detail.icon}</span>
                          {detail.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!selected.claimUsers.length && (
                  <tr>
                    <td colSpan={3} className="py-5 text-zinc-500">
                      No identifiable account holders clicked this gym&apos;s
                      day-pass button.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function ClaimClickLogTable({
  logs,
}: {
  logs: ClaimClickLog[];
  onGymConfirmationChange?: (
    claimType: "Day pass" | "Membership",
    gymDelta: number,
    combinedDelta: number,
  ) => void;
}) {
  type LogSort =
    | "gym"
    | "offer"
    | "clickedAt"
    | "confirmationAt";
  type GymDetailSort = "offer" | "clickedAt" | "gymResponse" | "gymConfirmedAt";
  const [page, setPage] = useState(1),
    [sort, setSort] = useState<{ key: LogSort; direction: "asc" | "desc" }>({
      key: "clickedAt",
      direction: "desc",
    }),
    [emailLookup, setEmailLookup] = useState(""),
    [selectedGymId, setSelectedGymId] = useState<string | null>(null),
    [selectedGymPage, setSelectedGymPage] = useState(1),
    [gymDetailSort, setGymDetailSort] = useState<{ key: GymDetailSort; direction: "asc" | "desc" } | null>(null),
    matchingLogs = emailLookup.trim()
      ? logs.filter((log) =>
          log.email?.toLowerCase().includes(emailLookup.trim().toLowerCase()),
        )
      : logs,
    pageSize = 5,
    sorted = [...matchingLogs].sort((a, b) => {
      const raw =
        sort.key === "gym"
          ? a.gym.localeCompare(b.gym)
          : sort.key === "offer"
            ? a.offer.localeCompare(b.offer)
            : sort.key === "clickedAt"
              ? Date.parse(a.clickedAt) - Date.parse(b.clickedAt)
              : (a.confirmationAt ? Date.parse(a.confirmationAt) : 0) -
                (b.confirmationAt ? Date.parse(b.confirmationAt) : 0);
      return sort.direction === "asc" ? raw : -raw;
    }),
    totalPages = Math.max(1, Math.ceil(sorted.length / pageSize)),
    shown = sorted.slice((page - 1) * pageSize, page * pageSize),
    confirmedDayPasses = logs.filter(
      (log) => log.claimType === "Day pass" && log.status === "confirmed",
    ).length,
    confirmedMemberships = logs.filter(
      (log) => log.claimType === "Membership" && log.status === "confirmed",
    ).length,
    gymConfirmedDayPasses = logs.filter(
      (log) => log.claimType === "Day pass" && log.gymConfirmed,
    ).length,
    gymConfirmedMemberships = logs.filter(
      (log) => log.claimType === "Membership" && log.gymConfirmed,
    ).length;
  const selectedGymLogs = selectedGymId
      ? logs
          .filter((log) => log.gymId === selectedGymId)
          .sort((a, b) => Date.parse(b.clickedAt) - Date.parse(a.clickedAt))
      : [],
    selectedGymName = selectedGymLogs[0]?.gym || "Gym",
    selectedGymConfirmations = selectedGymLogs.filter(
      (log) => log.status === "confirmed",
    ).length,
    orderedSelectedGymLogs = gymDetailSort
      ? [...selectedGymLogs].sort((a, b) => {
          let raw: number;
          if (gymDetailSort.key === "gymResponse") {
            const rank = gymDetailSort.direction === "desc"
              ? { Purchased: 0, Active: 1, "Not Purchased": 2, Inactive: 3, Unanswered: 4 }
              : { "Not Purchased": 0, Inactive: 1, Purchased: 2, Active: 3, Unanswered: 4 };
            return rank[a.gymResponse ?? "Unanswered"] - rank[b.gymResponse ?? "Unanswered"] || Date.parse(b.clickedAt) - Date.parse(a.clickedAt);
          }
          if (gymDetailSort.key === "offer") raw = a.offer.localeCompare(b.offer);
          else if (gymDetailSort.key === "clickedAt") raw = Date.parse(a.clickedAt) - Date.parse(b.clickedAt);
          else {
            if (!a.gymConfirmedAt && !b.gymConfirmedAt) return Date.parse(b.clickedAt) - Date.parse(a.clickedAt);
            if (!a.gymConfirmedAt) return 1;
            if (!b.gymConfirmedAt) return -1;
            raw = Date.parse(a.gymConfirmedAt) - Date.parse(b.gymConfirmedAt);
          }
          return (gymDetailSort.direction === "asc" ? raw : -raw) || Date.parse(b.clickedAt) - Date.parse(a.clickedAt);
        })
      : selectedGymLogs,
    selectedGymPageSize = 10,
    selectedGymTotalPages = Math.max(1, Math.ceil(orderedSelectedGymLogs.length / selectedGymPageSize)),
    shownSelectedGymLogs = orderedSelectedGymLogs.slice((selectedGymPage - 1) * selectedGymPageSize, selectedGymPage * selectedGymPageSize);
  useEffect(() => setPage(1), [logs]);
  useEffect(() => setPage(1), [emailLookup]);
  useEffect(() => {
    setSelectedGymPage(1);
    setGymDetailSort(null);
  }, [selectedGymId]);
  const sortGymDetailBy = (key: GymDetailSort) => {
    setSelectedGymPage(1);
    setGymDetailSort(current => current?.key === key
      ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
      : { key, direction: key === "offer" ? "asc" : "desc" });
  };
  const gymDetailSortHeader = (key: GymDetailSort, label: string) => <button type="button" onClick={() => sortGymDetailBy(key)} className={`font-bold transition hover:text-[#22c55e] ${gymDetailSort?.key === key ? "text-[#22c55e]" : ""}`}>{label} {gymDetailSort?.key === key ? (gymDetailSort.direction === "asc" ? "↑" : "↓") : "↕"}</button>;
  const sortBy = (key: LogSort) => {
      setPage(1);
      setSort((current) =>
        current.key === key
          ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
          : { key, direction: key === "gym" ? "asc" : "desc" },
      );
    },
    sortHeader = (key: LogSort, label: string) => (
      <button
        type="button"
        onClick={() => sortBy(key)}
        className="inline-flex items-center gap-1 font-bold transition hover:text-[#22c55e]"
      >
        {label}
        <span aria-hidden="true">
          {sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  return (
    <section className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-white/[.04]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 p-5 dark:border-white/10">
        <div className="min-w-[240px] flex-1">
          <h3 className="font-black">Claim activity log</h3>
          <input
            type="search"
            value={emailLookup}
            onChange={(event) => setEmailLookup(event.target.value)}
            placeholder="Look up a user email"
            aria-label="Look up claim activity by user email"
            className="mt-3 w-full max-w-md rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-[#22c55e] dark:border-white/15"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="rounded-full border border-[#22c55e]/40 bg-[#22c55e]/10 px-4 py-2 text-sm font-black text-[#16803d] dark:text-[#86efac]">
            Confirmed day passes: {confirmedDayPasses.toLocaleString()}
          </div>
          <div className="rounded-full border border-[#22c55e]/40 bg-[#22c55e]/10 px-4 py-2 text-sm font-black text-[#16803d] dark:text-[#86efac]">
            Confirmed memberships: {confirmedMemberships.toLocaleString()}
          </div>
          <div className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/15">
            Day passes confirmed by gym:{" "}
            {gymConfirmedDayPasses.toLocaleString()}
          </div>
          <div className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/15">
            Memberships confirmed by gym:{" "}
            {gymConfirmedMemberships.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="p-4">User email</th>
              <th>{sortHeader("gym", "Gym listing")}</th>
              <th>{sortHeader("offer", "Offer")}</th>
              <th>{sortHeader("clickedAt", "Clicked")}</th>
              <th>Confirmed by</th>
              <th>{sortHeader("confirmationAt", "Confirmed at")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((log) => {
              return (
                <tr
                  key={`${log.claimType}-${log.id}`}
                  className="border-t border-black/5 dark:border-white/10"
                >
                  <td className="p-4 font-semibold">
                    {log.email || "Email unavailable"}
                  </td>
                  <td>
                    {log.gymId ? (
                      <button
                        type="button"
                        onClick={() => setSelectedGymId(log.gymId)}
                        className="font-semibold underline decoration-zinc-400 underline-offset-4 transition hover:text-[#22c55e]"
                      >
                        {log.gym}
                      </button>
                    ) : (
                      log.gym
                    )}
                  </td>
                  <td>{log.offer}</td>
                  <td>{new Date(log.clickedAt).toLocaleString()}</td>
                  <td
                    className={
                      log.gymConfirmed || log.userConfirmed
                        ? "font-bold text-[#22c55e]"
                        : "text-zinc-500"
                    }
                  >
                    {log.gymConfirmed ? "Gym" : log.userConfirmed ? "User" : ""}
                  </td>
                  <td>
                    {log.confirmationAt
                      ? new Date(log.confirmationAt).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500">
                  No claim clicks were recorded during this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {logs.length > pageSize && (
        <div className="flex items-center justify-center gap-3 border-t border-black/5 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] hover:font-black hover:ring-1 hover:ring-[#22c55e] disabled:opacity-40 dark:border-white/15"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] hover:font-black hover:ring-1 hover:ring-[#22c55e] disabled:opacity-40 dark:border-white/15"
          >
            Next
          </button>
        </div>
      )}
      {selectedGymId && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/75 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedGymId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedGymName} claim activity`}
            className="scrollbar-slim max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111411] text-white shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-white/10 bg-[#111411] p-5">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-black"><Link href={`/admin/gyms/${selectedGymId}`} className="transition hover:text-[#22c55e]">{selectedGymName}</Link></h3>
                  <span className="rounded-full border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-1 text-xs font-black text-[#86efac]">
                    {selectedGymConfirmations.toLocaleString()} confirmation{selectedGymConfirmations === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  Users who clicked Claim Day Pass or Claim Membership
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGymId(null)}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 p-0 text-xl leading-none transition hover:border-white"
                >
                  <span aria-hidden="true" className="block leading-none">
                    ×
                  </span>
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="text-left text-xs uppercase text-white/45">
                  <tr>
                    <th className="p-4">User email</th>
                    <th>{gymDetailSortHeader("offer", "Offer")}</th>
                    <th>{gymDetailSortHeader("clickedAt", "Clicked")}</th>
                    <th>{gymDetailSortHeader("gymResponse", "Gym response")}</th>
                    <th>{gymDetailSortHeader("gymConfirmedAt", "Gym confirmed at")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownSelectedGymLogs.map((log) => (
                    <tr key={`${log.claimType}-${log.id}`} className="border-t border-white/10">
                      <td className="p-4 font-semibold">{log.email || "Email unavailable"}</td>
                      <td>{log.offer}</td>
                      <td>{new Date(log.clickedAt).toLocaleString()}</td>
                      <td className={log.gymResponse&&["Purchased","Active"].includes(log.gymResponse) ? "font-bold text-[#22c55e]" : log.gymResponse&&["Not Purchased","Inactive"].includes(log.gymResponse) ? "font-bold text-red-300" : "text-white/45"}>{log.gymResponse ?? "—"}</td>
                      <td>{log.gymConfirmedAt ? new Date(log.gymConfirmedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {!orderedSelectedGymLogs.length && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-white/50">
                        No referral activity is available for this gym.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {orderedSelectedGymLogs.length > selectedGymPageSize && <div className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-3"><button type="button" disabled={selectedGymPage === 1} onClick={() => setSelectedGymPage(current => Math.max(1, current - 1))} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="text-xs text-white/50">Page {selectedGymPage} of {selectedGymTotalPages}</span><button type="button" disabled={selectedGymPage === selectedGymTotalPages} onClick={() => setSelectedGymPage(current => Math.min(selectedGymTotalPages, current + 1))} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] disabled:cursor-not-allowed disabled:opacity-40">Next</button></div>}
          </div>
        </div>
      )}
    </section>
  );
}

function PopularCitiesTable({ cities }: { cities: CityMetric[] }) {
  type CitySort = "popularity" | "state" | "country";
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [sort, setSort] = useState<{ key: CitySort; direction: "asc" | "desc" }>({
      key: "popularity",
      direction: "desc",
    }),
    pageSize = 10,
    filtered = cities.filter((item) =>
      `${item.city} ${item.state} ${item.country}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ),
    sorted = [...filtered].sort((a, b) => {
      const raw =
        sort.key === "state"
          ? (a.state || "").localeCompare(b.state || "") ||
            a.city.localeCompare(b.city)
          : sort.key === "country"
            ? (a.country || "").localeCompare(b.country || "") ||
              (a.state || "").localeCompare(b.state || "") ||
              a.city.localeCompare(b.city)
            : a.count - b.count;
      return sort.direction === "asc" ? raw : -raw;
    }),
    totalPages = Math.max(1, Math.ceil(sorted.length / pageSize)),
    shown = sorted.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [query, cities]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const sortBy = (key: CitySort) => {
      setPage(1);
      setSort((current) =>
        current.key === key
          ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
          : { key, direction: key === "popularity" ? "desc" : "asc" },
      );
    },
    header = (key: CitySort, label: string) => (
      <button
        type="button"
        onClick={() => sortBy(key)}
        className="inline-flex items-center gap-1 font-bold transition hover:text-[#22c55e]"
      >
        {label}
        <span aria-hidden="true">
          {sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  return (
    <section className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-white/[.04]">
      <div className="border-b border-black/5 p-5 dark:border-white/10">
        <h3 className="font-black">Popular cities</h3>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Look up a city"
          aria-label="Look up location searches by city"
          className="mt-3 w-full max-w-md rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-[#22c55e] dark:border-white/15"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-5 py-3">City</th>
              <th className="px-5 py-3">{header("state", "State")}</th>
              <th className="px-5 py-3">{header("country", "Country")}</th>
              <th className="px-5 py-3 text-right">
                {header("popularity", "Unique users")}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr
                key={`${item.city}|${item.state}|${item.country}`}
                className="border-t border-black/5 dark:border-white/10"
              >
                <td className="px-5 py-3 font-bold">{item.city}</td>
                <td className="px-5 py-3">{item.state || "—"}</td>
                <td className="px-5 py-3">{item.country || "—"}</td>
                <td className="px-5 py-3 text-right font-black">
                  {item.count.toLocaleString()}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-zinc-500">
                  No city searches were recorded during this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > pageSize && (
        <div className="flex items-center justify-center gap-3 border-t border-black/5 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] hover:font-black hover:ring-1 hover:ring-[#22c55e] disabled:opacity-40 dark:border-white/15"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition hover:border-[#22c55e] hover:font-black hover:ring-1 hover:ring-[#22c55e] disabled:opacity-40 dark:border-white/15"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

export default function AdminBehaviorDashboard({
  compact = false,
  periodDays = 0,
}: {
  compact?: boolean;
  periodDays?: number;
}) {
  const router = useRouter(),
    [data, setData] = useState<Data | null>(null),
    days = periodDays,
    setDays = (_days: number) => {},
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/behavior?days=${days}`, {
            cache: "no-store",
          }),
          body = await response.text();
        let payload: Data | { error?: string };
        try {
          payload = body
            ? JSON.parse(body)
            : { error: "The server returned an empty response." };
        } catch {
          throw new Error("The server returned an invalid response.");
        }
        if (!response.ok)
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : `Unable to load behavior data (${response.status}).`,
          );
        if (active) setData(payload as Data);
      } catch (reason) {
        if (active) {
          setData(null);
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load behavior data.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days, attempt]);
  const compactKeys = [
      "visitors",
      "visits",
      "gymOpens",
      "directionsClicks",
      "favoritesAdded",
      "comparisons",
      "uniqueDayPassClickers",
      "uniqueDayPassClaimers",
      "dayPassSignups",
      "uniqueMembershipClickers",
      "uniqueMembershipClaimers",
      "membershipSignups",
    ],
    entries = Object.entries(data?.summary ?? {}).filter(
      ([key]) => !compact || compactKeys.includes(key),
    );
  return (
    <div className={compact ? "space-y-5" : "space-y-8"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Landing-page demand</h2>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold dark:border-white/15 dark:bg-white/5"
        >
          <option value={7}>Past week</option>
          <option value={30}>Past month</option>
          <option value={365}>Past year</option>
          <option value={0}>All time</option>
        </select>
      </div>
      {loading ? (
        <div className="rounded-2xl border p-10 text-center text-zinc-500 dark:border-white/10">
          Loading behavior…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-8 text-center">
          <p className="font-bold text-red-600 dark:text-red-300">
            Behavior data couldn&apos;t be loaded
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-white/55">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-5 rounded-full bg-[#22c55e] px-5 py-2.5 text-sm font-black text-black"
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <div className="rounded-2xl border p-10 text-center text-zinc-500">
          No behavior data is available.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[.04]"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {labels[key] || key}
                </p>
                <p className="mt-2 text-3xl font-black">
                  {value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <UserGrowthChart points={data.trendData} />
          <GymDemandFunnel gyms={data.gyms} days={data.days} />
          <ClaimClickLogTable
            logs={[
              ...data.claimClickLogs.map((log) => ({
                ...log,
                claimType: "Day pass" as const,
              })),
              ...data.membershipClickLogs.map((log) => ({
                ...log,
                claimType: "Membership" as const,
              })),
            ]}
            onGymConfirmationChange={(claimType, gymDelta, combinedDelta) => {
              setData((current) => {
                if (!current) return current;
                const gymKey =
                    claimType === "Membership"
                      ? "gymConfirmedMemberships"
                      : "gymConfirmedDayPasses",
                  combinedKey =
                    claimType === "Membership"
                      ? "membershipClaims"
                      : "dayPassClaims";
                return {
                  ...current,
                  summary: {
                    ...current.summary,
                    [gymKey]: Math.max(
                      0,
                      (current.summary[gymKey] || 0) + gymDelta,
                    ),
                    [combinedKey]: Math.max(
                      0,
                      (current.summary[combinedKey] || 0) + combinedDelta,
                    ),
                  },
                };
              });
              router.refresh();
            }}
          />
          <div className="grid items-start gap-6 lg:grid-cols-2">
          <PopularCitiesTable cities={data.cities ?? []} />
          <section className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-white/[.04]">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="font-black">Filter usage</h3>
                <p className="text-[11px] text-zinc-500">
                  Unique users by category
                </p>
              </div>
            </div>
            <div className="scrollbar-slim mt-3 grid grid-flow-col auto-cols-[minmax(140px,1fr)] gap-2 overflow-x-auto pb-1 lg:grid-flow-row lg:grid-cols-2 lg:overflow-visible lg:pb-0 xl:grid-cols-3">
              {data.filters.map((filter) => (
                <div
                  key={filter.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-black/5 bg-zinc-50 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-black/20"
                >
                  <span className="truncate">{filter.name}</span>
                  <b>{filter.uses.toLocaleString()}</b>
                </div>
              ))}
            </div>
          </section>
          </div>
        </>
      )}
    </div>
  );
}
