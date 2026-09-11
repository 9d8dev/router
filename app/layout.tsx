import "./globals.css";

import type { Metadata } from "next";

import { Inter } from "next/font/google";
import { ThemeProvider } from "@/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import Nav from "@/components/parts/nav";
import { PostHogProvider } from "@/components/providers/post-hog/post-hog-provider";

const font = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Router.so | The world's simplest lead router",
  description:
    "Router.so is the world's simplest lead router. Built for developers, by developers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${font.className} flex flex-col-reverse sm:grid sm:overflow-hidden sm:h-screen sm:w-screen sm:grid-cols-[256px,1fr]`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PostHogProvider>
            <Nav />
            <main className="py-4 pr-4 pl-4 sm:pl-0 flex flex-col gap-4 min-h-screen">
              {children}
            </main>
            <Toaster />
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
