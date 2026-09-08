import { auth } from "@/auth";
import { InboxView } from "@/components/inbox-view";
import { MarketingHome } from "@/components/marketing-home";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await auth();
  if (session?.user?.email) return <InboxView />;
  return <MarketingHome errorCode={null} />;
}
