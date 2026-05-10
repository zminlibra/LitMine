const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Persist tokens in localStorage so they survive page refreshes
// Also keep in memory for fast access
let accessToken: string | null = null;
let refreshToken: string | null = null;

// Restore from localStorage on module load (client-side only)
if (typeof window !== "undefined") {
  try {
    const stored = localStorage.getItem("litmine_tokens");
    if (stored) {
      const parsed = JSON.parse(stored);
      accessToken = parsed.accessToken || null;
      refreshToken = parsed.refreshToken || null;
    }
  } catch {
    // corrupted data, ignore
  }
}

function persist() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        "litmine_tokens",
        JSON.stringify({ accessToken, refreshToken })
      );
    } catch {
      // storage full or unavailable
    }
  }
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  persist();
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("litmine_tokens");
    } catch {
      // ignore
    }
  }
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (res.ok) {
      const data = await res.json();
      accessToken = data.access_token;
      refreshToken = data.refresh_token;
      persist();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(url, { ...options, headers });

  // If 401, try refresh
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(url, { ...options, headers });
    } else {
      clearTokens();
    }
  }

  return res;
}

// Convenience methods
export const api = {
  get: (path: string) => apiFetch(path),
  post: (path: string, body?: unknown) =>
    apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body?: unknown) =>
    apiFetch(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: "DELETE" }),

  /** XHR-based multipart upload with progress callback.
   *  FormData requires native browser boundary handling which fetch doesn't support for progress. */
  upload: (
    path: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<Response> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${API_BASE}${path}`;

      xhr.open("POST", url);

      if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      }

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        // Build a Response-like object
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          json: async () => JSON.parse(xhr.responseText || "{}"),
        } as Response);
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  },
};
