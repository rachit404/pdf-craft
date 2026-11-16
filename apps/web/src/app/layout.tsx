import type { Metadata } from "next";

import ThemeProvider from "@/components/theme/ThemeProvider";
import Toaster from "@/components/ui/Toaster";
import { themeInitScript } from "@/lib/themes";

import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Craft | Your PDF Workspace",
  description:
    "A private, self-hosted workspace to merge, edit, convert and protect PDF documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The theme script sets attributes on <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
