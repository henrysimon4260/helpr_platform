const STATUS_COPY: Record<string, { tone: "ok" | "error"; text: string }> = {
  sent: {
    tone: "ok",
    text: "Your message was sent to Helpr support.",
  },
  email_not_configured: {
    tone: "error",
    text: "Email was not sent. SMTP is not configured on this site, so nothing was delivered.",
  },
  send_failed: {
    tone: "error",
    text: "Your message could not be sent. Nothing was delivered.",
  },
  missing_fields: {
    tone: "error",
    text: "Email and message are required. Nothing was sent.",
  },
  invalid_email: {
    tone: "error",
    text: "A valid email is required. Nothing was sent.",
  },
  invalid_request: {
    tone: "error",
    text: "That message could not be sent. Nothing was delivered.",
  },
};

export default function ContactStatus({ status }: { status?: string }) {
  if (!status || !STATUS_COPY[status]) return null;
  const copy = STATUS_COPY[status];
  const className =
    copy.tone === "ok"
      ? "mt-4 rounded-xl border border-[#1f4d2c]/30 bg-[#e7f5e8] px-4 py-3 text-sm text-[#1f4d2c]"
      : "mt-4 rounded-xl border border-[#8a2a2a]/30 bg-[#fdecec] px-4 py-3 text-sm text-[#8a2a2a]";

  return (
    <p role="status" className={className}>
      {copy.text}
    </p>
  );
}
