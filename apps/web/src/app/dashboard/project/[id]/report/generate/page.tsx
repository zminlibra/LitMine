"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function GenerateReportPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [focusAreas, setFocusAreas] = useState("");
  const [maxPapers, setMaxPapers] = useState(20);
  const [submitting, setSubmitting] = useState(false);

  const handleGenerate = async () => {
    setSubmitting(true);
    try {
      const res = await api.post(`/api/v1/projects/${projectId}/reports/generate`, {
        focus_areas: focusAreas
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        max_papers_in_report: maxPapers,
        include_visualizations: true,
      });
      if (res.ok) {
        toast.success("Report generation started!");
        router.push(`/dashboard/project/${projectId}/report`);
      } else {
        const err = await res.json();
        const msg = Array.isArray(err.detail)
          ? err.detail.map((e: any) => e.msg || e).join("; ")
          : (err.detail || "Failed to start generation");
        toast.error(msg);
      }
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <button
        onClick={() => router.push(`/dashboard/project/${projectId}/report`)}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card>
        <CardHeader>
          <CardTitle>Generate Literature Review</CardTitle>
          <CardDescription>
            AI will analyze your papers and generate a structured literature review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Focus Areas (optional)</label>
            <Input
              placeholder="e.g. metabolic engineering applications, off-target effects"
              value={focusAreas}
              onChange={(e) => setFocusAreas(e.target.value)}
            />
            <p className="text-xs text-zinc-400">Comma-separated areas to emphasize in the report.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Papers to Include</label>
            <Input
              type="number"
              min={5}
              max={50}
              value={maxPapers}
              onChange={(e) => setMaxPapers(Number(e.target.value))}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handleGenerate}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating...
              </>
            ) : (
              "Generate Report"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
