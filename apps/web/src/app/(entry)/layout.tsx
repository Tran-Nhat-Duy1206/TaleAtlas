import type { Metadata } from "next";
import { branding } from "@/lib/branding";
import "../globals.css";
export const metadata: Metadata = {
  title: branding.name,
  description: branding.description,
};
export default function EntryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
