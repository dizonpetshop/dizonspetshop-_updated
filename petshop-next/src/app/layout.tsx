import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIZON'S Pet Grooming",
  description: "Premium pet care, grooming, and essentials in one place.",
  icons: { icon: "/assets/dizons-logo-transparent.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var saved=localStorage.getItem('petshop-theme');var theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme}catch(e){document.documentElement.dataset.theme='light'}})();` }} /></head>
      <body>{children}</body>
    </html>
  );
}
