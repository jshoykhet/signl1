import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { isDevLoginEnabled } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.email) redirect("/");

  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/") && !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/";

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/signl1-logo-256.png"
            alt="Signl1"
            width={56}
            height={56}
            className="size-14 rounded-[18px] shadow-lg ring-1 ring-amber-400/25"
          />
          <h1 className="mt-6 text-[28px] font-semibold tracking-[-0.03em]">Sign in</h1>
        </div>
        <LoginForm devLogin={isDevLoginEnabled()} callbackUrl={callbackUrl} errorCode={params.error ?? null} />
      </div>
    </div>
  );
}
