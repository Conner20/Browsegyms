import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { gymListingUniquenessErrors } from "@/lib/gyms";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name : "";
    const address = typeof body.address === "string" ? body.address : "";
    const gymId = typeof body.gymId === "string" && body.gymId.trim() ? body.gymId.trim() : undefined;
    const errors = await gymListingUniquenessErrors({ name, address }, gymId);
    return NextResponse.json({ errors });
}
