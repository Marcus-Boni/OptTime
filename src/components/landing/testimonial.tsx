"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";

export function Testimonial() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="relative rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-14 backdrop-blur-xl shadow-2xl"
        >
          {/* Decorative quotes */}
          <span
            className="pointer-events-none absolute left-6 top-4 font-display text-8xl font-bold text-brand-500 opacity-20 select-none md:left-8 md:top-6 md:text-9xl"
            aria-hidden="true"
          >
            &ldquo;
          </span>

          <blockquote className="relative z-10">
            <p className="font-display text-xl leading-relaxed font-medium text-white md:text-2xl lg:text-3xl lg:leading-relaxed">
              O OptSolv Time Tracker facilitou a rotina da equipe, eliminando
              planilhas manuais e simplificando o acompanhamento semanal de
              horas.
            </p>
            <footer className="mt-8">
              <div className="font-display text-sm font-semibold text-white">
                Operações & Gestão de Projetos
              </div>
              <p className="mt-0.5 text-xs text-brand-400 font-mono">
                OptSolv Soluções em Tecnologia · 2026
              </p>
            </footer>
          </blockquote>

          {/* Metric highlights - honest & grounded */}
          <div className="mt-10 grid grid-cols-1 gap-4 border-t border-white/10 pt-8 sm:grid-cols-3">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-brand-400">
                <Clock className="h-4 w-4" />
                <span className="font-mono text-lg font-bold text-white">
                  3h/sem
                </span>
              </div>
              <span className="mt-1 text-xs text-white/50">
                Tempo Manual Poupado
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-mono text-lg font-bold text-white">
                  &lt; 2 min
                </span>
              </div>
              <span className="mt-1 text-xs text-white/50">
                Registro Diário por Consultor
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-blue-400">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-mono text-lg font-bold text-white">
                  100%
                </span>
              </div>
              <span className="mt-1 text-xs text-white/50">
                Integrado ao Azure DevOps
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
