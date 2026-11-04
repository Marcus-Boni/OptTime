import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Sora } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.css";

const themeScript = `
  try {
    var stored = JSON.parse(localStorage.getItem('optsolv-ui') || '{}');
    var theme = stored.state && stored.state.theme ? stored.state.theme : 'dark';
    var isDark = theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : theme !== 'light';
    document.documentElement.classList.toggle('dark', isDark);
  } catch (_) {
    document.documentElement.classList.add('dark');
  }
`;

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
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Blocking script — runs before first paint to prevent theme FOUC */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: safe — content is a hardcoded literal string, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${sora.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
