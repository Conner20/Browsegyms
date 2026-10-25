"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type FinancialTrendPoint = { date: string; total: number; dayPass: number; membership: number; mrr: number; customers: number };
export type GymFinancialTrend = { id: string; name: string; points: FinancialTrendPoint[] };
type Metric = "total" | "dayPass" | "membership" | "mrr" | "customers";

const metrics: { key: Metric; label: string }[] = [
  { key: "total", label: "Total attributed revenue" },
  { key: "dayPass", label: "Day-pass revenue" },
  { key: "membership", label: "Membership revenue" },
  { key: "mrr", label: "MRR" },
  { key: "customers", label: "Customers supplied" },
];
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function AdminFinancialGrowth({ overall, gyms }: { overall: FinancialTrendPoint[]; gyms: GymFinancialTrend[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800), [metric, setMetric] = useState<Metric>("total"), [gymId, setGymId] = useState("all"), [tip, setTip] = useState<number | null>(null);
  useEffect(() => { const node=viewport.current;if(!node)return;setWidth(Math.max(320,node.getBoundingClientRect().width));const observer=new ResizeObserver(([entry])=>setWidth(Math.max(320,entry.contentRect.width)));observer.observe(node);return()=>observer.disconnect() }, []);
  const selectedGym=gyms.find(gym=>gym.id===gymId),points=selectedGym?.points??overall,label=metrics.find(item=>item.key===metric)!.label;
  const visible=useMemo(()=>points.filter((point,index)=>index===0||index===points.length-1||point[metric]!==points[index-1][metric]),[points,metric]);
  const height=260,p={l:64,r:24,t:24,b:42},values=visible.map(point=>point[metric]),max=Math.max(1,...values),first=visible.length?Date.parse(`${visible[0].date}T00:00:00Z`):Date.now(),last=visible.length?Date.parse(`${visible.at(-1)!.date}T00:00:00Z`):first,formatValue=(value:number)=>metric==="customers"?Math.round(value).toLocaleString():money(value);
  const x=(date:string)=>first===last?(p.l+width-p.r)/2:p.l+(Date.parse(`${date}T00:00:00Z`)-first)/(last-first)*(width-p.l-p.r),y=(value:number)=>p.t+(max-value)/max*(height-p.t-p.b),path=visible.map((point,index)=>`${index?"L":"M"}${x(point.date)},${y(point[metric])}`).join(" ");
  return <section className="overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/[.04]">
    <div className="border-b border-black/10 p-5 dark:border-white/10"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black">Growth over time</h3><label className="relative inline-flex items-center"><span className="sr-only">Gym</span><select value={gymId} onChange={event=>{setGymId(event.target.value);setTip(null)}} className="min-w-40 appearance-none rounded-lg border border-black/10 bg-transparent py-2 pl-3 pr-9 text-left text-sm font-semibold text-black outline-none transition hover:border-[#22c55e] focus:border-[#22c55e] dark:border-white/15 dark:text-white"><option value="all">Overall</option>{gyms.map(gym=><option key={gym.id} value={gym.id}>{gym.name}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/></label></div><div className="mt-3 flex flex-wrap gap-2">{metrics.map(item=><button key={item.key} type="button" onClick={()=>{setMetric(item.key);setTip(null)}} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${metric===item.key?"border-[#22c55e] bg-[#22c55e] text-black":"border-black/10 text-zinc-500 hover:border-[#22c55e] dark:border-white/15"}`}>{item.label}</button>)}</div></div>
    {!visible.length?<p className="p-8 text-center text-sm text-zinc-500">No financial history is available for this period.</p>:<div ref={viewport} className="relative overflow-hidden" onMouseLeave={()=>setTip(null)}><svg width={width} height={height} role="img" aria-label={`${label} over time for ${selectedGym?.name??"Browsegyms"}`} onMouseMove={event=>{const rect=event.currentTarget.getBoundingClientRect(),local=event.clientX-rect.left,index=visible.reduce((best,_,candidate)=>Math.abs(x(visible[candidate].date)-local)<Math.abs(x(visible[best].date)-local)?candidate:best,0);setTip(index)}}>{[0,.25,.5,.75,1].map(ratio=>{const lineY=p.t+ratio*(height-p.t-p.b);return <g key={ratio}><line x1={p.l} x2={width-p.r} y1={lineY} y2={lineY} stroke="currentColor" className="text-black/10 dark:text-white/10"/><text x={p.l-8} y={lineY+4} textAnchor="end" className="fill-zinc-500 text-[10px]">{formatValue(max*(1-ratio))}</text></g>})}<path d={path} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{tip!==null&&visible[tip]&&<><line x1={x(visible[tip].date)} x2={x(visible[tip].date)} y1={p.t} y2={height-p.b} stroke="#22c55e" strokeDasharray="4 4"/><circle cx={x(visible[tip].date)} cy={y(visible[tip][metric])} r="5" fill="#22c55e"/></>}</svg>{tip!==null&&visible[tip]&&<div className="pointer-events-none absolute right-4 top-4 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900"><p className="text-zinc-500">{dateLabel(visible[tip].date)}</p><p className="mt-1 font-black">{formatValue(visible[tip][metric])}</p></div>}<div className="flex justify-between px-16 pb-3 text-[10px] text-zinc-500"><span>{dateLabel(visible[0].date)}</span><span>{dateLabel(visible.at(-1)!.date)}</span></div></div>}
  </section>;
}
