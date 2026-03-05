"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-4 font-mono text-[8rem] font-black leading-none text-brand-500 drop-shadow-md">
          404
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <h1 className="mb-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Página não encontrada
        </h1>
        <p className="mb-8 max-w-md text-lg text-neutral-400">
          Parece que você se perdeu no tempo. A página que você está procurando
          não existe ou foi movida.
        </p>

        <div className="flex flex-col flex-wrap items-center justify-center gap-4 sm:flex-row">
          {/* Workaround for history.back in Link: use useRouter if needed or just use regular button with onClick */}
          {/* We'll just define two links here for simplicity, one for home and one for dashboard */}
          <Button asChild variant="secondary" className="gap-2 h-12 px-6">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Dashboard
            </Link>
          </Button>
          <Button
            asChild
            className="gap-2 h-12 px-6 bg-brand-500 text-white hover:bg-brand-600"
          >
            <Link href="/">
              <Home className="h-4 w-4" />
              Ir para o Início
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
