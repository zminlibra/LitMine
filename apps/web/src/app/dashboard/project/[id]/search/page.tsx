"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, SearchIcon, Loader2 } from "lucide-react";
import type { Paper } from "@/types";

export default function SearchPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Paper[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(
        `/api/v1/projects/${projectId}/search?q=${encodeURIComponent(query)}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.papers || []);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <button
        onClick={() => router.push(`/dashboard/project/${projectId}`)}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to project
      </button>

      <h1 className="text-xl font-bold text-zinc-900 mb-4">Search Papers</h1>

      <div className="flex gap-2 mb-6">
        <Input
          placeholder="Search in list..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
          Search
        </Button>
      </div>

      {searched && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8 text-center">No papers found.</p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {results.map((paper) => (
                  <div
                    key={paper.id}
                    className="py-3 cursor-pointer hover:bg-zinc-50"
                    onClick={() => router.push(`/dashboard/project/${projectId}/papers/${paper.id}`)}
                  >
                    <h4 className="text-sm font-medium text-zinc-900">{paper.title}</h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      {paper.authors?.[0] && <span>{paper.authors[0]} et al.</span>}
                      <span>{paper.year}</span>
                      <span className="uppercase">{paper.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
