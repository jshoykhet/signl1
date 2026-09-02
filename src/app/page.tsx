import { auth } from "@/auth";
import { InboxView } from "@/components/inbox-view";
import { MarketingHome } from "@/components/marketing-home";
import { isDevLoginEnabled, isGoogleAuthConfigured, isPublicSignup } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) return <InboxView />;
  const params = await searchParams;
  return (
    <MarketingHome
      googleConfigured={isGoogleAuthConfigured()}
      devLogin={isDevLoginEnabled()}
      errorCode={params.error ?? null}
      publicSignup={isPublicSignup()}
    />
  );
}
