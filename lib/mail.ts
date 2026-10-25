import { Resend } from "resend";

type Mailer = (to: string, url: string) => Promise<void>;

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendMail(to: string, subject: string, html: string, fallbackLabel: string, fallbackUrl: string, replyTo?: string) {
    if (resendClient) {
        const { error } = await resendClient.emails.send({
            from: (process.env.EMAIL_FROM || "Browsegyms <mail@fittingin.co>").replace(/^Fitting In(?=\s*<)/i, "Browsegyms"),
            to,
            subject,
            html,
            replyTo,
        });
        if (error) {
            console.error("[mail] resend error", error);
            throw new Error(error.message || "Failed to send verification email via Resend");
        }
        return;
    }

    console.warn(`No email provider configured. ${fallbackLabel} logged to console.`);
    console.info(fallbackUrl);
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export async function sendContactMessage(input: { firstName: string; lastName: string; email: string; message: string }) {
    const name = `${input.firstName} ${input.lastName}`.trim();
    const subject = `Browsegyms contact form — ${name}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:32px 20px;color:#111827"><h1 style="font-size:22px">New contact message</h1><p><strong>From:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> <a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></p><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"><div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(input.message)}</div></div>`;
    await sendMail("contactfittingin@gmail.com", subject, html, "[contact-form]", `[contact-form] ${name} <${input.email}>: ${input.message}`, input.email);
}

export const sendPasswordResetEmail: Mailer = async (to, resetUrl) => {
    const subject = "Reset your Browsegyms password";

    const html = `
      <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset your password</title>
</head>

<body style="margin:0;padding:0;background-color:#ffffff;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="border-collapse:collapse;background-color:#ffffff;margin:0;padding:0;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
                    style="border-collapse:collapse;width:560px;max-width:100%;background-color:#ffffff;">
                    <tr>
                        <td align="center"
                            style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;text-align:center;">
                            <p
                                style="margin:0 0 12px 0;font-size:13px;line-height:1.4;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:#16a34a;">
                                Browsegyms
                            </p>

                            <h1
                                style="margin:0 0 16px 0;font-size:26px;line-height:1.25;font-weight:700;color:#0f172a;">
                                Reset your password
                            </h1>

                            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569;">
                                Use the button below to reset your password.
                            </p>

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
                                style="border-collapse:collapse;margin:0 auto 24px auto;">
                                <tr>
                                    <td align="center" bgcolor="#16a34a"
                                        style="border-radius:999px;background-color:#16a34a;">
                                        <a href="${resetUrl}"
                                            style="display:inline-block;padding:14px 26px;font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                                            Reset password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                                This link expires in 1 hour. If you didn&apos;t request it, ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>

</html>
    `.trim();

    await sendMail(to, subject, html, "[password-reset]", `[password-reset] ${to}: ${resetUrl}`);
};

export const sendEmailVerificationEmail: Mailer = async (to, verifyUrl) => {
    const subject = "Verify your Browsegyms email";

    const html = `
      <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Browsegyms</title>
</head>

<body style="margin:0;padding:0;background-color:#ffffff;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="border-collapse:collapse;background-color:#ffffff;margin:0;padding:0;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
                    style="border-collapse:collapse;width:560px;max-width:100%;background-color:#ffffff;">
                    <tr>
                        <td align="center"
                            style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;text-align:center;">
                            <p
                                style="margin:0 0 12px 0;font-size:13px;line-height:1.4;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:#16a34a;">
                                Find your fit
                            </p>

                            <h1
                                style="margin:0 0 16px 0;font-size:26px;line-height:1.25;font-weight:700;color:#0f172a;">
                                Welcome to Browsegyms!
                            </h1>

                            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569;">
                                Find the right gym at the right price.
                            </p>

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
                                style="border-collapse:collapse;margin:0 auto 24px auto;">
                                <tr>
                                    <td align="center" bgcolor="#16a34a"
                                        style="border-radius:999px;background-color:#16a34a;">
                                        <a href="${verifyUrl}"
                                            style="display:inline-block;padding:14px 26px;font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                                            Verify email
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0 0 24px 0;font-size:14px;line-height:1.5;color:#0f172a;">
                                Have a question? Visit
                                <a href="https://browsegyms.com/legal/contact"
                                    style="color:#16a34a;text-decoration:none;">
                                    Contact Us
                                </a>.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
    `.trim();

    await sendMail(to, subject, html, "[verify-email]", `[verify-email] ${to}: ${verifyUrl}`);
};

export async function sendEmailVerificationCode(to: string, code: string) {
    const subject = `${code} is your Browsegyms verification code`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:40px 20px;text-align:center"><p style="color:#16a34a;font-size:13px;font-weight:700;letter-spacing:4px;text-transform:uppercase">Browsegyms</p><h1 style="font-size:26px;color:#111827">Verify your email</h1><p style="color:#64748b">Enter this six-digit code in Browsegyms. It expires in 10 minutes.</p><div style="margin:28px 0;font-size:38px;font-weight:800;letter-spacing:10px;color:#111827">${code}</div><p style="font-size:13px;color:#94a3b8">If you did not request this code, you can ignore this email.</p></div>`;
    await sendMail(to, subject, html, "[verification-code]", `[verification-code] ${to}: ${code}`);
}
