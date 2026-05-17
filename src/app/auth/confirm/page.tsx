import Link from "next/link";
import { redirect } from "next/navigation";

import { ThequeLogo } from "@/components/brand/ThequeLogo";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { sanitizeRedirectPath } from "@/app/login/login-utils";

type ConfirmPageProps = {
  searchParams: Promise<{
    next?: string;
    token_hash?: string;
    type?: string;
  }>;
};

function isEmailOtpType(value: string | undefined) {
  return (
    value === "signup" ||
    value === "invite" ||
    value === "magiclink" ||
    value === "recovery" ||
    value === "email_change" ||
    value === "email"
  );
}

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const next = sanitizeRedirectPath(params.next ?? null);
  const tokenHash = params.token_hash;
  const type = params.type;

  if (!tokenHash || !isEmailOtpType(type)) {
    redirect("/login?error=auth&reason=missing_code");
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="m-0 max-w-full p-0">
            <ThequeLogo size="xl" href="/" className="text-card-foreground" />
          </h1>
          <CardDescription>Confirm this sign-in to continue to your private taste library.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/auth/callback" method="post" className="space-y-4">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="inline-flex h-11 w-full min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Continue to thèque
            </button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            We ask for this extra tap so email preview scanners cannot use your one-time sign-in link.
          </p>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link
              href="/login"
              className="-mx-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 py-2 text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
