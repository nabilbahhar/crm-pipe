import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "CRM-PIPE",
  description: "CRM + Pipeline + Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
