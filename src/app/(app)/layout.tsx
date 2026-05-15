import { AppShell } from "@/components/layout/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[color:var(--ks-bg)] text-[color:var(--ks-fg)]">
      <AppShell>{children}</AppShell>
    </div>
  );
}
