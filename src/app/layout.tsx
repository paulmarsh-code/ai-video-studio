import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Production Studio",
  description: "Mind First Group Ltd — plan, check and log AI video shots before spending credits.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="antialiased bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
