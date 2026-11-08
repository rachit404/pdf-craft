import type { Metadata } from "next";
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
