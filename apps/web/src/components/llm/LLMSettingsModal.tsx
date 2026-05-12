"use client";

import { useEffect, useState } from "react";
import { X, Settings, Check, Loader2 } from "lucide-react";
import { getProviders, getStoredProvider, setStoredProvider, getStoredModel, setStoredModel, getStoredApiKey, setStoredApiKey, clearStoredApiKey, type ProviderInfo } from "@/lib/deepseek-client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function LLMSettingsModal({ open, onClose }: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState(getStoredProvider());
  const [selectedModel, setSelectedModel] = useState(getStoredModel());
  const [apiKey, setApiKey] = useState(getStoredApiKey() || "");
  const [loading, setLoading] = useState(false);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const models = currentProvider?.models || [];

  useEffect(() => {
    if (open) {
      getProviders().then(setProviders);
    }
  }, [open]);

  const handleSave = () => {
    setStoredProvider(selectedProvider);
    setStoredModel(selectedModel);
    if (apiKey.trim()) {
      setStoredApiKey(apiKey.trim());
    } else {
      clearStoredApiKey();
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-800">LLM Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Provider */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                const p = providers.find((pp) => pp.id === e.target.value);
                setSelectedModel(p?.default_model || "");
              }}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400 mt-1">
              {selectedProvider === "deepseek" && "~$0.14/1M tokens — cheapest option"}
              {selectedProvider === "gemini" && "Free tier available (15 req/min) — no credit card needed"}
              {selectedProvider === "openai" && "~$0.15/1M tokens (GPT-4o mini)"}
              {selectedProvider === "anthropic" && "~$3/1M tokens — most capable, higher cost"}
              {selectedProvider === "openrouter" && "Pay-per-use, some models free. Compare prices on openrouter.ai"}
              {selectedProvider === "qwen" && "~¥2/1M tokens — free trial credits available"}
              {selectedProvider === "kimi" && "~¥1/1M tokens — free trial credits available"}
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">
              API Key <span className="text-zinc-300 font-normal">(stored locally in your browser)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key..."
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Leave empty to use the server's default key (if configured).
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5">
            <Check className="h-4 w-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
