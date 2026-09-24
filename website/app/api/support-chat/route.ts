import { NextResponse } from "next/server";
import { runWebsiteSupportChat } from "../../../lib/run-support-chat";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const result = await runWebsiteSupportChat({
    body,
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    },
    fetchImpl: fetch,
  });

  return NextResponse.json(result.body, { status: result.status });
}
