"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PlusCircle, BookOpen, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/v1/projects")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        } else if (res.status === 401) {
          // Token expired or not available — redirect to login
          router.push("/login");
        } else {
          setProjects([]);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateProject = () => {
    router.push("/dashboard/project/new");
  };

  const handleOpenProject = (id: string) => {
    router.push(`/dashboard/project/${id}`);
  };

  const handleDeleteProject = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`确定删除项目「${name}」吗？该项目下的所有论文和报告也会一并删除，此操作不可撤销。`)) return;
    try {
      const res = await api.delete(`/api/v1/projects/${id}`);
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        toast.success("项目已删除");
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
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Research Projects</h1>
          <p className="text-zinc-500 mt-1">Manage your literature mining projects.</p>
        </div>
        <Button
          onClick={handleCreateProject}
          className="bg-emerald-600 hover:bg-emerald-700 gap-2"
        >
          <PlusCircle className="h-4 w-4" /> New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <BookOpen className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
            <CardTitle className="text-zinc-900 mb-2">No projects yet</CardTitle>
            <CardDescription className="mb-6">
              Create your first literature mining project to start analyzing papers.
            </CardDescription>
            <Button
              onClick={handleCreateProject}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <PlusCircle className="h-4 w-4 mr-2" /> Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleOpenProject(project.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg text-zinc-900 truncate">{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="mt-1">{project.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      onClick={(e) => handleDeleteProject(e, project.id, project.name)}
                      title="删除项目"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="h-5 w-5 text-zinc-400" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm text-zinc-500">
                  <span>
                    <strong className="text-zinc-700">{project.paper_count}</strong> papers
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        project.crawl_status === "completed"
                          ? "bg-emerald-500"
                          : project.crawl_status === "failed"
                          ? "bg-red-500"
                          : project.crawl_status === "idle"
                          ? "bg-zinc-300"
                          : "bg-amber-500 animate-pulse"
                      }`}
                    />
                    {project.crawl_status}
                  </span>
                  {project.keywords && project.keywords.length > 0 && (
                    <span className="truncate">
                      Keywords: {project.keywords.slice(0, 3).join(", ")}
                      {project.keywords.length > 3 ? "..." : ""}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
