import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Signal1",
  description: "Self-hosted X (Twitter) alerts for research operators.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthSessionProvider session={session}>
            <TooltipProvider>
              <AppShell>{children}</AppShell>
              <Toaster />
            </TooltipProvider>
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
