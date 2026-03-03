"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const logos = [
  { name: "OptSolv", icon: true },
  { name: "Azure DevOps", text: "Azure DevOps" },
  { name: "Firebase", text: "Firebase" },
  { name: "Next.js", text: "Next.js" },
  { name: "Vercel", text: "Vercel" },
];

export function SocialProof() {
  return (
    <section
      id="social-proof"
      className="relative border-y border-white/5 bg-[#111111] py-12"
    >
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-7xl px-4 text-center md:px-8"
      >
        <p className="text-sm font-medium text-white/40">
          Feito para e usado pelo time OptSolv
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-8 md:gap-14">
          {logos.map((logo) => (
            <motion.div
              key={logo.name}
              whileHover={{ opacity: 1, scale: 1.05 }}
              className="flex items-center gap-2 transition-opacity hover:opacity-100"
            >
              {logo.icon ? (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
                    <Image
                      src="/logo-white.svg"
                      alt="OptSolv Logo"
                      width={11}
                      height={16}
                    />
                  </div>
                  <div className="opacity-40">
                    <span className="font-display text-base font-bold text-white">
                      OptSolv
                    </span>
                  </div>
                </>
              ) : (
                <span className="font-display text-base font-semibold text-white/80">
                  {logo.text}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
