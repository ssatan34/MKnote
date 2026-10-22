import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAiCompletion,
  fetchAiModels,
  type AiRequestError,
} from "../src/utils/aiApi.ts";

type FetchStub = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function requestOptions(fetchImpl: FetchStub, timeoutMs = 100): Parameters<typeof fetchAiCompletion>[0] {
  return {
    apiUrl: "https://ai.example.test/v1",
    apiToken: "test-token",
    model: "test-model",
    prompt: "请改写这段文字",
    timeoutMs,
    fetchImpl: fetchImpl as typeof fetch,
  };
}

function assertAiError(
  code: AiRequestError["code"],
  status?: number,
): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof Error);
    const aiError = error as AiRequestError;
    assert.equal(aiError.code, code);
    if (status === undefined) {
      assert.equal(aiError.status, undefined);
    } else {
      assert.equal(aiError.status, status);
    }
    return true;
  };
}

test("AI completion sends an OpenAI-compatible request and returns trimmed content", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl: FetchStub = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return response({ choices: [{ message: { content: "  改写结果  " } }] });
  };

  const result = await fetchAiCompletion(requestOptions(fetchImpl));

  assert.equal(result, "改写结果");
  assert.equal(requestUrl, "https://ai.example.test/v1/chat/completions");
  assert.equal(requestInit?.method, "POST");
  assert.equal(requestInit?.headers && new Headers(requestInit.headers).get("Authorization"), "Bearer test-token");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    model: "test-model",
    messages: [{ role: "user", content: "请改写这段文字" }],
    stream: false,
  });
});

test("AI completion reports HTTP failures without exposing the token", async () => {
  await assert.rejects(
    fetchAiCompletion(requestOptions(async () => response({ error: "upstream" }, 429))),
    (error: unknown) => {
      assertAiError("http", 429)(error);
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("test-token"));
      return true;
    },
  );
});

test("AI completion rejects malformed JSON responses", async () => {
  const fetchImpl: FetchStub = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("invalid json");
    },
  }) as Response;

  await assert.rejects(
    fetchAiCompletion(requestOptions(fetchImpl)),
    assertAiError("invalid-response"),
  );
});

test("AI completion rejects empty or incomplete response structures", async () => {
  for (const payload of [
    {},
    { choices: [] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: "   " } }] },
  ]) {
    await assert.rejects(
      fetchAiCompletion(requestOptions(async () => response(payload))),
      assertAiError("invalid-response"),
    );
  }
});

test("AI completion converts network failures into a retryable error", async () => {
  let calls = 0;
  const fetchImpl: FetchStub = async () => {
    calls += 1;
    if (calls === 1) throw new Error("connection refused");
    return response({ choices: [{ message: { content: "第二次成功" } }] });
  };

  await assert.rejects(
    fetchAiCompletion(requestOptions(fetchImpl)),
    assertAiError("network"),
  );
  assert.equal(await fetchAiCompletion(requestOptions(fetchImpl)), "第二次成功");
  assert.equal(calls, 2);
});

test("AI completion aborts a request that exceeds the timeout", async () => {
  const fetchImpl: FetchStub = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });

  await assert.rejects(
    fetchAiCompletion(requestOptions(fetchImpl, 5)),
    assertAiError("timeout"),
  );
});

test("AI model discovery uses the shared request boundary and sorts model IDs", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl: FetchStub = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return response({ data: [{ id: " z-model " }, { id: "a-model" }, { id: "" }] });
  };

  const models = await fetchAiModels(
    " https://ai.example.test/v1/// ",
    " test-token ",
    { timeoutMs: 100, fetchImpl: fetchImpl as typeof fetch },
  );

  assert.deepEqual(models, ["a-model", "z-model"]);
  assert.equal(requestUrl, "https://ai.example.test/v1/models");
  assert.equal(requestInit?.method, "GET");
  assert.equal(requestInit?.body, undefined);
});

test("AI model discovery rejects malformed and empty model responses", async () => {
  for (const payload of [{}, { data: [] }, { data: [{ name: "missing-id" }] }]) {
    await assert.rejects(
      fetchAiModels(
        "https://ai.example.test/v1",
        "test-token",
        { fetchImpl: (async () => response(payload)) as typeof fetch },
      ),
      assertAiError("invalid-response"),
    );
  }
});

test("AI requests reject missing credentials before contacting the service", async () => {
  let calls = 0;
  const fetchImpl: FetchStub = async () => {
    calls += 1;
    return response({ choices: [{ message: { content: "unexpected" } }] });
  };

  await assert.rejects(
    fetchAiCompletion({
      ...requestOptions(fetchImpl),
      apiToken: "   ",
    }),
    assertAiError("configuration"),
  );
  assert.equal(calls, 0);
});
