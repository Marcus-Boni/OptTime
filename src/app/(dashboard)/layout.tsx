"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  useEffect(() => {
    useUIStore.persist.rehydrate();
  }, []);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      <Sidebar />

      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-300",
          sidebarCollapsed ? "lg:ml-18" : "lg:ml-65",
        )}
      >
        <Header />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
