import type { Metadata } from "next";
import type { ReactNode } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiteVelocity",
  description: "Evidence-backed development opportunity intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
