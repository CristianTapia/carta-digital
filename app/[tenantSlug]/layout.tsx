import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export default function PublicMenuLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${plusJakarta.className} public-menu-theme min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]`}>
      {children}
    </div>
  );
}
