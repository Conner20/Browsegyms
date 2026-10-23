"use client";
import Link from "next/link";
import { Search, Trash2, UserMinus, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import UniversalCheckbox from "@/components/UniversalCheckbox";

export type GymVerificationLogRow={id:string;name:string;isClaimed:boolean;claimedBy:string;claimedAt:string|null;updatedAt:string};
type Account={id:string;email:string|null};
const PAGE_SIZE=10;
const auditStamp=(value:string|null)=>{if(!value)return "—";const parts=new Intl.DateTimeFormat("en-US",{month:"2-digit",day:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"America/New_York"}).formatToParts(new Date(value)),part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===type)?.value??"";return `${part("month")}/${part("day")}/${part("year")} ${part("hour")}:${part("minute")}`};

export default function AdminGymVerificationLog({rows}:{rows:GymVerificationLogRow[]}){
 const router=useRouter(),[query,setQuery]=useState(""),[page,setPage]=useState(1),[selectedIds,setSelectedIds]=useState<string[]>([]),[confirmDelete,setConfirmDelete]=useState(false),[userQuery,setUserQuery]=useState(""),[users,setUsers]=useState<Account[]>([]),[selectedUser,setSelectedUser]=useState<Account|null>(null),[userMenuOpen,setUserMenuOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[confirmRemove,setConfirmRemove]=useState(false);
 const selectedId=selectedIds.length===1?selectedIds[0]:null;
 const filtered=useMemo(()=>rows.filter(row=>row.name.toLowerCase().includes(query.trim().toLowerCase())),[query,rows]),totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),shown=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),selected=rows.find(row=>row.id===selectedId)??null;
 useEffect(()=>setPage(1),[query]);useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);useEffect(()=>{setSelectedUser(null);setUserQuery("");setUsers([]);setUserMenuOpen(false);setConfirmRemove(false)},[selectedId]);
 useEffect(()=>{if(!selectedId)return;const timer=window.setTimeout(async()=>{const response=await fetch(`/api/admin/gyms/${selectedId}/ownership?q=${encodeURIComponent(userQuery)}`,{cache:"no-store"}),result=await response.json().catch(()=>({}));if(response.ok)setUsers(result.users??[])},200);return()=>window.clearTimeout(timer)},[selectedId,userQuery]);
 useEffect(()=>{if(!confirmRemove)return;const timer=window.setTimeout(()=>setConfirmRemove(false),3500);return()=>window.clearTimeout(timer)},[confirmRemove]);
 useEffect(()=>{setConfirmDelete(false);setConfirmRemove(false)},[selectedIds]);
 useEffect(()=>{if(!confirmDelete)return;const timer=window.setTimeout(()=>setConfirmDelete(false),3500);return()=>window.clearTimeout(timer)},[confirmDelete]);
 function toggleGym(id:string){if(busy)return;setMessage("");setSelectedIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}
 async function deleteListings(){
  if(busy||!selectedIds.length)return;
  if(!confirmDelete){setConfirmRemove(false);setConfirmDelete(true);return}
  setConfirmDelete(false);setBusy(true);setMessage("");
  const deleted:string[]=[];
  try{
   for(const id of selectedIds){
    const response=await fetch(`/api/admin/gyms/${encodeURIComponent(id)}`,{method:"DELETE"});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.message??"Unable to delete listing.");
    deleted.push(id);
   }
   setMessage(`${deleted.length} listing${deleted.length===1?"":"s"} deleted.`);
  }catch(error){setMessage(`${deleted.length?`${deleted.length} listing(s) deleted. `:""}Unable to complete deletion: ${error instanceof Error?error.message:"Please try again."}`)}
  finally{
   setSelectedIds(current=>current.filter(id=>!deleted.includes(id)));
   setBusy(false);router.refresh();
  }
 }
 async function act(action:"removeClaim"|"assignOwner",userId?:string){if(!selectedId)return;setBusy(true);setMessage("");const response=await fetch(`/api/admin/gyms/${selectedId}/ownership`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,userId})}),result=await response.json().catch(()=>({}));setBusy(false);if(!response.ok){setMessage(result.message??"Unable to update the gym claim.");return}setMessage(result.message??"Gym updated.");setConfirmRemove(false);setSelectedUser(null);setUserQuery("");setUserMenuOpen(false);router.refresh()}
 function removeClaim(){setConfirmDelete(false);if(!confirmRemove){setConfirmRemove(true);return}void act("removeClaim")}
 return <div className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-white/[.04]">
  <div className="border-b border-black/5 p-4 dark:border-white/10"><label className="flex max-w-md items-center gap-2 rounded-xl border border-black/10 px-3 dark:border-white/15"><Search className="h-4 w-4 shrink-0 text-zinc-500"/><input value={query} onChange={e=>setQuery(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="Search gym name"/></label></div>
  <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-black/5 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10"><tr>{["Select","Gym","Owner","Claimed when","Last updated"].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{shown.map(row=><tr key={row.id} onClick={()=>toggleGym(row.id)} className={`cursor-pointer border-b border-black/5 last:border-0 dark:border-white/10 ${selectedIds.includes(row.id)?"bg-[#22c55e]/10":"hover:bg-black/[.02] dark:hover:bg-white/[.025]"}`}><td className="px-4 py-3"><UniversalCheckbox aria-label={`Select ${row.name}`} checked={selectedIds.includes(row.id)} disabled={busy} onChange={()=>toggleGym(row.id)} onClick={e=>e.stopPropagation()}/></td><td className="px-4 py-3 font-bold"><Link href={`/admin/gyms/${row.id}`} onClick={e=>e.stopPropagation()} className="hover:text-[#22c55e]">{row.name}</Link></td><td className="px-4 py-3">{row.claimedBy}</td><td className="whitespace-nowrap px-4 py-3">{auditStamp(row.claimedAt)}</td><td className="whitespace-nowrap px-4 py-3">{auditStamp(row.updatedAt)}</td></tr>)}</tbody></table></div>
  {!shown.length?<p className="p-8 text-center text-sm text-zinc-500">No gym listings match that search.</p>:filtered.length>PAGE_SIZE&&<div className="flex items-center justify-center gap-3 border-t border-black/5 px-4 py-3 dark:border-white/10"><button disabled={page===1} onClick={()=>setPage(v=>Math.max(1,v-1))} className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold hover:border-[#22c55e] disabled:opacity-40 dark:border-white/15">Previous</button><span className="text-xs text-zinc-500">Page {page} of {totalPages}</span><button disabled={page===totalPages} onClick={()=>setPage(v=>Math.min(totalPages,v+1))} className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold hover:border-[#22c55e] disabled:opacity-40 dark:border-white/15">Next</button></div>}
  <div className="border-t border-black/5 p-4 dark:border-white/10"><div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-center md:gap-2">
   <button type="button" disabled={!selectedIds.length||busy} onClick={()=>void deleteListings()} className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e6a0a0] px-3 text-xs font-bold text-[#d06b6b] disabled:opacity-35"><Trash2 className="h-3.5 w-3.5 shrink-0"/>{busy?"Working…":confirmDelete?"Are you sure?":"Delete listing"}</button>
   <button disabled={!selected?.isClaimed||busy} onClick={removeClaim} className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e6a0a0] px-3 text-xs font-bold text-[#d06b6b] disabled:opacity-35"><UserMinus className="h-3.5 w-3.5 shrink-0"/>{confirmRemove?"Are you sure?":"Remove claim"}</button>
   <div className="relative w-full min-w-0 md:min-w-[240px] md:flex-1 md:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input disabled={!selected||busy} value={userQuery} onFocus={()=>setUserMenuOpen(true)} onBlur={()=>window.setTimeout(()=>setUserMenuOpen(false),120)} onChange={e=>{setUserQuery(e.target.value);setSelectedUser(null);setUserMenuOpen(true)}} placeholder={selected?"Search trainee email":"Select a gym first"} className="h-9 w-full rounded-lg border border-black/10 bg-transparent pl-9 pr-3 text-xs outline-none focus:border-[#22c55e] disabled:opacity-40 dark:border-white/15"/>{userMenuOpen&&selected&&!selectedUser&&<div className="absolute inset-x-0 bottom-11 z-40 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-[#111411] p-1 text-white shadow-2xl">{users.length?users.map(user=><button key={user.id} onPointerDown={e=>e.preventDefault()} onClick={()=>{setSelectedUser(user);setUserQuery(user.email??"");setUserMenuOpen(false)}} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/10">{user.email}</button>):<p className="px-3 py-3 text-sm text-white/50">No trainee accounts found.</p>}</div>}</div>
   <button disabled={!selected||!selectedUser||busy} aria-disabled={!selected||!selectedUser||busy} onClick={()=>selectedUser&&void act("assignOwner",selectedUser.id)} className="admin-assign-owner inline-flex h-9 items-center self-center gap-1.5 rounded-lg border border-[#22c55e] bg-[#22c55e] px-3 text-xs font-black text-[#111411] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-35"><UserRoundCheck className="h-3.5 w-3.5"/>{selected?.isClaimed?"Reassign owner":"Assign owner"}</button>
  </div>{message&&<p className={`mt-3 text-xs ${/unable|error|already|required/i.test(message)?"text-red-400":"text-[#22c55e]"}`}>{message}</p>}</div>
 </div>
}
