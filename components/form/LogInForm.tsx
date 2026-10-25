'use client'
import { writeStoredValue } from "@/lib/browser-storage";

import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "../ui/form";
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Button } from "../ui/button";
import Link from "next/link";
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"

const FormSchema = z.object({
    email: z.string().min(1, 'Email is required').email('Invalid email'),
    password: z.string().min(1, 'Password is required').min(8, 'Password must have more than 8 characters')
})

const inputClass =
    "border border-white/10 bg-white/[.06] text-white placeholder:text-white/35 focus-visible:border-[#22c55e] focus-visible:ring-[#22c55e]/20";

const LogInForm = ({ defaultCallbackUrl = "/" }: { defaultCallbackUrl?: string }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedCallback = searchParams?.get("callbackUrl") || defaultCallbackUrl;
    const callbackUrl = requestedCallback.startsWith("/") && !requestedCallback.startsWith("//") ? requestedCallback : "/";
    const dayPassGymId = callbackUrl.match(/^\/day-pass\/([^/?#]+)/)?.[1] || "";
    const membershipGymId = callbackUrl.match(/^\/membership\/([^/?#]+)/)?.[1] || "";
    const membershipOptionId = membershipGymId ? new URL(callbackUrl, "http://local").searchParams.get("optionId") || "" : "";
    const dayPassOptionId = dayPassGymId ? new URL(callbackUrl, "http://local").searchParams.get("optionId") || "" : "";
    const gymInviteToken = callbackUrl.match(/^\/gym-invite\/([^/?#]+)/)?.[1] || "";
    const purchaseGymId = dayPassGymId || membershipGymId;
    const purchaseIntent = membershipGymId ? "membership" : "day-pass";
    const purchaseOptionId = membershipOptionId || dayPassOptionId;
    const signUpHref = gymInviteToken ? `/sign-up?invite=${encodeURIComponent(decodeURIComponent(gymInviteToken))}` : purchaseGymId ? `/sign-up?gymId=${encodeURIComponent(purchaseGymId)}${membershipGymId ? "&intent=membership" : ""}${purchaseOptionId ? `&optionId=${encodeURIComponent(purchaseOptionId)}` : ""}` : /^\/referrals\/review\/[A-Za-z0-9_-]+$/.test(callbackUrl) ? `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/sign-up";
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showResendPrompt, setShowResendPrompt] = useState(false);
    const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");
    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
    });

    const onSubmit = async (values: z.infer<typeof FormSchema>) => {
        setShowResendPrompt(false);
        setResendStatus("idle");
        const externalTab = purchaseGymId ? window.open("about:blank", "_blank") : null;
        if (externalTab) externalTab.opener = null;

        const logInData = await signIn('credentials', {
            email: values.email,
            password: values.password,
            redirect: false,
        });
        if (logInData?.error) {
            externalTab?.close();
            if (logInData.error === "EMAIL_NOT_VERIFIED") {
                setErrorMessage("Please verify your email before logging in.");
                setShowResendPrompt(true);
            } else {
                setErrorMessage("Oops! Something went wrong. Please check your credentials and try again.");
            }
        } else {
            setErrorMessage(null);
            setShowResendPrompt(false);
            if (purchaseGymId) {
                writeStoredValue(localStorage, `browsegyms_pending_${purchaseIntent === "membership" ? "membership" : "day_pass"}_confirmation`, JSON.stringify({ gymId: decodeURIComponent(purchaseGymId), openedAt: Date.now() }));
                const destinationPath = callbackUrl;
                if (externalTab) {
                    externalTab.location.href = `${window.location.origin}${destinationPath}`;
                    externalTab.focus();
                } else {
                    window.open(destinationPath, "_blank", "noopener,noreferrer");
                }
                window.location.assign("/");
                return;
            }
            if (callbackUrl !== "/") {
                window.location.assign(callbackUrl);
                return;
            }
            router.push("/");
            router.refresh();
        }
    }

    const handleResendVerification = async () => {
        const email = form.getValues("email");
        if (!email) return;
        setResendStatus("sending");
        try {
            await fetch("/api/auth/verify-email/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            setResendStatus("sent");
        } catch {
            setResendStatus("idle");
        }
    };

    return (
        <Form {...form}>
            <h1 className="text-3xl text-center mb-6 text-white">Log In</h1>
            <form onSubmit={form.handleSubmit(onSubmit)} className='w-full'>
                {errorMessage && (
                    <Alert className="mb-4 border border-red-400/35 bg-red-950/45 text-red-100 shadow-none">
                        <AlertTitle className="text-red-200">Unable to log in</AlertTitle>
                        <AlertDescription className="text-red-100/90">
                            {errorMessage}
                        </AlertDescription>
                        {showResendPrompt && (
                            <div className="mt-3 space-y-2 text-left">
                                <p className="text-sm text-red-100/70">
                                    Didn&apos;t get the email?
                                </p>
                                <Button
                                    type="button"
                                    className="w-full border border-red-400/40 bg-red-500/20 text-red-100 hover:bg-red-500/30"
                                    onClick={handleResendVerification}
                                    disabled={resendStatus === "sending"}
                                >
                                    {resendStatus === "sending" ? "Sending…" : "Resend verification email"}
                                </Button>
                                {resendStatus === "sent" && (
                                    <p className="text-xs text-[#22c55e]">Verification email sent.</p>
                                )}
                            </div>
                        )}
                    </Alert>
                )}
                <div className="space-y-4">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="mb-2 text-white">Email</FormLabel>
                                <FormControl>
                                    <Input placeholder="Enter your email" {...field} className={inputClass} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center justify-between">
                                    <FormLabel className="mb-2 text-white">Password</FormLabel>
                                    <Link href="/forgot-password" className="text-xs text-[#22c55e] hover:underline">
                                        Forgot password?
                                    </Link>
                                </div>
                                <FormControl>
                                    <PasswordInput placeholder="Enter your password" {...field} className={inputClass} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <Button
                    style={{ backgroundColor: "#22c55e", color: "#111411", WebkitTapHighlightColor: "transparent" }}
                    onPointerDown={event => {
                        event.currentTarget.style.setProperty("background", "#22c55e", "important");
                        event.currentTarget.style.setProperty("background-color", "#22c55e", "important");
                        event.currentTarget.style.setProperty("color", "#111411", "important");
                        event.currentTarget.style.setProperty("opacity", "1", "important");
                    }}
                    className='auth-primary-action login-submit-action mt-6 w-full bg-[#22c55e] font-bold text-black hover:bg-[#19a94e]'
                    type="submit"
                >Log In</Button>
            </form>

            <p className="mt-3 text-center text-sm text-white/45">
                If you don&apos;t have an account, please&nbsp;
                <Link className='font-semibold text-[#22c55e] hover:underline' href={signUpHref}>Sign Up</Link>
            </p>
        </Form>
    );
};

export default LogInForm;
