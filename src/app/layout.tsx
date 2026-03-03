import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Sora } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "OptSolv Time Tracker",
    template: "%s | OptSolv Time",
  },
  description:
    "Registro inteligente de tempo integrado ao Azure DevOps — feito para o time OptSolv.",
  keywords: ["time tracker", "optsolv", "horas", "azure devops"],
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${sora.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "bg-card border-border",
              title: "text-foreground",
              description: "text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
