import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { authOptions } from "@/lib/auth";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { Toaster } from "@/components/ui/Toast";
import { inter, dmSans, jetbrainsMono } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "CRM Commercial",
  description: "CRM multi-tenant pour cabinets de prestations esthetiques",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={cn(inter.variable, dmSans.variable, jetbrainsMono.variable)}
    >
      <body className="font-sans">
        {/* Boot-time theme application before React hydrate.
            Lit localStorage `crm-commercial:theme` et applique `theme-light`
            sur body avant le first paint si valeur "light". Defaut = dark.
            Compat : migre anciennes valeurs "vencor" / "classic" -> "dark". */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('crm-commercial:theme');if(t==='light'){document.body.classList.add('theme-light');}if(t==='vencor'||t==='classic'){localStorage.setItem('crm-commercial:theme','dark');}}catch(e){}})();`,
          }}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider session={session}>{children}</SessionProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
