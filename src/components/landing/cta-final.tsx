"use client";

import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaFinal() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      {/* Dramatic gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-950/20 via-[#0a0a0a] to-[#070708]" />

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0">
        {["cta-dot-1", "cta-dot-2", "cta-dot-3"].map((dotId, i) => (
          <motion.div
            key={dotId}
            className="absolute h-1.5 w-1.5 rounded-full bg-brand-500/20"
            style={{
              top: `${30 + i * 20}%`,
              left: `${20 + i * 30}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: 5 + i,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 mx-auto max-w-3xl px-4 text-center md:px-8"
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-400">
          <Sparkles className="h-3.5 w-3.5" />
          Acesso Corporativo Seguro
        </div>

        <h2 className="font-display text-3xl font-bold text-white md:text-4xl lg:text-5xl">
          Pronto para organizar
          <br />
          <span className="gradient-text">suas horas de trabalho?</span>
        </h2>
        <p className="mt-4 text-base text-white/60">
          Ambiente restrito e homologado para consultores e liderança da
          OptSolv. Entre com seu email corporativo Microsoft Entra ID ou
          credenciais internas.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            size="lg"
            className="shimmer-btn gap-2 bg-brand-500 px-10 py-6 text-lg font-bold text-white shadow-xl shadow-brand-500/30 hover:bg-brand-600 transition-transform active:scale-95"
            asChild
          >
            <Link href="/login">
              Acessar o App Agora
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/40">
          <ShieldCheck className="h-4 w-4 text-green-400" />
          <span>
            Autenticação segura via Single Sign-On (Microsoft Entra ID)
          </span>
        </div>
      </motion.div>
    </section>
  );
}
