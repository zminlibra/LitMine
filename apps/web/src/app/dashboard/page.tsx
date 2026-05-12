"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PlusCircle, BookOpen, ChevronRight, Loader2, Trash2, Eye, Columns3, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/types";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [guideModal, setGuideModal] = useState<{ title: string; message: string; linkLabel?: string; linkAction?: () => void } | null>(null);
  const [projectPicker, setProjectPicker] = useState<{ action: (projectId: string) => void } | null>(null);

  useEffect(() => {
    api.get("/api/v1/projects")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        } else if (res.status === 401) {
          router.push("/login");
        } else {
          setProjects([]);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateProject = () => router.push("/dashboard/project/new");

  // Step-guard: ensure a prerequisite step is met, or show guidance modal.
  // If multiple projects exist, let the user choose which one.
  const requireProject = (nextAction: (projectId: string) => void) => {
    if (projects.length === 1) {
      nextAction(projects[0].id);
    } else if (projects.length > 1) {
      setProjectPicker({ action: nextAction });
    } else {
      setGuideModal({
        title: "No project yet",
        message: "You need to create a project first. Once you have a project, you can discover papers and start exploring.",
        linkLabel: "Create a project now",
        linkAction: () => { setGuideModal(null); handleCreateProject(); },
      });
    }
  };

  const requirePapers = (projectId: string, nextAction: () => void) => {
    // We can't know paper count without fetching, so just navigate
    // The project page itself has the Discover button with pulse glow
    router.push(`/dashboard/project/${projectId}?guide=discover`);
  };

  const handleOpenProject = (id: string) => router.push(`/dashboard/project/${id}`);

  const handleDeleteProject = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete project \u201c${name}\u201d? All papers and reports will also be deleted.`)) return;
    try {
      const res = await api.delete(`/api/v1/projects/${id}`);
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        toast.success("Project deleted");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Delete failed");
      }
    } catch {
      toast.error("Delete failed, please retry");
    }
  };

  const hasProject = projects.length > 0;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Research Projects</h1>
          <p className="text-zinc-500 mt-1">Manage your literature mining projects.</p>
        </div>
        <Button onClick={handleCreateProject} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
          <PlusCircle className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* Three step-guide cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {/* Card 1: Survey */}
        <Card className="border-emerald-200 bg-gradient-to-b from-emerald-50/40 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Eye className="h-4 w-4 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-800">Survey the landscape</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-3">
              Discover papers across multiple databases, then see research hotspots and trends in Analytics.
            </p>
            <div className="text-[10px] space-y-1">
              <div>
                <span className="text-emerald-600 font-medium">1.</span>{" "}
                <button onClick={handleCreateProject} className="text-emerald-600 hover:underline font-medium">
                  Create a project
                </button>
                {hasProject && <span className="text-emerald-400 ml-0.5">&#10003;</span>}
              </div>
              <div>
                <span className="text-emerald-600 font-medium">2.</span>{" "}
                <button
                  onClick={() => requireProject((pid) => router.push(`/dashboard/project/${pid}?guide=discover`))}
                  className="text-emerald-600 hover:underline font-medium"
                >
                  Discover papers
                </button>
                <span className="text-zinc-600 ml-1">(then click a paper to analyze it)</span>
              </div>
              <div>
                <span className="text-emerald-600 font-medium">3.</span>{" "}
                <button
                  onClick={() => requireProject((pid) => router.push(`/dashboard/project/${pid}/graph`))}
                  className="text-emerald-600 hover:underline font-medium"
                >
                  Open Analytics
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Compare */}
        <Card className="border-violet-200 bg-gradient-to-b from-violet-50/40 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <Columns3 className="h-4 w-4 text-violet-600" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-800">Compare papers deeply</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-3">
              AI-powered comparison across methodology, findings, strengths and gaps. Select papers and start.
            </p>
            <div className="text-[10px] space-y-1">
              <div>
                <span className="text-violet-600 font-medium">1.</span>{" "}
                <button onClick={() => requireProject((pid) => router.push(`/dashboard/project/${pid}`))} className="text-violet-600 hover:underline font-medium">
                  Open a project
                </button>
                {hasProject && <span className="text-violet-400 ml-0.5">&#10003;</span>}
              </div>
              <div>
                <span className="text-violet-600 font-medium">2.</span>{" "}
                <button
                  onClick={() => requireProject((pid) => router.push(`/dashboard/project/${pid}?guide=compare`))}
                  className="text-violet-600 hover:underline font-medium"
                >
                  Enable Compare mode
                </button>
              </div>
              <div>
                <span className="text-violet-600 font-medium">3.</span>{" "}
                <span className="text-zinc-600">Select papers &#8594; Start</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Write */}
        <Card className="border-indigo-200 bg-gradient-to-b from-indigo-50/40 to-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <FileText className="h-4 w-4 text-indigo-600" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-800">Write your review</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed mb-3">
              Generate a structured literature review with tables and a narrative introduction for your paper.
            </p>
            <div className="text-[10px] space-y-1">
              <div>
                <span className="text-indigo-600 font-medium">1.</span>{" "}
                <button onClick={() => requireProject((pid) => router.push(`/dashboard/project/${pid}`))} className="text-indigo-600 hover:underline font-medium">
                  Open a project
                </button>
                {hasProject && <span className="text-indigo-400 ml-0.5">&#10003;</span>}
              </div>
              <div>
                <span className="text-indigo-600 font-medium">2.</span>{" "}
                <button
                  onClick={() => requireProject((pid) => router.push(`/dashboard/project/${pid}/report`))}
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Go to Report tab
                </button>
              </div>
              <div>
                <span className="text-indigo-600 font-medium">3.</span>{" "}
                <span className="text-zinc-600">Generate</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project list */}
      {projects.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <BookOpen className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
            <CardTitle className="text-zinc-900 mb-2">No projects yet</CardTitle>
            <CardDescription className="mb-6">
              Create your first literature mining project to start analyzing papers.
            </CardDescription>
            <Button onClick={handleCreateProject} className="bg-emerald-600 hover:bg-emerald-700">
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
                      title="Delete project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="h-5 w-5 text-zinc-400" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm text-zinc-500">
                  <span><strong className="text-zinc-700">{project.paper_count}</strong> papers</span>
                  <span className="flex items-center gap-1">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      project.crawl_status === "completed" ? "bg-emerald-500" :
                      project.crawl_status === "failed" ? "bg-red-500" :
                      project.crawl_status === "idle" ? "bg-zinc-300" : "bg-amber-500 animate-pulse"
                    }`} />
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

      {/* Guidance modal */}
      {guideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">{guideModal.title}</h3>
                <p className="text-xs text-zinc-500 mt-1">{guideModal.message}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setGuideModal(null)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 rounded-md hover:bg-zinc-100 transition-colors">
                Dismiss
              </button>
              {guideModal.linkAction && (
                <button onClick={guideModal.linkAction} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors">
                  {guideModal.linkLabel || "Go"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project picker modal — multiple projects, let user choose */}
      {projectPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Choose a project</h3>
            <div className="space-y-1.5 mb-4">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProjectPicker(null); projectPicker.action(p.id); }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-zinc-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-sm text-zinc-700"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-zinc-400 ml-2">{p.paper_count} papers</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={handleCreateProject} className="text-xs text-emerald-600 hover:underline font-medium">
                + Create new project
              </button>
              <button onClick={() => setProjectPicker(null)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 rounded-md hover:bg-zinc-100 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
