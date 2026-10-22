import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as aiApi from "../src/utils/aiApi.ts";

type FetchStub = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type AiConnectionTest = (options: {
  apiUrl: string;
  apiToken: string;
  model?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) => Promise<{ models: string[]; model: string }>;

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function getAiConnectionTest(): AiConnectionTest {
  const candidate = (aiApi as { testAiConnection?: AiConnectionTest }).testAiConnection;
  assert.equal(typeof candidate, "function");
  return candidate as AiConnectionTest;
}

test("AI 连接测试同时验证模型列表与对话接口，且不发送用户正文", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchStub = async (input, init) => {
    requests.push({ url: String(input), init });
    if (requests.length === 1) {
      return response({ data: [{ id: "configured-model" }] });
    }
    return response({ choices: [{ message: { content: "OK" } }] });
  };

  const result = await getAiConnectionTest()({
    apiUrl: "https://ai.example.test/v1",
    apiToken: "test-token",
    model: "configured-model",
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.deepEqual(result, {
    models: ["configured-model"],
    model: "configured-model",
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://ai.example.test/v1/models");
  assert.equal(requests[1].url, "https://ai.example.test/v1/chat/completions");
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    model: "configured-model",
    messages: [{ role: "user", content: "Reply with exactly OK." }],
    stream: false,
  });
});

test("AI 连接测试在未填写模型时使用发现的第一个模型", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchStub = async (input, init) => {
    requests.push({ url: String(input), init });
    return requests.length === 1
      ? response({ data: [{ id: "z-model" }, { id: "a-model" }] })
      : response({ choices: [{ message: { content: "OK" } }] });
  };

  const result = await getAiConnectionTest()({
    apiUrl: "https://ai.example.test/v1",
    apiToken: "test-token",
    model: "   ",
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.equal(result.model, "a-model");
  assert.equal(JSON.parse(String(requests[1].init?.body)).model, "a-model");
});

test("AI 连接测试保留对话接口错误且不泄露 Token", async () => {
  let calls = 0;
  const fetchImpl: FetchStub = async () => {
    calls += 1;
    return calls === 1
      ? response({ data: [{ id: "configured-model" }] })
      : response({ error: "upstream" }, 503);
  };

  await assert.rejects(
    getAiConnectionTest()({
      apiUrl: "https://ai.example.test/v1",
      apiToken: "secret-token",
      model: "configured-model",
      fetchImpl: fetchImpl as typeof fetch,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, "http");
      assert.ok(!error.message.includes("secret-token"));
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("AI 配置面板的 Test 入口使用真实对话链路测试，而不是只请求模型列表", () => {
  const panelSource = readFileSync("src/components/AiConfigPanel.tsx", "utf8");
  assert.match(panelSource, /testAiConnection/);
  assert.match(panelSource, /对话接口可用/);
});
