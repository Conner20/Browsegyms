"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, RotateCcw, ShieldPlus, ShieldX, Trash2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import UniversalCheckbox from "@/components/UniversalCheckbox";

type User={id:string;email:string|null;role:string|null;deletedAt:string|null;hasAdminAccess:boolean;isConfiguredAdmin:boolean;lastActiveAt:string|null;gymAccessCount:number;gyms:{id:string;name:string}[]};
type SortKey="role"|"deleted"|"lastActiveAt";
export default function AdminUserManager(){
 const[users,setUsers]=useState<User[]>([]),[query,setQuery]=useState(""),[loading,setLoading]=useState(true),[canManage,setCanManage]=useState(false),[selected,setSelected]=useState<string[]>([]),[password,setPassword]=useState(""),[message,setMessage]=useState(""),[page,setPage]=useState(1),[deleteArmed,setDeleteArmed]=useState(false),[purgeArmed,setPurgeArmed]=useState(false),[sort,setSort]=useState<{key:SortKey;direction:"asc"|"desc"}>({key:"role",direction:"asc"});
 const load=async()=>{setLoading(true);const response=await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`,{cache:"no-store"});const data=await response.json().catch(()=>({}));if(response.ok){setUsers(data.users??[]);setCanManage(Boolean(data.canManageUsers));setSelected([]);setPage(1)}else setMessage(data.error??"Unable to load users.");setLoading(false)};
 useEffect(()=>{const id=setTimeout(()=>void load(),200);return()=>clearTimeout(id)},[query]);
 useEffect(()=>{const refresh=()=>void load();window.addEventListener("gym_claim_confirmation_changed",refresh);return()=>window.removeEventListener("gym_claim_confirmation_changed",refresh)},[query]);
 useEffect(()=>{if(!deleteArmed)return;const id=window.setTimeout(()=>setDeleteArmed(false),3500);return()=>window.clearTimeout(id)},[deleteArmed]);
 useEffect(()=>{if(!purgeArmed)return;const id=window.setTimeout(()=>setPurgeArmed(false),3500);return()=>window.clearTimeout(id)},[purgeArmed]);
 useEffect(()=>{setDeleteArmed(false);setPurgeArmed(false)},[selected,password]);
 useEffect(()=>{if(!selected.length)setPassword("")},[selected.length]);
 const changeAdminAccess=async()=>{if(!selected.length||!password)return setMessage("Enter your password and select at least one account.");const selectedAreAdmins=selected.every(id=>users.find(user=>user.id===id)?.hasAdminAccess),isAdmin=!selectedAreAdmins;const response=await fetch("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userIds:selected,password,isAdmin})});const data=await response.json().catch(()=>({}));if(!response.ok){setMessage(data.error??"Unable to change admin access.");return}const count=Number(data.count)||selected.length;setSelected([]);setPassword("");setMessage(`${count} account${count===1?"":"s"} ${isAdmin?"granted admin access":"demoted from admin"}.`);await load()};
 const recover=async()=>{if(!selected.length||!password)return setMessage("Enter your password and select at least one deleted account.");if(!deleteArmed){setDeleteArmed(true);return}setDeleteArmed(false);const response=await fetch("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"recoverUsers",userIds:selected,password})});const data=await response.json().catch(()=>({}));if(!response.ok){setMessage(data.error??"Unable to recover the selected account.");return}const count=Number(data.count)||selected.length;setSelected([]);setPassword("");setMessage(`${count} account${count===1?"":"s"} recovered as ${count===1?"a trainee account":"trainee accounts"}.`);await load()};
 const purge=async()=>{if(!selected.length||!password)return setMessage("Enter your password and select at least one deleted account.");if(!purgeArmed){setPurgeArmed(true);setDeleteArmed(false);return}setPurgeArmed(false);const response=await fetch("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"permanentlyDeleteUsers",userIds:selected,password})});const data=await response.json().catch(()=>({}));if(!response.ok){setMessage(data.error??"Unable to permanently delete the selected account.");return}const count=Number(data.count)||selected.length;setSelected([]);setPassword("");setMessage(`${count} deleted account${count===1?" was":"s were"} permanently deleted.`);await load()};
 const remove=async()=>{if(!selected.length||!password)return setMessage("Enter your password and select at least one account.");if(!deleteArmed){setDeleteArmed(true);return}setDeleteArmed(false);for(const targetUserId of selected){const response=await fetch("/api/user/delete",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({password,targetUserId})});const data=await response.json().catch(()=>({}));if(!response.ok){setMessage(data.message??"Unable to delete account.");return}}setSelected([]);setPassword("");setMessage("Selected accounts deleted.");await load()};
 const roleRank=(role:string|null)=>role==="GYM"?0:role==="TRAINEE"?1:2,sortedUsers=[...users].sort((a,b)=>{const raw=sort.key==="role"?roleRank(a.role)-roleRank(b.role):sort.key==="deleted"?Number(Boolean(a.deletedAt))-Number(Boolean(b.deletedAt)):(a.lastActiveAt?Date.parse(a.lastActiveAt):0)-(b.lastActiveAt?Date.parse(b.lastActiveAt):0);return (sort.direction==="asc"?raw:-raw)||(a.email||"").localeCompare(b.email||"")}),pageSize=10,totalPages=Math.max(1,Math.ceil(sortedUsers.length/pageSize)),visibleUsers=sortedUsers.slice((page-1)*pageSize,page*pageSize); const selectedAreAdmins=selected.length>0&&selected.every(id=>users.find(user=>user.id===id)?.hasAdminAccess),selectedAreDeleted=selected.length>0&&selected.every(id=>Boolean(users.find(user=>user.id===id)?.deletedAt));
 const sortBy=(key:SortKey)=>{setPage(1);setSort(current=>current.key===key?{key,direction:current.direction==="asc"?"desc":"asc"}:{key,direction:key==="role"?"asc":"desc"})},sortHeader=(key:SortKey,label:string)=>
<button type="button" onClick={()=>sortBy(key)} className="inline-flex items-center gap-1 font-bold hover:text-[#22c55e]">{label}<span aria-hidden="true">{sort.key===key?(sort.direction==="asc"?"↑":"↓"):"↕"}</span>
</button>;
 const toggleUser=(user:User)=>{if(user.isConfiguredAdmin)return;setSelected(current=>current.includes(user.id)?current.filter(id=>id!==user.id):(current.some(id=>Boolean(users.find(item=>item.id===id)?.deletedAt)!==Boolean(user.deletedAt))||current.some(id=>users.find(item=>item.id===id)?.hasAdminAccess!==user.hasAdminAccess)?[user.id]:[...current,user.id]))};
 return <div className="overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-white/[.04]">
<div className="admin-user-search-row flex items-center gap-2 border-b border-black/5 p-4 dark:border-white/10">
<label className="flex max-w-md flex-1 items-center gap-2 rounded-xl border border-black/10 px-3 dark:border-white/15"><input value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} placeholder="Search by email" className="admin-user-search-input w-full bg-transparent py-2.5 text-sm outline-none"/></label>
<button onClick={()=>void load()} aria-label="Refresh users" className="admin-user-refresh rounded-xl border border-black/10 p-2.5 transition hover:border-[#22c55e] hover:text-[#22c55e] dark:border-white/15">
<RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>
</button>
</div><div className="overflow-x-auto">
<table className="w-full min-w-[680px] text-sm">
<thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 [&_th]:px-4 [&_th]:py-3">
<tr>
<th>Select</th>
<th>Account email</th>
<th>{sortHeader("deleted","Deleted")}</th>
<th>{sortHeader("role","Role")}</th>
<th>{sortHeader("lastActiveAt","Last active")}</th>
</tr>
</thead>
<tbody className="[&_td]:px-4 [&_td]:py-3">{visibleUsers.map(user=>
<tr key={user.id} onClick={()=>toggleUser(user)} className={`border-b border-black/5 last:border-0 dark:border-white/10 ${user.isConfiguredAdmin?"opacity-65":"cursor-pointer"} ${selected.includes(user.id)?"bg-[#22c55e]/10":"hover:bg-black/[.02] dark:hover:bg-white/[.025]"}`}>
<td className="px-4 py-3">
<UniversalCheckbox disabled={user.isConfiguredAdmin} checked={selected.includes(user.id)} onChange={()=>toggleUser(user)} onClick={event=>event.stopPropagation()}/>
</td>
<td>
<b>{user.email||"Email unavailable"}</b>
</td>
<td>{user.deletedAt?<span className="text-xs font-bold uppercase text-zinc-500">Deleted</span>:<span className="text-zinc-400">—</span>}</td>
<td>{user.role==="GYM"?<span className="group/gym-role relative inline-flex">{user.gyms[0]?<Link href={`/admin/gyms/${user.gyms[0].id}`} onClick={event=>event.stopPropagation()} className="border-b border-dotted border-zinc-400 font-semibold transition hover:text-[#22c55e] focus:text-[#22c55e]">GYM</Link>:<span className="cursor-help border-b border-dotted border-zinc-400 font-semibold" tabIndex={0}>GYM</span>}<span className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-2 whitespace-nowrap rounded-xl border border-white/10 bg-[#111411] px-3 py-2 text-xs font-semibold normal-case text-white opacity-0 shadow-2xl transition group-hover/gym-role:visible group-hover/gym-role:opacity-100 group-focus-within/gym-role:visible group-focus-within/gym-role:opacity-100">{user.gyms.length?user.gyms.map(gym=>gym.name).join(", "):"No listing assigned"}</span></span>:user.role||"—"}</td>
<td>{user.lastActiveAt?new Date(user.lastActiveAt).toLocaleString():"No activity"}</td>
</tr>)}</tbody>
</table>{!loading&&!users.length&&<p className="p-8 text-center text-zinc-500">No accounts found.</p>}</div>{users.length>pageSize&&<div className="flex items-center justify-center gap-3 border-t border-black/5 px-4 py-3 dark:border-white/10">
<button type="button" disabled={page===1} onClick={()=>setPage(current=>Math.max(1,current-1))} className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition enabled:hover:border-white enabled:hover:font-black enabled:hover:ring-1 enabled:hover:ring-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15">Previous</button>
<span className="text-xs text-zinc-500">Page {page} of {totalPages}</span>
<button type="button" disabled={page===totalPages} onClick={()=>setPage(current=>Math.min(totalPages,current+1))} className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold transition enabled:hover:border-white enabled:hover:font-black enabled:hover:ring-1 enabled:hover:ring-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15">Next</button>
</div>}{message&&<p className="border-t border-black/5 px-4 py-3 text-sm dark:border-white/10">{message}</p>}{canManage&&<div className="flex flex-wrap items-end gap-3 border-t border-black/5 p-4 dark:border-white/10">
<label className="min-w-[260px] flex-1 text-sm font-medium"><span className="sr-only">Admin password</span><PasswordInput disabled={selected.length===0} placeholder="Admin password" value={password} onChange={event=>setPassword(event.target.value)}/>
</label>
<div className="flex w-full flex-nowrap gap-3 md:contents">
<button type="button" data-confirming={deleteArmed?"true":"false"} onClick={()=>void (selectedAreDeleted?recover():remove())} disabled={selected.length===0} aria-disabled={selected.length===0} className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-xs font-bold transition disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-35 md:flex-none md:px-3 ${selectedAreDeleted?"!border-[#22c55e] !bg-[#111411] !text-[#22c55e] md:hover:!border-[#22c55e] md:hover:!bg-[#22c55e] md:hover:!text-[#111411]":"border-[#e6a0a0] text-[#d06b6b]"}`}>
{selectedAreDeleted?<RotateCcw aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${deleteArmed?"hidden md:block":""}`}/>:<Trash2 aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${deleteArmed?"hidden md:block":""}`}/>} {deleteArmed?"Are you sure?":selectedAreDeleted?<><span className="md:hidden">Recover</span><span className="hidden md:inline">Recover account</span></>:"Delete selected"}</button>
{selectedAreDeleted&&<button type="button" data-confirming={purgeArmed?"true":"false"} onClick={()=>void purge()} className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e6a0a0] px-2 text-xs font-bold text-[#d06b6b] transition hover:border-[#d06b6b] hover:bg-[#d06b6b] hover:text-black md:flex-none md:px-3"><Trash2 aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${purgeArmed?"hidden md:block":""}`}/>{purgeArmed?"Are you sure?":<><span className="md:hidden">Delete</span><span className="hidden md:inline">Delete permanently</span></>}</button>}
<button onClick={()=>void changeAdminAccess()} disabled={selected.length===0||selected.some(id=>Boolean(users.find(user=>user.id===id)?.deletedAt))} aria-disabled={selected.length===0||selected.some(id=>Boolean(users.find(user=>user.id===id)?.deletedAt))} className={`admin-change-access inline-flex h-9 min-w-0 flex-1 items-center justify-center self-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-black disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-35 md:flex-none ${selectedAreAdmins?"border-amber-400 bg-amber-400 text-black hover:bg-black hover:text-amber-400":"border-[#22c55e] bg-[#22c55e] text-[#111411]"}`}>{selectedAreAdmins?<>
<ShieldX aria-hidden="true" className="h-3.5 w-3.5"/>Demote admin</>:<>
<ShieldPlus aria-hidden="true" className="h-3.5 w-3.5"/>Make admin</>}</button>
</div>
</div>}</div>
}
