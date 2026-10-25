import BrandIcon from "@/components/BrandIcon";
import AdminNav from "@/components/AdminNav";

type AdminSection = "overview" | "gyms" | "nutrition" | "legal";

export default function AdminHeader({ active }: { active: AdminSection }) {
  return (
    <header className="relative z-[1200] border-b bg-white text-[#1c241c] dark:border-white/10 dark:bg-[#0b0d0b] dark:text-white">
      <div className="landing-primary-header-row flex min-h-16 items-center px-3 py-2 md:px-4"><BrandIcon /></div>
      <div className="flex h-[58px] min-w-0 items-center border-t px-2 sm:px-4 dark:border-white/10">
        <AdminNav active={active} />
      </div>
    </header>
  );
}
