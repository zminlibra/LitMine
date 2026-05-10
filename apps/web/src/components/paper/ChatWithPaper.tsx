"use client";

import { useRef, useState } from "react";
import { MessageCircle, Loader2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { callDeepSeek } from "@/lib/deepseek-client";

interface Props {
  title: string;
  abstract: string;
}

export function ChatWithPaper({ title, abstract }: Props) {
  type Message = { role: "user" | "assistant"; content: string };
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);

    const updated: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages([...updated, { role: "assistant", content: "..." }]);
    setLoading(true);

    try {
      const systemMsg = `You are an AI research assistant helping a researcher understand this paper. Answer questions concisely and accurately based on the paper content. If the answer is not in the paper, say so honestly. Reply in the same language the user used.\n\nPaper Title: ${title}\n${abstract ? `Abstract: ${abstract}` : ""}`;

      const reply = await callDeepSeek(
        [
          { role: "system", content: systemMsg },
          ...updated.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ],
        0.5,
        2000,
      );

      setMessages([...updated, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      const msg = (e as Error).message || "";
      if (msg === "DEEPSEEK_QUOTA_EXHAUSTED") {
        setError("API quota exhausted.");
      } else {
        setError(`Error: ${msg.slice(0, 120)}`);
      }
      setMessages(updated);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-zinc-500" />
          <h3 className="text-lg font-semibold text-zinc-800">Chat with Paper</h3>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-zinc-400" /> : <ChevronDown className="h-5 w-5 text-zinc-400" />}
      </button>

      {isOpen && (
        <div className="px-6 pb-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>
          )}

          <div className="max-h-80 overflow-y-auto space-y-3 mb-4">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-emerald-700" : "text-zinc-700"}`}>
                <span className="font-semibold text-xs uppercase tracking-wide text-zinc-400">
                  {m.role === "user" ? "You" : "AI"}
                </span>
                <p className="mt-0.5 leading-relaxed whitespace-pre-line">{m.content}</p>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-sm text-zinc-400">Ask a question about this paper.</p>
            )}
          </div>

          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="e.g. What is the key finding of this paper?"
              className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
