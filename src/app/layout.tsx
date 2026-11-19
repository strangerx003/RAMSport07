import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { withBasePath } from "@/lib/base-path";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "RAMSport ? RAMS engineering workbench",
  description: "Reliability, availability, maintainability and safety workbench for RBD and FTA analysis",
  applicationName: "RAMSport",
  icons: { icon: withBasePath("/brand-mark.svg") },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071526",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The theme is a UI preference kept in a first-party cookie, so the server can
  // render the correct palette without a flash and without browser storage.
  const theme = (await cookies()).get("ramsport-theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
