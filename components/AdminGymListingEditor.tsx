"use client";

import { ChangeEvent, DragEvent, FormEvent, cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, LoaderCircle, MapPin, X } from "lucide-react";
import GymHoursEditor from "@/components/GymHoursEditor";
import MembershipOptionsEditor from "@/components/MembershipOptionsEditor";
import DayPassOptionsEditor from "@/components/DayPassOptionsEditor";
import FacilityLookup from "@/components/FacilityLookup";
import UniversalCheckbox from "@/components/UniversalCheckbox";
import { MembershipOption, cleanMembershipOptions, emptyMembershipOption } from "@/lib/memberships";
import { DayPassOption, cleanDayPassOptions, emptyDayPassOption } from "@/lib/day-passes";
import { AMENITY_OPTIONS, EQUIPMENT_OPTIONS } from "@/lib/facility-options";

type FormState = {
    name: string; address: string; city: string; state: string; country: string; lat: number | null; lng: number | null; phone: string; contactEmail: string;
    website: string; gymType: string; dayPassOptions: DayPassOption[]; membershipOptions: MembershipOption[];
    hours: string; amenities: string; equipment: string; coverPhotoUrl: string; photoUrls: string[];
    isPublished: boolean;
};

const empty: FormState = { name: "", address: "", city: "", state: "", country: "", lat: null, lng: null, phone: "", contactEmail: "", website: "", gymType: "", dayPassOptions: [emptyDayPassOption()], membershipOptions: [emptyMembershipOption()], hours: "", amenities: "", equipment: "", coverPhotoUrl: "", photoUrls: [], isPublished: true };
type AddressSuggestion = { id: string; label: string; lat: number; lng: number; city?: string; state?: string; country?: string };
const lines = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
const listingLines = (value: string) => lines(value).filter((item) => !/^other$/i.test(item));
const GYM_TYPE_OPTIONS = ["Open", "Personal training gym", "Group training gym", "Specialty gym/studio"];
const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length < 4) return digits;
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};
const normalizeDayPassDays = (value: unknown) => {
    const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (!raw) return "";
    const numeric = Number(raw);
    if (Number.isInteger(numeric) && numeric > 0) return String(numeric);
    const words: Record<string, string> = { single: "1", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7" };
    return Object.entries(words).find(([word]) => raw.toLowerCase().includes(word))?.[1] ?? "1";
};

export default function AdminGymListingEditor({ gymId, inviteToken, initialGym, accountEmail, ownerMode = false }: { gymId?: string; inviteToken?: string; initialGym?: Record<string, any>; accountEmail?: string; ownerMode?: boolean }) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(empty);
    const [loading, setLoading] = useState(Boolean(gymId && !initialGym));
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [uploadingTarget, setUploadingTarget] = useState<"cover" | "amenities" | null>(null);
    const [draggingOver, setDraggingOver] = useState<"cover" | "amenities" | null>(null);
    const [message, setMessage] = useState("");
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
    const [addressOpen, setAddressOpen] = useState(false);
    const [addressLoading, setAddressLoading] = useState(false);
    const [addressLookupComplete, setAddressLookupComplete] = useState(false);
    const [verificationComplete, setVerificationComplete] = useState(false);
    const [verificationRequired, setVerificationRequired] = useState(false);
    const [verificationSections, setVerificationSections] = useState<string[]>([]);
    const [updatedFeedback, setUpdatedFeedback] = useState(false);
    const [verifiedChangesFeedback, setVerifiedChangesFeedback] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(false);
    const [previewPhoto, setPreviewPhoto] = useState<{ url: string; label: string } | null>(null);
    const updatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (updatedTimer.current) clearTimeout(updatedTimer.current); if(deleteTimer.current)clearTimeout(deleteTimer.current); }, []);

    useEffect(() => {
        if (!previewPhoto) return;
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewPhoto(null); };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [previewPhoto]);

    function populate(gym: Record<string, any>) {
        const dayPassOptions = cleanDayPassOptions(gym.dayPassOptions);
        if (!dayPassOptions.length && gym.dayPassPrice != null) dayPassOptions.push({ ...emptyDayPassOption(), price: Number(gym.dayPassPrice), durationDays: Number(normalizeDayPassDays(gym.dayPassDetails)) || 1, purchaseUrl: gym.dayPassUrl ?? gym.website ?? "", access: gym.amenities ?? [] });
        if (!dayPassOptions.length) dayPassOptions.push(emptyDayPassOption());
        const membershipOptions = cleanMembershipOptions(gym.membershipOptions);
        if (!membershipOptions.length && gym.membershipPrice != null) membershipOptions.push({ ...emptyMembershipOption(), name: "Membership", price: Number(gym.membershipPrice), access: [], purchaseUrl: gym.website ?? "", notes: gym.membershipDetails ?? "" });
        if (!membershipOptions.length) membershipOptions.push(emptyMembershipOption());
        setForm({
            name: gym.name ?? "", address: gym.address ?? "", city: gym.city ?? "", state: gym.state ?? "", country: gym.country ?? "", lat: gym.lat ?? null, lng: gym.lng ?? null, phone: formatPhone(gym.phone ?? ""), contactEmail: accountEmail ?? gym.contactEmail ?? "", website: gym.website ?? "", gymType: gym.gymType === "Open gym" ? "Open" : gym.gymType ?? "", dayPassOptions, membershipOptions, hours: gym.hours ?? "", amenities: (gym.amenities ?? []).join("\n"), equipment: (gym.equipment ?? []).join("\n"), coverPhotoUrl: gym.coverPhotoUrl ?? "", photoUrls: gym.photoUrls ?? [], isPublished: gym.isPublished ?? true,
        });
        setVerificationRequired(Boolean(gym.verificationRequired));
        setVerificationSections(Array.isArray(gym.verificationSections) ? gym.verificationSections : []);
    }

    useEffect(() => {
        if (initialGym) { populate(initialGym); setLoading(false); return; }
        if (!gymId) return;
        fetch(ownerMode ? `/api/gyms/${gymId}` : `/api/admin/gyms/${gymId}`, { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("Unable to load gym listing.");
            const { gym } = await response.json();
            populate(gym);
        }).catch((error) => setMessage(error.message)).finally(() => setLoading(false));
    }, [gymId, initialGym, ownerMode, accountEmail]);

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {setForm((current) => ({ ...current, [key]: value }))};

    useEffect(() => {
        const query = form.address.trim();
        if (query.length < 3 || !addressOpen) { setAddressSuggestions([]); setAddressLoading(false); setAddressLookupComplete(false); return; }
        let cancelled = false;
        setAddressLoading(true);
        setAddressLookupComplete(false);
        setAddressSuggestions([]);
        const timer = window.setTimeout(() => {
            fetch(`/api/landing-geocode?q=${encodeURIComponent(query)}`)
                .then(async (response) => response.ok ? response.json() : { results: [] })
                .then((data) => { if (!cancelled) { setAddressSuggestions(data.results ?? []); setAddressLoading(false); setAddressLookupComplete(true); } })
                .catch(() => { if (!cancelled) { setAddressSuggestions([]); setAddressLoading(false); setAddressLookupComplete(true); } });
        }, 300);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [addressOpen, form.address]);

    function selectAddress(suggestion: AddressSuggestion) {
        setForm((current) => ({ ...current, address: suggestion.label, city: suggestion.city ?? "", state: suggestion.state ?? "", country: suggestion.country ?? "", lat: suggestion.lat, lng: suggestion.lng }));
        setAddressSuggestions([]); setAddressOpen(false); setAddressLoading(false); setAddressLookupComplete(false);
    }

    async function uploadFiles(files: File[], target: "cover" | "amenities") {
        files = files.filter((file) => file.type.startsWith("image/"));
        if (!files.length) return;
        setUploadingTarget(target); setMessage("");
        const data = new FormData(); (target === "cover" ? files.slice(0, 1) : files).forEach((file) => data.append("images", file));
        const response = await fetch(inviteToken ? `/api/uploads/images?invite=${encodeURIComponent(inviteToken)}` : "/api/uploads/images", { method: "POST", body: data });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.urls?.length) {
            if (target === "cover") update("coverPhotoUrl", result.urls[0]);
            else setForm((current) => ({ ...current, photoUrls: [...current.photoUrls, ...result.urls] }));
        } else setMessage(result.message ?? "Image upload failed.");
        setUploadingTarget(null);
    }

    async function uploadImages(event: ChangeEvent<HTMLInputElement>, target: "cover" | "amenities") {
        await uploadFiles(Array.from(event.target.files ?? []), target);
        event.target.value = "";
    }

    function dropImages(event: DragEvent<HTMLElement>, target: "cover" | "amenities") {
        event.preventDefault();
        setDraggingOver(null);
        if (!uploadingTarget) void uploadFiles(Array.from(event.dataTransfer.files), target);
    }

    async function submit(event: FormEvent) {
        event.preventDefault(); setSaving(true); setMessage(""); setValidationErrors([]);
        const errors:string[]=[], selectedAmenities=listingLines(form.amenities), selectedEquipment=listingLines(form.equipment);
        const required:[string,string][]=[["Gym name",form.name],["Address",form.address],["Phone",form.phone],["Email",form.contactEmail],["Website",form.website],["Hours",form.hours],["Amenities",selectedAmenities.join("\n")],["Equipment",selectedEquipment.join("\n")]];
        required.forEach(([field,value])=>{if(!value.trim())errors.push(`${field} is required.`)});
        if(!GYM_TYPE_OPTIONS.includes(form.gymType))errors.push("Gym type must be selected.");
        if(form.phone&&form.phone.replace(/\D/g,"").length!==10)errors.push("Phone must include 10 digits.");
        if(form.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail))errors.push("Contact email must be a valid email address.");
        if(form.website&&!/^[a-z][a-z\d+.-]*:\/\//i.test(form.website)&&!form.website.includes("."))errors.push("Website must be a valid domain, such as example.com.");
        if(form.address.trim()&&(form.lat==null||form.lng==null||!form.city.trim()||!form.state.trim()||!form.country.trim()))errors.push("Address must be selected from the address suggestions.");
        if(!form.coverPhotoUrl)errors.push("Cover photo is required.");
        if(!form.photoUrls.length)errors.push("At least one amenity photo is required.");
        if(!form.dayPassOptions.length)errors.push("At least one day pass option is required.");
        const dayPassDurations=new Set<number>();
        form.dayPassOptions.forEach((option,index)=>{const label=`Day pass option ${index+1}`;if(!Number.isFinite(option.price)||option.price<0)errors.push(`${label} price is required.`);if(!Number.isInteger(option.durationDays)||option.durationDays<1)errors.push(`${label} duration must be a whole number of days.`);if(dayPassDurations.has(option.durationDays))errors.push("Each day-pass duration must be unique.");dayPassDurations.add(option.durationDays);if(!option.access.some(item=>selectedAmenities.includes(item)))errors.push(`${label} access is required.`);const destination=option.purchaseUrl.trim()||form.dayPassOptions[0]?.purchaseUrl.trim();if(!destination||(!/^[a-z][a-z\d+.-]*:\/\//i.test(destination)&&!destination.includes(".")))errors.push(index===0?`${label} URL must be valid.`:`${label} needs a valid URL or a valid first-option URL.`)});
        if(!form.membershipOptions.length)errors.push("At least one membership option is required.");
        form.membershipOptions.forEach((option,index)=>{const label=`Membership option ${index+1}`;if(!option.name.trim())errors.push(`${label} name is required.`);if(!Number.isFinite(option.price)||option.price<=0)errors.push(`${label} price is required.`);if(option.billingFrequency==="custom"&&(!option.billingInterval||option.billingInterval<1))errors.push(`${label} billing interval is required.`);if(!option.contractLength||option.contractLength<1)errors.push(`${label} contract length is required.`);if(option.annualFee>0&&option.annualFeeTiming==="after_joining"&&(!Number.isInteger(option.annualFeeOffset)||option.annualFeeOffset<1))errors.push(`${label} annual fee timing is required.`);if(option.annualFee>0&&option.annualFeeTiming==="fixed_date"&&(!Number.isInteger(option.annualFeeMonth)||option.annualFeeMonth<1||option.annualFeeMonth>12||!Number.isInteger(option.annualFeeDay)||option.annualFeeDay<1||option.annualFeeDay>new Date(2025,option.annualFeeMonth,0).getDate()))errors.push(`${label} annual fee date is required.`);if(option.guestPassesEnabled&&(!Number.isInteger(option.guestPassCount)||option.guestPassCount<1))errors.push(`${label} guest pass count is required.`);if(!option.access.some(item=>selectedAmenities.includes(item)))errors.push(`${label} access is required.`);const destination=option.purchaseUrl.trim()||form.membershipOptions[0]?.purchaseUrl.trim();if(!destination||(!/^[a-z][a-z\d+.-]*:\/\//i.test(destination)&&!destination.includes(".")))errors.push(index===0?`${label} purchase URL must be valid.`:`${label} needs a valid URL or a valid first-option purchase URL.`)});
        if(errors.length){
            setValidationErrors(errors);
            setSaving(false);
            window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"smooth"}));
            return;
        }
        const payload = { ...form, amenities: selectedAmenities, equipment: selectedEquipment, dayPassOptions: form.dayPassOptions.map(option=>({...option,access:option.access.filter(item=>selectedAmenities.includes(item))})), membershipOptions: form.membershipOptions.map(option=>({...option,access:option.access.filter(item=>selectedAmenities.includes(item))})) };
        const verifyingAdminChanges = ownerMode && verificationRequired;
        if (gymId && !inviteToken) { setUpdatedFeedback(false); setVerifiedChangesFeedback(false); if (updatedTimer.current) { clearTimeout(updatedTimer.current); updatedTimer.current = null; } }
        const endpoint = inviteToken ? `/api/gym-invites/${encodeURIComponent(inviteToken)}/claim` : ownerMode ? (gymId ? `/api/gyms/${gymId}` : "/api/user/gyms") : gymId ? `/api/admin/gyms/${gymId}` : "/api/admin/gyms";
        const response = await fetch(endpoint, { method: inviteToken || gymId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (response.ok && inviteToken) {
            setVerificationComplete(true);
        }
        else if (response.ok) { if (verifyingAdminChanges) { setVerificationRequired(false); setVerificationSections([]); } if (!gymId) setMessage(result.message ?? "Gym listing created."); if (gymId) { setVerifiedChangesFeedback(verifyingAdminChanges); setUpdatedFeedback(true); updatedTimer.current = setTimeout(() => { setUpdatedFeedback(false); setVerifiedChangesFeedback(false); updatedTimer.current = null; }, 2000); } if (!gymId && result.gym?.id) router.replace(`/admin/gyms/${result.gym.id}`); }
        else { setUpdatedFeedback(false); setVerifiedChangesFeedback(false); setMessage(result.message ?? "Unable to save gym listing."); window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"smooth"})); }
        setSaving(false);
    }

    async function deleteGym() {
        if (!gymId) return;
        if (!deleteConfirmation) {
            setDeleteConfirmation(true);
            if(deleteTimer.current)clearTimeout(deleteTimer.current);
            deleteTimer.current=setTimeout(()=>{setDeleteConfirmation(false);deleteTimer.current=null},3500);
            return;
        }
        if(deleteTimer.current){clearTimeout(deleteTimer.current);deleteTimer.current=null}
        setDeleting(true);
        setSaving(true);
        const response = await fetch(ownerMode?`/api/gyms/${gymId}`:`/api/admin/gyms/${gymId}`, { method: "DELETE" });
        const result = await response.json().catch(() => ({}));
        if (response.ok) router.replace(ownerMode?"/":"/admin/gyms");
        else { setDeleting(false); setDeleteConfirmation(false); setMessage(result.message ?? "Unable to delete gym listing."); setSaving(false); }
    }

    if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><span className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" /></div>;
            if (verificationComplete && inviteToken) return <div className="fixed inset-0 z-[5000] grid min-h-screen place-items-center bg-zinc-50 p-5 text-zinc-950 dark:bg-neutral-950 dark:text-white"><div className="w-full max-w-xl rounded-3xl border border-black/10 bg-white p-7 text-center shadow-xl sm:p-10 dark:border-white/10 dark:bg-white/5"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#22c55e]/15 text-[#22c55e]"><Check size={28} strokeWidth={3}/></div><h1 className="mt-5 text-2xl font-black">Thank you!</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-300">You have successfully claimed your gym listing.</p><a href="/" className="green-button-ui mt-7 inline-flex rounded-full border px-6 py-3 text-sm font-black">Return to Browse Gyms</a></div></div>;
    const input = "mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 dark:border-white/10 dark:bg-black/20";
    const label = "text-sm font-medium text-zinc-700 dark:text-zinc-200";
    return <form noValidate onSubmit={submit} className={`mx-auto max-w-4xl ${validationErrors.length?"gym-listing-validation-active":""}`}>
        <div className="space-y-6">
            {ownerMode&&verificationRequired&&<div role="status" className="rounded-2xl border border-amber-400/60 bg-amber-400/10 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100"><p className="font-semibold">Browse Gyms updated your gym listing.</p><p className="mt-1 text-amber-800/80 dark:text-amber-100/70">Review the sections outlined in yellow and verify the changes. Your listing will remain unverified until you confirm them.</p></div>}
            {validationErrors.length>0&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><p className="font-semibold">Please correct the following fields:</p><ul className="mt-2 list-disc space-y-1 pl-5">{validationErrors.map(error=><li key={error}>{error}</li>)}</ul></div>}
            {message && <p className={`rounded-xl border p-3 text-sm ${/unable|failed|invalid|required|error/i.test(message)?"border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200":"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"}`}>{message}</p>}
            <EditorSection title="Identity and location" description="The basic information people use to find and contact this gym." attention={ownerMode&&verificationRequired&&verificationSections.includes("Identity and location")}>
                <Field label="Gym name"><input required className={input} value={form.name} onChange={(e) => update("name", e.target.value)} /></Field>
                <div className="relative"><Field label="Address"><div className="relative mt-1"><MapPin aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#22c55e]"/><input required autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={addressOpen&&(addressLoading||addressSuggestions.length>0||addressLookupComplete)} aria-controls="gym-address-suggestions" className={`${input} !mt-0 !pl-10 !pr-10`} value={form.address} onFocus={() => setAddressOpen(true)} onChange={(e) => { const address=e.target.value; setForm((current)=>({...current,address,city:"",state:"",country:"",lat:null,lng:null})); setAddressOpen(true); }} placeholder="Start typing an address…" />{form.address&&<button type="button" aria-label="Clear address" onClick={()=>{setForm((current)=>({...current,address:"",city:"",state:"",country:"",lat:null,lng:null}));setAddressSuggestions([]);setAddressOpen(false);setAddressLoading(false);setAddressLookupComplete(false)}} className="gym-address-clear-button absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-zinc-500 transition hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"><X className="h-4 w-4"/></button>}</div></Field>{addressOpen&&form.address.trim().length>=3&&(addressLoading||addressSuggestions.length>0||addressLookupComplete)&&<div id="gym-address-suggestions" role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-neutral-900">{addressLoading?<div className="flex min-h-12 items-center justify-center gap-2 px-3 py-2.5 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[#22c55e]"/><span>Searching addresses…</span></div>:addressSuggestions.length?addressSuggestions.map((suggestion)=><button key={suggestion.id} type="button" role="option" aria-selected="false" onClick={()=>selectAddress(suggestion)} className="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/10"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]"/><span>{suggestion.label}</span></button>):<div className="px-3 py-3 text-center text-sm text-zinc-500">No addresses found.</div>}</div>}</div>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone"><input required type="tel" inputMode="numeric" maxLength={14} className={input} value={form.phone} onChange={(e) => update("phone", formatPhone(e.target.value))} placeholder="(555) 555-5555" /></Field><Field label="Email"><input required type="email" className={input} value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} placeholder="contact@example.com" /></Field></div>
                <div className="grid gap-3 md:grid-cols-2"><Field label="Website"><input required type="text" inputMode="url" className={input} value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="example.com" /></Field><Field label="Gym type"><select required className={input} value={GYM_TYPE_OPTIONS.includes(form.gymType) ? form.gymType : ""} onChange={(e) => update("gymType", e.target.value)}><option value="" disabled>Select a gym type</option><option value="Open">Open</option><option value="Personal training gym">Personal training gym</option><option value="Group training gym">Group training gym</option><option value="Specialty gym/studio">Specialty gym/studio</option></select></Field></div>
            </EditorSection>
            <EditorSection title="Facility details" attention={ownerMode&&verificationRequired&&verificationSections.includes("Facility details")}><Field label="Hours"><GymHoursEditor value={form.hours} onChange={(value) => update("hours", value)} /></Field><div><h3 className={`text-sm font-medium ${validationErrors.includes("Amenities is required.")&&!form.amenities.trim()?"text-red-500 dark:text-red-400":"text-zinc-700 dark:text-zinc-200"}`}>Amenities</h3><FacilityLookup label="Amenities" options={AMENITY_OPTIONS} selected={listingLines(form.amenities)} onChange={(items)=>update("amenities",items.join("\n"))}/></div><div><h3 className={`text-sm font-medium ${validationErrors.includes("Equipment is required.")&&!form.equipment.trim()?"text-red-500 dark:text-red-400":"text-zinc-700 dark:text-zinc-200"}`}>Equipment</h3><FacilityLookup label="Equipment" options={EQUIPMENT_OPTIONS} selected={listingLines(form.equipment)} onChange={(items)=>update("equipment",items.join("\n"))} quantities/></div></EditorSection>
            <EditorSection title="Day pass options" attention={ownerMode&&verificationRequired&&verificationSections.includes("Day pass options")}>
                <DayPassOptionsEditor options={form.dayPassOptions} availableAmenities={listingLines(form.amenities)} onChange={(dayPassOptions)=>update("dayPassOptions",dayPassOptions)} showErrors={validationErrors.length>0}/>
            </EditorSection>
            <EditorSection title="Membership options" attention={ownerMode&&verificationRequired&&verificationSections.includes("Membership options")}>
                <MembershipOptionsEditor options={form.membershipOptions} availableAmenities={listingLines(form.amenities)} onChange={(membershipOptions)=>update("membershipOptions",membershipOptions)} showErrors={validationErrors.length>0}/>
            </EditorSection>
            <EditorSection title="Photos" description="Add a cover photo and photos that showcase your gym's amenities." attention={ownerMode&&verificationRequired&&verificationSections.includes("Photos")}><label onDragEnter={(event)=>{event.preventDefault();setDraggingOver("cover")}} onDragOver={(event)=>event.preventDefault()} onDragLeave={(event)=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDraggingOver(null)}} onDrop={(event)=>dropImages(event,"cover")} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center text-sm font-medium transition hover:bg-zinc-50 dark:hover:bg-white/5 ${draggingOver==="cover"?"border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]":validationErrors.length&&!form.coverPhotoUrl?"border-red-500 text-red-500 dark:border-red-500 dark:text-red-400":"border-zinc-300 dark:border-white/20"}`}><ImagePlus size={18} />{uploadingTarget === "cover" ? "Uploading…" : form.coverPhotoUrl ? "Replace cover photo" : "Upload cover photo"}<input type="file" accept="image/*" className="hidden" disabled={Boolean(uploadingTarget)} onChange={(event) => uploadImages(event, "cover")} /></label>{form.coverPhotoUrl&&<div className="grid grid-cols-3 gap-2"><PhotoRemovalPreview label="Cover photo" url={form.coverPhotoUrl} preview={()=>setPreviewPhoto({url:form.coverPhotoUrl,label:"Cover photo"})} remove={()=>update("coverPhotoUrl","")}/></div>}<label onDragEnter={(event)=>{event.preventDefault();setDraggingOver("amenities")}} onDragOver={(event)=>event.preventDefault()} onDragLeave={(event)=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDraggingOver(null)}} onDrop={(event)=>dropImages(event,"amenities")} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center text-sm font-medium transition hover:bg-zinc-50 dark:hover:bg-white/5 ${draggingOver==="amenities"?"border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]":validationErrors.length&&!form.photoUrls.length?"border-red-500 text-red-500 dark:border-red-500 dark:text-red-400":"border-zinc-300 dark:border-white/20"}`}><ImagePlus size={18} />{uploadingTarget === "amenities" ? "Uploading…" : "Upload amenity photos"}<input type="file" accept="image/*" multiple className="hidden" disabled={Boolean(uploadingTarget)} onChange={(event)=>uploadImages(event,"amenities")} /></label><div className="grid grid-cols-3 gap-2">{form.photoUrls.map((url,index) => <div key={url} className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100"><button type="button" aria-label={`Preview amenity photo ${index+1}`} onClick={()=>setPreviewPhoto({url,label:`Amenity photo ${index+1}`})} className="h-full w-full cursor-zoom-in"><img src={url} alt={`Amenity photo ${index+1}`} className="h-full w-full object-cover" /></button><button type="button" aria-label="Remove amenity photo" onClick={() => update("photoUrls", form.photoUrls.filter((item) => item !== url))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X size={13} /></button></div>)}</div></EditorSection>
            {inviteToken ? <div className="flex justify-center py-2 pb-[max(.5rem,env(safe-area-inset-bottom))]"><button disabled={saving} className="green-button-ui gym-listing-primary-action verify-information-button min-w-52 rounded-xl border px-7 py-3 text-sm font-black transition">{saving ? "Saving…" : "Verify information"}</button></div> : <div className="flex flex-wrap items-center justify-center gap-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">{!gymId&&!ownerMode&&<button type="button" onClick={()=>router.push("/admin/gyms")} className="gym-owner-back-button rounded-xl border border-zinc-300 bg-transparent px-6 py-2.5 text-sm font-black text-zinc-700 transition hover:border-white hover:text-white dark:border-white/20 dark:text-white/75">Back</button>}{ownerMode&&<button type="button" onClick={()=>router.push("/")} className="gym-owner-back-button rounded-xl border border-zinc-300 bg-transparent px-6 py-2.5 text-sm font-black text-zinc-700 transition hover:border-white hover:text-white dark:border-white/20 dark:text-white/75">Back</button>}{gymId&&!ownerMode&&<button type="button" onClick={()=>router.push("/admin/gyms")} className="gym-owner-back-button rounded-xl border border-zinc-300 bg-transparent px-6 py-2.5 text-sm font-black text-zinc-700 transition hover:border-white hover:text-white dark:border-white/20 dark:text-white/75">Back</button>}{gymId&&!ownerMode&&<button type="button" onClick={deleteGym} disabled={saving||updatedFeedback} className={`gym-listing-delete-action min-w-32 rounded-xl border border-transparent bg-[#e66b6b] px-5 py-2.5 text-sm font-black text-[#111411] transition hover:border-[#e66b6b] hover:bg-zinc-50 hover:text-[#e66b6b] dark:hover:bg-neutral-950 ${deleteConfirmation?"!border-[#e66b6b] !bg-[#e66b6b] !text-[#111411]":""}`}>{deleting?"Deleting…":deleteConfirmation?"Are you sure?":"Delete listing"}</button>}<button disabled={saving} className="gym-listing-primary-action gym-listing-submit-action rounded-xl border border-transparent bg-[#22c55e] px-6 py-2.5 text-sm font-black text-[#111411] transition hover:border-[#22c55e] hover:bg-zinc-50 hover:text-[#22c55e] disabled:cursor-default dark:hover:bg-neutral-950">{updatedFeedback?<span className="gym-listing-updated-feedback flex animate-[copy-confirm_.35s_ease-out] items-center justify-center gap-2"><Check size={16} strokeWidth={3}/>{verifiedChangesFeedback?"Verified!":"Updated!"}</span>:saving?(ownerMode&&verificationRequired?"Verifying…":"Saving…"):ownerMode&&verificationRequired?"Verify changes":gymId?"Submit changes":"Create listing"}</button></div>}
        </div>
        {previewPhoto&&<div role="dialog" aria-modal="true" aria-label={`${previewPhoto.label} preview`} className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/85 p-4 sm:p-8" onClick={()=>setPreviewPhoto(null)}><figure className="relative m-0 flex max-h-full max-w-6xl items-center justify-center" onClick={(event)=>event.stopPropagation()}><img src={previewPhoto.url} alt={previewPhoto.label} className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"/><button type="button" aria-label="Close image preview" onClick={()=>setPreviewPhoto(null)} className="absolute right-2 top-2 rounded-full bg-black/75 p-2 text-white transition hover:bg-black"><X size={22}/></button></figure></div>}
    </form>;
}

function StructuredChecklist({ options, selected, onChange, otherLabel }: { options: string[]; selected: string[]; onChange: (items: string[]) => void; otherLabel: string }) {
    const normalizedOptions = new Set(options.map((option) => option.toLowerCase()));
    const standardItems = selected.filter((item) => normalizedOptions.has(item.toLowerCase()));
    const customItems = selected.filter((item) => !normalizedOptions.has(item.toLowerCase()) && item !== "Other");
    const otherSelected = customItems.length > 0 || selected.includes("Other");
    const canonicalCustom = customItems.join("\n");
    const [customDraft, setCustomDraft] = useState(canonicalCustom);

    useEffect(() => {
        if (lines(customDraft).join("\n") !== canonicalCustom) setCustomDraft(canonicalCustom);
    }, [canonicalCustom]);

    const toggle = (option: string) => onChange(
        selected.some((item) => item.toLowerCase() === option.toLowerCase())
            ? selected.filter((item) => item.toLowerCase() !== option.toLowerCase())
            : [...selected, option],
    );
    const toggleOther = (checked: boolean) => {
        if (checked) {
            onChange([...standardItems, ...(customItems.length ? customItems : ["Other"])]);
            return;
        }
        setCustomDraft("");
        onChange(standardItems);
    };
    const updateCustom = (value: string) => {
        setCustomDraft(value);
        const parsed = lines(value);
        onChange([...standardItems, ...(parsed.length ? parsed : ["Other"])]);
    };
    const optionClass = "inline-flex w-fit max-w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition";

    return <div className="mt-2 min-w-0 space-y-3">
        <div className="flex min-w-0 flex-wrap items-start gap-2">
            {options.map((option) => {
                const checked = selected.some((item) => item.toLowerCase() === option.toLowerCase());
                return <label key={option} className={`${optionClass} ${checked ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950" : "border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5"}`}><UniversalCheckbox checked={checked} onChange={() => toggle(option)}/><span className="min-w-0 break-words">{option}</span></label>;
            })}
            <label className={`${optionClass} ${otherSelected ? "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950" : "border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5"}`}><UniversalCheckbox checked={otherSelected} onChange={(event) => toggleOther(event.target.checked)}/><span className="min-w-0 break-words">{otherLabel}</span></label>
        </div>
        {otherSelected && <textarea required rows={2} value={customDraft} onChange={(event) => updateCustom(event.target.value)} className="w-full min-w-0 max-w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-white/10 dark:bg-zinc-900" placeholder="Enter one custom item per line"/>}
    </div>;
}
function EditorSection({ title, description, attention = false, children }: { title: string; description?: string; attention?: boolean; children: React.ReactNode }) { return <section className={`space-y-4 rounded-2xl border bg-white p-4 transition-colors sm:p-5 dark:bg-white/5 ${attention?"border-amber-400 ring-1 ring-amber-400/25 dark:border-amber-300":"border-black/10 dark:border-white/10"}`}><div><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}</div>{children}</section>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { const content=label==="Pricing details"&&isValidElement(children)?cloneElement(children as React.ReactElement<{required?:boolean}>,{required:false}):children;return <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}{label==="Pricing details"&&<span className="ml-2 text-xs font-normal text-zinc-400">Optional</span>}{hint && <span className="ml-2 text-xs font-normal text-zinc-400">{hint}</span>}{content}</label>; }
function PhotoRemovalPreview({label,url,preview,remove}:{label:string;url:string;preview:()=>void;remove:()=>void}){return <div className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5"><button type="button" aria-label={`Preview ${label.toLowerCase()}`} onClick={preview} className="h-full w-full cursor-zoom-in"><img src={url} alt={label} className="h-full w-full object-cover"/></button><span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-xs font-medium text-white">{label}</span><button type="button" aria-label={`Remove ${label.toLowerCase()}`} onClick={remove} className="absolute right-1 top-1 rounded-full bg-black/75 p-1 text-white transition hover:bg-red-600"><X size={13}/></button></div>}
