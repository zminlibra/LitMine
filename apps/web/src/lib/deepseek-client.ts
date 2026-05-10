/**
 * LLM client — all calls go through backend proxy, API key never touches the browser.
 */
import { apiFetch } from "./api-client";

const PROXY_URL = "/api/v1/llm/proxy";

export async function callDeepSeek(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  temperature = 0.5,
  maxTokens = 2000,
  responseFormat?: { type: string }
): Promise<string> {
  const res = await apiFetch(PROXY_URL, {
    method: "POST",
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: responseFormat,
    }),
  });

  if (res.status === 402) throw new Error("DEEPSEEK_QUOTA_EXHAUSTED");
  if (res.status === 401 || res.status === 500) throw new Error("SERVER_KEY_ERROR");

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${text.slice(0, 100)}`);
  }

  const data = await res.json();
  return data.content || "";
}

// ── Backward-compat stubs for components that still check for local keys ──
// These now always return true since the server handles the key.
export function getDeepSeekApiKey(): string | null {
  return "server-managed";
}

export function saveDeepSeekApiKey(_key: string): void {
  // No-op: key is managed server-side
}

export function clearDeepSeekApiKey(): void {
  // No-op
}

export function hasDeepSeekApiKey(): boolean {
  return true;
}
