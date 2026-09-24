import assert from "node:assert/strict";
import { test } from "node:test";
import { runWebsiteSupportChat } from "./run-support-chat";

const request = {
  audience: "customer",
  channel: "website",
  messages: [{ role: "user", content: "What fees does Helpr charge?" }],
};

test("missing website secrets returns support_unavailable and no reply", async () => {
  const result = await runWebsiteSupportChat({
    body: request,
    env: {},
    fetchImpl: async () => {
      throw new Error("should not call the network");
    },
  });

  assert.equal(result.status, 503);
  assert.equal("reply" in result.body, false);
  if ("error" in result.body) {
    assert.equal(result.body.error, "support_unavailable");
  }
});

test("a configured function error is passed through instead of a fake reply", async () => {
  const result = await runWebsiteSupportChat({
    body: request,
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon",
      OPENAI_API_KEY: "should-not-be-used",
    },
    fetchImpl: async (url) => {
      assert.match(String(url), /\/functions\/v1\/support-chat$/);
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
        text: async () =>
          JSON.stringify({
            error: "support_unavailable",
            message:
              "Support chat is unavailable because OPENAI_API_KEY is not set on the support-chat function. Nothing was answered.",
          }),
      };
    },
  });

  assert.equal(result.status, 503);
  assert.equal("reply" in result.body, false);
  if ("error" in result.body) {
    assert.equal(result.body.error, "support_unavailable");
    assert.match(result.body.message, /support-chat function/);
  }
});

test("non-JSON from the function is not treated as success", async () => {
  const result = await runWebsiteSupportChat({
    body: request,
    env: { SUPABASE_URL: "https://example.supabase.co/", SUPABASE_ANON_KEY: "anon" },
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "<html>not found</html>",
    }),
  });

  assert.equal(result.status, 502);
  if ("error" in result.body) {
    assert.equal(result.body.error, "support_failed");
    assert.match(result.body.message, /not be deployed/);
  } else {
    assert.fail("expected an error body");
  }
});

test("website OpenAI path returns a real reply only when the model responds", async () => {
  const result = await runWebsiteSupportChat({
    body: request,
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: async (url, init) => {
      assert.match(String(url), /api\.openai\.com/)
      const body = JSON.parse(init?.body ?? "{}") as {
        messages: Array<{ role: string; content: string }>;
      };
      assert.match(body.messages[0]?.content ?? "", /3% payment processing fee/);
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Helpr adds a 3% payment processing fee and a 1% platform fee.",
                  escalate: false,
                }),
              },
            },
          ],
        }),
      };
    },
  });

  assert.equal(result.status, 200);
  if ("reply" in result.body) {
    assert.match(result.body.reply, /3%/);
    assert.equal(result.body.escalate, false);
  } else {
    assert.fail("expected a reply");
  }
});
