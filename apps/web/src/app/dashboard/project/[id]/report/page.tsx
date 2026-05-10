"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Report } from "@/types";

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchReports = async () => {
      try {
        const res = await api.get(`/api/v1/projects/${projectId}/reports`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setReports(data.reports || []);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchReports();
    const interval = setInterval(fetchReports, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId]);

  const handleDeleteReport = async (e: React.MouseEvent, reportId: string, title: string) => {
    e.stopPropagation();
    if (!confirm(`确定删除报告「${title}」吗？此操作不可撤销。`)) return;
    try {
      const res = await api.delete(`/api/v1/reports/${reportId}`);
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        toast.success("报告已删除");
      } else {
        const err = await res.json();
        toast.error(err.detail || "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <button
        onClick={() => router.push(`/dashboard/project/${projectId}`)}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to project
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-emerald-600" />
          <h1 className="text-xl font-bold text-zinc-900">Literature Review Reports</h1>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => router.push(`/dashboard/project/${projectId}/report/generate`)}
        >
          Generate New Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <FileText className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
            <CardTitle className="text-zinc-900 mb-2">No reports yet</CardTitle>
            <p className="text-sm text-zinc-500 mb-6">
              Generate your first literature review report to get an AI-powered overview of your research field.
            </p>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => router.push(`/dashboard/project/${projectId}/report/generate`)}
            >
              Generate Report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card
              key={report.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/dashboard/project/${projectId}/report/${report.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base truncate flex-1 mr-2">{report.title}</CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      onClick={(e) => handleDeleteReport(e, report.id, report.title)}
                      title="删除报告"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        report.status === "completed"
                          ? "bg-emerald-50 text-emerald-700"
                          : report.status === "generating"
                          ? "bg-amber-50 text-amber-700"
                          : report.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {report.status}
                    </span>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
