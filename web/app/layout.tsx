import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "NEAS Online Store — NextEdge Access Solutions",
  description: "Certified rope access and height-safety equipment from NextEdge Access Solutions (NEAS) OPC.",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" /></head>
      <body>
        <Header />
        <main>{children}</main>
        <footer className="ftr"><div className="wrap"><span>© 2026 NextEdge Access Solutions (NEAS) OPC · <a href="/privacy-policy">Privacy Policy</a></span><span>sales@nextedge-access-solutions.com · +63 991 426 5886</span></div></footer>
      </body>
    </html>
  );
}
