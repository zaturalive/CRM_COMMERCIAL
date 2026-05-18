import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { Toaster } from "@/components/ui/Toast";
import { inter, dmSans, jetbrainsMono } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "CRM Chirurgien",
  description: "CRM multi-tenant pour cabinets de chirurgie esthetique",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html
      lang="fr"
      className={cn(inter.variable, dmSans.variable, jetbrainsMono.variable)}
    >
      <body className="font-sans">
        <SessionProvider session={session}>{children}</SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
