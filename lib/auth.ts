import { env } from "@/lib/env";
import { db } from "@/prisma/client";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcrypt";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { hasAdminAccessByEmail } from "@/lib/admin";

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(db),
    secret: env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt",
        // Browsers do not support a literally infinite cookie. One hundred years
        // gives Browsegyms a practically permanent sign-in on a trusted device.
        maxAge: 60 * 60 * 24 * 365 * 100,
    },
    jwt: {
        maxAge: 60 * 60 * 24 * 365 * 100,
    },
    pages: {
        signIn: '/log-in',
    },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "you@example.com" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if(!credentials?.email || !credentials?.password) {
                    return null;
                }
                const normalizedEmail = credentials.email.trim().toLowerCase();
                const existingUser = await db.user.findUnique({
                    where: { email: normalizedEmail }
                });
                if(!existingUser) {
                    return null;
                }
                if (existingUser.deletedAt) return null;
                if (!existingUser.password) return null;
                const passwordMatch = await compare(credentials.password, existingUser.password);
                if (!passwordMatch) return null;
                if (!existingUser.emailVerified) {
                    throw new Error("EMAIL_NOT_VERIFIED");
                }

                await db.user.update({
                    where: { id: existingUser.id },
                    data: { lastLoginAt: new Date() },
                });

                return {
                    id: `${existingUser.id}`,
                    email: existingUser.email,
                    role: existingUser.role,
                }
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (!user && typeof token.email === "string") {
                const existingUser = await db.user.findUnique({
                    where: { email: token.email },
                    select: { role: true, deletedAt: true },
                });
                if (!existingUser || existingUser.deletedAt) {
                    token.sub = undefined;
                    token.email = undefined;
                    token.role = undefined;
                    token.isAdmin = false;
                    return token;
                }
                token.role = existingUser.role ?? undefined;
            }

            if(user) {
                const sessionUser = user as { id?: string; email?: string | null; role?: string | null };
                const email = sessionUser.email ?? (typeof token.email === "string" ? token.email : null);
                return {
                    ...token,
                    sub: sessionUser.id ?? token.sub,
                    email: sessionUser.email ?? token.email,
                    name: undefined,
                    role: sessionUser.role ?? token.role,
                    isAdmin: await hasAdminAccessByEmail(email),
                }
            }
            if (typeof token.email === "string") token.isAdmin = await hasAdminAccessByEmail(token.email);
            return token
        },
        async session({ session, token }) {
            return {
                ...session,
                user: {
                    ...session.user,
                    id: typeof token.sub === "string" ? token.sub : undefined,
                    email: typeof token.email === "string" ? token.email : session.user?.email,
                    name: null,
                    role: typeof token.role === "string" ? token.role : undefined,
                    isAdmin: Boolean(token.isAdmin),
                }
            }
        }
    }
}
