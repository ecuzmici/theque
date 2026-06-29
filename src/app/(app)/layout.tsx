import { AppShell } from "@/components/layout/AppShell";
import { RecommendationProvider } from "@/components/recommend/RecommendationProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <RecommendationProvider>
        <AppShell>{children}</AppShell>
      </RecommendationProvider>
    </div>
  );
}
