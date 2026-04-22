import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

type ContactPayload = {
  email: string;
  message: string;
  supportType: "customer" | "pro";
  redirectTo?: string;
};

const DEFAULT_SUPPORT_EMAIL = "henry@helprservices.co";

function parsePayload(requestBody: FormData): ContactPayload {
  const supportTypeValue = String(requestBody.get("supportType") || "customer");

  return {
    email: String(requestBody.get("email") || "").trim(),
    message: String(requestBody.get("message") || "").trim(),
    supportType: supportTypeValue === "pro" ? "pro" : "customer",
    redirectTo: String(requestBody.get("redirectTo") || "").trim() || undefined,
  };
}

function sanitizedRedirectPath(path?: string) {
  if (!path) return undefined;
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  return path;
}

function isSmtpConfigured() {
  return (
    !!process.env.SMTP_HOST &&
    !!process.env.SMTP_PORT &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASS &&
    !!process.env.SMTP_FROM_EMAIL
  );
}

async function sendSupportEmail(payload: ContactPayload) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const supportInbox = process.env.SUPPORT_INBOX_EMAIL || DEFAULT_SUPPORT_EMAIL;
  const subjectPrefix =
    payload.supportType === "pro" ? "[Helpr Pro Support]" : "[Helpr Support]";

  await transporter.sendMail({
    from: process.env.SMTP_FROM_EMAIL,
    to: supportInbox,
    replyTo: payload.email,
    subject: `${subjectPrefix} New contact form message`,
    text: `Support Type: ${payload.supportType}\nFrom: ${payload.email}\n\nMessage:\n${payload.message}`,
    html: `
      <p><strong>Support Type:</strong> ${payload.supportType}</p>
      <p><strong>From:</strong> ${payload.email}</p>
      <p><strong>Message:</strong></p>
      <p>${payload.message.replace(/\n/g, "<br />")}</p>
    `,
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const payload = parsePayload(formData);
  const redirectPath = sanitizedRedirectPath(payload.redirectTo);
  const requestUrl = new URL(request.url);

  if (!payload.email || !payload.message) {
    if (redirectPath) {
      return NextResponse.redirect(
        new URL(`${redirectPath}?status=missing_fields`, requestUrl),
      );
    }

    return NextResponse.json(
      { error: "Email and message are required." },
      { status: 400 },
    );
  }

  if (!isSmtpConfigured()) {
    if (redirectPath) {
      return NextResponse.redirect(
        new URL(`${redirectPath}?status=email_not_configured`, requestUrl),
      );
    }

    return NextResponse.json(
      { error: "SMTP is not configured on this deployment." },
      { status: 500 },
    );
  }

  try {
    await sendSupportEmail(payload);

    if (redirectPath) {
      return NextResponse.redirect(
        new URL(`${redirectPath}?status=sent`, requestUrl),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to send support email:", error);

    if (redirectPath) {
      return NextResponse.redirect(
        new URL(`${redirectPath}?status=send_failed`, requestUrl),
      );
    }

    return NextResponse.json(
      { error: "Message could not be sent." },
      { status: 500 },
    );
  }
}
