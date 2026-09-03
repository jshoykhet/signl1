import { auth } from "@/auth";
import { InboxView } from "@/components/inbox-view";
import { MarketingHome } from "@/components/marketing-home";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.email) return <InboxView />;
  const params = await searchParams;
  return <MarketingHome errorCode={params.error ?? null} />;
}
