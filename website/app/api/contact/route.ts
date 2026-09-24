import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

type ContactPayload = {
  email: string;
  message: string;
  supportType: "customer" | "pro";
  redirectTo?: string;
  source?: "form" | "support-chat";
};

const DEFAULT_SUPPORT_EMAIL = "henry@helprservices.co";
const MAX_MESSAGE_LENGTH = 8000;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asSupportType(value: unknown): "customer" | "pro" {
  return value === "pro" ? "pro" : "customer";
}

function sanitizedRedirectPath(path?: string) {
  if (!path) return undefined;
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  return path;
}

function payloadFromRecord(record: Record<string, unknown>): ContactPayload {
  return {
    email: String(record.email || "").trim(),
    message: String(record.message || "").trim(),
    supportType: asSupportType(record.supportType),
    redirectTo: String(record.redirectTo || "").trim() || undefined,
    source: record.source === "support-chat" ? "support-chat" : "form",
  };
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

function validatePayload(payload: ContactPayload) {
  if (!payload.email || !payload.message) {
    return "Email and message are required.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "A valid email is required.";
  }
  if (payload.message.length > MAX_MESSAGE_LENGTH) {
    return `Message is limited to ${MAX_MESSAGE_LENGTH} characters.`;
  }
  return null;
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
  const subject =
    payload.source === "support-chat"
      ? `${subjectPrefix} Chat escalation`
      : `${subjectPrefix} New contact form message`;
  const safeMessage = escapeHtml(payload.message).replace(/\n/g, "<br />");
  const safeEmail = escapeHtml(payload.email);

  await transporter.sendMail({
    from: process.env.SMTP_FROM_EMAIL,
    to: supportInbox,
    replyTo: payload.email,
    subject,
    text: `Support Type: ${payload.supportType}\nSource: ${payload.source}\nFrom: ${payload.email}\n\nMessage:\n${payload.message}`,
    html: `
      <p><strong>Support Type:</strong> ${payload.supportType}</p>
      <p><strong>Source:</strong> ${payload.source}</p>
      <p><strong>From:</strong> ${safeEmail}</p>
      <p><strong>Message:</strong></p>
      <p>${safeMessage}</p>
    `,
  });
}

function failureRedirect(requestUrl: URL, redirectPath: string | undefined, status: string) {
  if (!redirectPath) return null;
  return NextResponse.redirect(new URL(`${redirectPath}?status=${status}`, requestUrl));
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const asJson = contentType.includes("application/json");
  let payload: ContactPayload;

  try {
    if (asJson) {
      const raw = (await request.json()) as Record<string, unknown>;
      payload = payloadFromRecord(raw ?? {});
    } else {
      const formData = await request.formData();
      payload = payloadFromRecord({
        email: formData.get("email"),
        message: formData.get("message"),
        supportType: formData.get("supportType"),
        redirectTo: formData.get("redirectTo"),
        source: "form",
      });
    }
  } catch {
    if (asJson) {
      return NextResponse.json(
        { error: "invalid_json", message: "Request body must be JSON." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "invalid_form", message: "The contact form could not be read." },
      { status: 400 },
    );
  }

  const redirectPath = asJson ? undefined : sanitizedRedirectPath(payload.redirectTo);
  const requestUrl = new URL(request.url);
  const validationError = validatePayload(payload);

  if (validationError) {
    const status = validationError.startsWith("Email and message")
      ? "missing_fields"
      : validationError.startsWith("A valid email")
        ? "invalid_email"
        : "invalid_request";
    const redirected = failureRedirect(requestUrl, redirectPath, status);
    if (redirected) return redirected;
    return NextResponse.json({ error: "invalid_request", message: validationError }, { status: 400 });
  }

  if (!isSmtpConfigured()) {
    const redirected = failureRedirect(requestUrl, redirectPath, "email_not_configured");
    if (redirected) return redirected;
    return NextResponse.json(
      {
        error: "email_not_configured",
        message: "Email was not sent. SMTP is not configured on this site, so nothing was delivered.",
      },
      { status: 503 },
    );
  }

  try {
    await sendSupportEmail(payload);
    const redirected = failureRedirect(requestUrl, redirectPath, "sent");
    if (redirected) return redirected;
    return NextResponse.json({
      ok: true,
      message: "Your message was sent to Helpr support.",
    });
  } catch (error) {
    console.error("Failed to send support email:", error);
    const redirected = failureRedirect(requestUrl, redirectPath, "send_failed");
    if (redirected) return redirected;
    return NextResponse.json(
      { error: "send_failed", message: "Your message could not be sent. Nothing was delivered." },
      { status: 500 },
    );
  }
}
