import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ImportWizard } from "@/components/settings/ImportWizard";

export const metadata = {
  title: "Import",
};

export default function SettingsImportPage() {
  return (
    <div>
      <PageHeader
        title="Import"
        description="Bring a library you already have — a Pocket export, browser bookmarks, or any CSV — onto your shelves in one go."
      />
      <ImportWizard />
      <Link
        href="/settings"
        className="ks-pointer-coarse-min-hit mt-6 inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Back to settings
      </Link>
    </div>
  );
}
