import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Museo — Studio de création musicale par IA",
  description:
    "Composez des morceaux complets — musique, voix et paroles — dans tous les styles de l'histoire de la musique, puis transformez-les en clip en un clic.",
};

const NAV = [
  { href: "/", label: "Studio", icon: "♪" },
  { href: "/library", label: "Bibliothèque", icon: "▤" },
  { href: "/voices", label: "Voice Lab", icon: "◉" },
  { href: "/explore", label: "Explorer", icon: "✦" },
  { href: "/settings", label: "Réglages", icon: "⚙" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-edge bg-surface px-4 py-6 md:flex">
            <Link href="/" className="mb-8 flex items-end gap-1 px-2">
              <span className="font-display text-3xl font-bold tracking-tight text-foreground">
                Museo
              </span>
              <span className="mb-1 inline-flex h-2 w-2 rounded-full bg-accent" />
            </Link>
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface2 hover:text-foreground"
                >
                  <span className="w-4 text-center text-accent">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto px-2 text-xs leading-relaxed text-muted">
              Moteur de composition local — vos créations restent sur votre appareil.
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-edge bg-surface px-4 py-3 md:hidden">
              <Link href="/" className="font-display text-2xl font-bold">
                Museo<span className="text-accent">.</span>
              </Link>
              <nav className="flex gap-4 text-sm text-muted">
                {NAV.map((i) => (
                  <Link key={i.href} href={i.href} className="hover:text-foreground">
                    {i.icon}
                  </Link>
                ))}
              </nav>
            </header>
            <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
