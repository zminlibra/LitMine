import type { Metadata } from "next";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "LitMine — Literature Mining for Life Sciences",
  description:
    "AI-powered literature mining and knowledge graph platform for synthetic biology researchers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-background antialiased">
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
