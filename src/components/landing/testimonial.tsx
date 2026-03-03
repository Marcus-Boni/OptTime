"use client";

import { motion } from "framer-motion";

export function Testimonial() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="relative"
        >
          {/* Decorative quotes */}
          <span
            className="pointer-events-none absolute -left-4 -top-8 font-display text-8xl font-bold text-brand-500 opacity-20 select-none md:-left-12 md:-top-12 md:text-9xl"
            aria-hidden="true"
          >
            &ldquo;
          </span>

          <blockquote className="relative z-10">
            <p className="font-display text-xl leading-relaxed font-medium text-white md:text-2xl lg:text-3xl lg:leading-relaxed">
              O OptSolv Time Tracker eliminou{" "}
              <span className="gradient-text font-bold">
                3 horas de trabalho manual
              </span>{" "}
              por semana na nossa equipe.
            </p>
            <footer className="mt-8">
              <p className="text-sm font-medium text-white/60">
                — Equipe OptSolv, 2026
              </p>
            </footer>
          </blockquote>

          {/* Decorative closing quotes */}
          <span
            className="pointer-events-none absolute -bottom-6 -right-4 font-display text-8xl font-bold text-brand-500 opacity-20 select-none md:-bottom-10 md:-right-12 md:text-9xl"
            aria-hidden="true"
          >
            &rdquo;
          </span>
        </motion.div>
      </div>
    </section>
  );
}
