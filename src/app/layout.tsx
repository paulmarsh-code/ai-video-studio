import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Production Studio",
  description: "Mind First Group Ltd — plan, check and log AI video shots before spending credits.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="antialiased bg-neutral-50 text-neutral-900">
        <div className="flex min-h-screen flex-col md:flex-row">
          <nav className="border-b border-neutral-200 bg-neutral-900 px-4 py-3 text-neutral-100 md:w-56 md:border-b-0 md:border-r md:py-6">
            <Link href="/" className="block text-lg font-semibold">Video Studio</Link>
            <p className="text-xs text-neutral-400">Mind First</p>
            <ul className="mt-3 flex gap-4 text-sm md:mt-6 md:flex-col md:gap-2">
              <li><Link className="hover:text-white" href="/">Projects</Link></li>
              <li><Link className="hover:text-white" href="/library">Library</Link></li>
            </ul>
          </nav>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
