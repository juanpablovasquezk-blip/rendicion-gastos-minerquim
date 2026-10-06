import type { Metadata, Viewport } from "next";
import { Poppins, Quicksand } from "next/font/google";
import "./globals.css";
import { PwaProvider } from "@/components/pwa-provider";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rendición de Gastos | Grupo Minerquim",
  description: "Rendición de gastos y fondos por rendir del Grupo Minerquim",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Rendición",
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ED6A1C",
  width: "device-width",
  initialScale: 1,
};

// Aplica el tema antes de pintar para evitar parpadeo
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CL"
      suppressHydrationWarning
      className={`${poppins.variable} ${quicksand.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}

