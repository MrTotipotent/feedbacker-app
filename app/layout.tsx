import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feedbacker — NHS Patient Feedback",
  description: "Leave feedback for your GP clinician",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
