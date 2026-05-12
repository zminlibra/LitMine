/**
 * LLM client — supports multiple providers.
 * All calls go through backend proxy. API keys stored in localStorage.
 */

const STORAGE_PROVIDER = "litmine_llm_provider";
const STORAGE_KEY = "litmine_llm_key";
const STORAGE_MODEL = "litmine_llm_model";

const PROXY_URL = "/api/v1/llm/proxy";

export interface ProviderInfo {
  id: string;
  name: string;
  models: string[];
  default_model: string;
}

let _providersCache: ProviderInfo[] | null = null;

export async function getProviders(): Promise<ProviderInfo[]> {
  if (_providersCache) return _providersCache;
  try {
    const { apiFetch } = await import("./api-client");
    const res = await apiFetch("/api/v1/llm/providers");
    if (res.ok) {
      const data = await res.json();
      _providersCache = data.providers || [];
      return _providersCache!;
    }
  } catch { /* non-blocking */ }
  return [];
}

function getStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function setStored(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function getStoredProvider(): string {
  return getStored(STORAGE_PROVIDER) || "deepseek";
}

export function setStoredProvider(provider: string): void {
  setStored(STORAGE_PROVIDER, provider);
}

export function getStoredModel(): string {
  return getStored(STORAGE_MODEL) || "";
}

export function setStoredModel(model: string): void {
  setStored(STORAGE_MODEL, model);
}

export function getStoredApiKey(): string | null {
  return getStored(STORAGE_KEY);
}

export function setStoredApiKey(key: string): void {
  setStored(STORAGE_KEY, key.trim());
}

export function clearStoredApiKey(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function hasStoredApiKey(): boolean {
  const key = getStoredApiKey();
  return !!key && key.length > 0;
}

export async function callDeepSeek(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  temperature = 0.5,
  maxTokens = 2000,
  responseFormat?: { type: string }
): Promise<string> {
  const { apiFetch } = await import("./api-client");
  const provider = getStoredProvider();
  const model = getStoredModel() || undefined;
  const apiKey = getStoredApiKey() || undefined;

  const res = await apiFetch(PROXY_URL, {
    method: "POST",
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: responseFormat,
      provider,
      model,
      api_key: apiKey,
    }),
  });

  if (res.status === 402) throw new Error("DEEPSEEK_QUOTA_EXHAUSTED");
  if (res.status === 401) throw new Error("INVALID_API_KEY");
  if (res.status === 429) throw new Error("RATE_LIMITED");

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${text.slice(0, 100)}`);
  }

  const data = await res.json();
  return data.content || "";
}

// Backward-compat stubs
export function getDeepSeekApiKey(): string | null {
  return getStoredApiKey();
}

export function saveDeepSeekApiKey(key: string): void {
  setStoredApiKey(key);
}

export function clearDeepSeekApiKey(): void {
  clearStoredApiKey();
}

export function hasDeepSeekApiKey(): boolean {
  return hasStoredApiKey() || true; // server may have its own key
}
