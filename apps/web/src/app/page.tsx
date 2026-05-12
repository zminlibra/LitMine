"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Microscope, ArrowRight, BookOpen, BarChart3, FileText } from "lucide-react";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-bold text-xl text-zinc-900">
            <Microscope className="h-6 w-6 text-emerald-600" />
            LitMine
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => router.push("/login")}>
              Log in
            </Button>
            <Button onClick={() => router.push("/register")} className="bg-emerald-600 hover:bg-emerald-700">
              Sign up free
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900">
            Mine the Literature.
            <br />
            <span className="text-emerald-600">Discover What Matters.</span>
          </h1>
          <p className="mt-6 text-lg text-zinc-500 max-w-2xl mx-auto">
            LitMine is an AI-powered literature mining platform for researchers across all disciplines.
            Discover papers, analyze trends, and generate literature reviews — all in one place.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => router.push("/register")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Create free account <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push("/login")}>
              I already have an account
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: <BookOpen className="h-8 w-8 text-emerald-600" />,
                title: "Smart Paper Discovery",
                desc: "Search arXiv, PubMed, bioRxiv, and OpenAlex simultaneously. Automatic deduplication and metadata extraction.",
              },
              {
                icon: <BarChart3 className="h-8 w-8 text-emerald-600" />,
                title: "Research Analytics",
                desc: "Dynamic hotspot trends and gap analysis — no hardcoded domain vocabulary, works for any field.",
              },
              {
                icon: <FileText className="h-8 w-8 text-emerald-600" />,
                title: "Literature Review Generation",
                desc: "Generate structured reviews with tables, bullet points, and a narrative introduction ready for your paper.",
              },
            ].map((feat, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 p-6">
                <div className="mb-3">{feat.icon}</div>
                <h3 className="font-semibold text-lg mb-2 text-zinc-900">{feat.title}</h3>
                <p className="text-sm text-zinc-500">{feat.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
