import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Envy Texts",
  description: "Internal SMS platform for Salon Envy USA",
  robots: { index: false, follow: false },
};

export default function RootLayout({
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
