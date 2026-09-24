import {
  completeSupportChat,
  missingKeyBody,
  publicFailureMessage,
  validateSupportRequest,
  type FetchLike,
  type SupportChatErrorBody,
  type SupportChatSuccess,
} from "./support-bot";

export type SupportEnv = {
  OPENAI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};

export type SupportHttpResult = {
  status: number;
  body: SupportChatSuccess | SupportChatErrorBody;
};

function errorBody(
  error: SupportChatErrorBody["error"],
  message: string,
): SupportChatErrorBody {
  return { error, message };
}

function functionUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/support-chat`;
}

async function readFunctionResponse(response: {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}): Promise<SupportHttpResult> {
  const raw = await response.text();
  try {
    const body = JSON.parse(raw) as SupportChatSuccess | SupportChatErrorBody;
    if (body && typeof body === "object") {
      return { status: response.status, body };
    }
  } catch {
    // Non-JSON usually means the function is not deployed.
  }

  return {
    status: 502,
    body: errorBody(
      "support_failed",
      "The support-chat function did not return a reply. It may not be deployed yet. Nothing was answered.",
    ),
  };
}

export async function runWebsiteSupportChat(options: {
  body: unknown;
  env: SupportEnv;
  fetchImpl: FetchLike;
}): Promise<SupportHttpResult> {
  const parsed = validateSupportRequest(options.body);
  if (!parsed.ok) {
    return {
      status: 400,
      body: errorBody("invalid_request", parsed.message),
    };
  }

  const supabaseUrl = options.env.SUPABASE_URL?.trim();
  const anonKey = options.env.SUPABASE_ANON_KEY?.trim();
  if (supabaseUrl && anonKey) {
    try {
      const response = await options.fetchImpl(functionUrl(supabaseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(parsed.value),
      });
      return await readFunctionResponse(response);
    } catch {
      return {
        status: 502,
        body: errorBody(
          "support_failed",
          "Support chat could not reach the support-chat function. Nothing was answered.",
        ),
      };
    }
  }

  const apiKey = options.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { status: 503, body: missingKeyBody("website") };
  }

  try {
    const result = await completeSupportChat(apiKey, parsed.value, options.fetchImpl);
    return { status: 200, body: result };
  } catch (error) {
    return {
      status: 502,
      body: errorBody("support_failed", publicFailureMessage(error)),
    };
  }
}
