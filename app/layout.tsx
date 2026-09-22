import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rifa de Sexto",
  description: "Elegí tu número, colaborá con sexto grado y guardá tu comprobante.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
