export type AiRequestErrorCode =
  | "configuration"
  | "timeout"
  | "http"
  | "invalid-response"
  | "network";

export class AiRequestError extends Error {
  readonly code: AiRequestErrorCode;
  readonly status?: number;

  constructor(code: AiRequestErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AiRequestError";
    this.code = code;
    this.status = status;
  }
}

export interface AiCompletionRequestOptions {
  apiUrl: string;
  apiToken: string;
  model?: string | null;
  prompt: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface AiJsonRequestOptions {
  apiUrl: string;
  apiToken: string;
  path: string;
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_AI_REQUEST_TIMEOUT_MS = 30_000;

function normalizeBaseUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, "");
}

function validateRequestOptions(apiUrl: string, apiToken: string, timeoutMs: number): void {
  if (!apiUrl || !apiToken) {
    throw new AiRequestError("configuration", "请先在设置中配置 AI API");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AiRequestError("configuration", "AI 请求超时配置无效");
  }
}

async function requestAiJson(options: AiJsonRequestOptions): Promise<unknown> {
  const base = normalizeBaseUrl(options.apiUrl);
  const token = options.apiToken.trim();
  const timeoutMs = options.timeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS;
  validateRequestOptions(base, token, timeoutMs);

  const controller = new AbortController();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${base}/${options.path}`, {
      method: options.body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AiRequestError("http", `AI 请求失败 (HTTP ${response.status})`, response.status);
    }

    try {
      return await response.json();
    } catch {
      throw new AiRequestError("invalid-response", "AI 返回的数据格式无效");
    }
  } catch (cause) {
    if (cause instanceof AiRequestError) throw cause;
    if (controller.signal.aborted) {
      throw new AiRequestError("timeout", "AI 请求超时，请稍后重试");
    }
    throw new AiRequestError("network", "AI 请求失败，请检查网络后重试");
  } finally {
    clearTimeout(timeout);
  }
}

function readCompletionText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export async function fetchAiCompletion(options: AiCompletionRequestOptions): Promise<string> {
  const data = await requestAiJson({
    apiUrl: options.apiUrl,
    apiToken: options.apiToken,
    path: "chat/completions",
    body: {
      model: options.model?.trim() || "deepseek-chat",
      messages: [{ role: "user", content: options.prompt }],
      stream: false,
    },
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const text = readCompletionText(data);
  if (!text) throw new AiRequestError("invalid-response", "AI 未返回有效内容");
  return text;
}

export interface AiModelsRequestOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchAiModels(
  apiUrl: string,
  apiToken: string,
  options: AiModelsRequestOptions = {},
): Promise<string[]> {
  const data = await requestAiJson({
    apiUrl,
    apiToken,
    path: "models",
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  if (!data || typeof data !== "object") {
    throw new AiRequestError("invalid-response", "AI 返回的数据格式无效");
  }
  const rawModels = (data as { data?: unknown }).data;
  if (!Array.isArray(rawModels)) {
    throw new AiRequestError("invalid-response", "AI 返回的数据格式无效");
  }
  const models = rawModels
    .map((model) => {
      if (!model || typeof model !== "object") return null;
      const id = (model as { id?: unknown }).id;
      return typeof id === "string" ? id.trim() : null;
    })
    .filter((id): id is string => Boolean(id));
  if (!models.length) throw new AiRequestError("invalid-response", "未获取到可用模型");
  models.sort((a, b) => a.localeCompare(b));
  return models;
}

export interface AiConnectionTestOptions {
  apiUrl: string;
  apiToken: string;
  model?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface AiConnectionTestResult {
  models: string[];
  model: string;
}

const AI_CONNECTION_TEST_PROMPT = "Reply with exactly OK.";

export async function testAiConnection(
  options: AiConnectionTestOptions,
): Promise<AiConnectionTestResult> {
  const models = await fetchAiModels(options.apiUrl, options.apiToken, {
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const model = options.model?.trim() || models[0];
  if (!model) {
    throw new AiRequestError("configuration", "请先选择 AI 模型");
  }

  await fetchAiCompletion({
    apiUrl: options.apiUrl,
    apiToken: options.apiToken,
    model,
    prompt: AI_CONNECTION_TEST_PROMPT,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });

  return { models, model };
}
