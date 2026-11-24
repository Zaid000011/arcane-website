import type { Metadata } from "next";
import { Anton, Cairo, Cinzel, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { HideOnAdmin } from "@/components/layout/HideOnAdmin";
import { I18nProvider } from "@/i18n/client";
import { dirOf } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import "./globals.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const cinzel = Cinzel({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-cinzel", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return {
    title: { default: dict.meta.title, template: "%s · Arcane Studios" },
    description: dict.meta.description,
    openGraph: { title: dict.meta.title, description: dict.meta.description, images: ["/brand/logo-seal.svg"] },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${anton.variable} ${cinzel.variable} ${inter.variable} ${cairo.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <I18nProvider locale={locale} dict={dict}>
          <HideOnAdmin>
            <Header />
          </HideOnAdmin>
          <main id="main">{children}</main>
          <HideOnAdmin>
            <Footer dict={dict} locale={locale} />
          </HideOnAdmin>
        </I18nProvider>
      </body>
    </html>
  );
}
