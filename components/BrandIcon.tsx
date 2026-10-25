import Image from "next/image";
import Link from "next/link";

export default function BrandIcon({ href = "/" }: { href?: string }) {
  return <Link href={href} aria-label="Browsegyms home" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#22c55e]">
    <Image src="/brand/browsegyms-logo.png" alt="Browsegyms" width={48} height={48} priority />
  </Link>;
}
