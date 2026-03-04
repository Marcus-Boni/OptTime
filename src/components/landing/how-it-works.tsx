"use client";

import {
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { useRef } from "react";

interface Step {
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
  badge: string;
  detail: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Registre suas horas",
    description:
      "Adicione horas manualmente ou com o timer ao vivo. Vincule ao Azure DevOps com autocomplete inteligente e zero digitação.",
    icon: Clock,
    badge: "Timer & Manual",
    detail: "< 2 min por registro",
  },
  {
    number: "02",
    title: "Submeta para aprovação",
    description:
      "Envie sua semana para o manager com um clique. Acompanhe o status em tempo real e receba notificações automáticas.",
    icon: CheckCircle2,
    badge: "1 clique",
    detail: "Notificação instantânea",
  },
  {
    number: "03",
    title: "Acompanhe resultados",
    description:
      "Managers aprovam e você acessa dashboards, relatórios analíticos e exports profissionais em qualquer formato.",
    icon: ShieldCheck,
    badge: "Dashboard & Exports",
    detail: "Relatórios profissionais",
  },
];

function TimelineStep({
  step,
  index,
  isLast,
}: {
  step: Step;
  index: number;
  isLast: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.4 });

  const cardVariants = {
    hidden: { opacity: 0, x: -32, filter: "blur(4px)" },
    visible: {
      opacity: 1,
      x: 0,
      filter: "blur(0px)",
      transition: {
        duration: 0.6,
        delay: index * 0.18,
        ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
      },
    },
  };

  const dotVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        duration: 0.4,
        delay: index * 0.18 + 0.1,
        type: "spring" as const,
        stiffness: 300,
        damping: 20,
      },
    },
  };

  const pulseVariants = {
    hidden: { scale: 1, opacity: 0 },
    visible: {
      scale: [1, 1.8, 1],
      opacity: [0, 0.4, 0],
      transition: {
        duration: 2.5,
        delay: index * 0.18 + 0.5,
        repeat: Infinity,
        ease: "easeOut" as const,
      },
    },
  };

  return (
    <div ref={ref} className="relative flex gap-6 md:gap-10">
      {/* Left: dot + line */}
      <div className="relative flex flex-col items-center">
        {/* Pulse ring */}
        <motion.div
          variants={pulseVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="absolute top-0 h-10 w-10 rounded-full bg-orange-500/30"
          aria-hidden="true"
        />

        {/* Dot */}
        <motion.div
          variants={dotVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-orange-500/40 bg-neutral-900 shadow-[0_0_16px_rgba(249,115,22,0.25)]"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20">
            <div className="h-2 w-2 rounded-full bg-orange-400" />
          </div>
        </motion.div>

        {/* Connector line */}
        {!isLast && (
          <div className="mt-2 w-px flex-1 bg-gradient-to-b from-orange-500/30 via-orange-500/10 to-transparent" />
        )}
      </div>

      {/* Right: card */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        className={`group relative mb-12 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-neutral-900/60 p-6 shadow-xl backdrop-blur-sm transition-colors duration-300 hover:border-orange-500/20 md:p-8 ${isLast ? "mb-0" : ""}`}
      >
        {/* Glow on hover */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(249,115,22,0.04), transparent 40%)",
          }}
          aria-hidden="true"
        />

        {/* Top accent stripe */}
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />

        {/* Step number */}
        <div className="mb-4 flex items-start justify-between">
          <span className="font-mono text-4xl font-bold leading-none text-white/[0.06] select-none">
            {step.number}
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
              {step.badge}
            </span>
          </div>
        </div>

        {/* Icon + Title */}
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 ring-1 ring-orange-500/20">
            <step.icon className="h-4 w-4 text-orange-400" aria-hidden="true" />
          </div>
          <h3 className="font-sora text-lg font-semibold text-white">
            {step.title}
          </h3>
        </div>

        {/* Description */}
        <p className="mb-5 text-sm leading-relaxed text-neutral-400">
          {step.description}
        </p>

        {/* Footer detail */}
        <div className="flex items-center gap-2 border-t border-white/[0.05] pt-4">
          <div
            className="h-1.5 w-1.5 rounded-full bg-green-400"
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-neutral-500">
            {step.detail}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.9", "end 0.6"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 20,
    restDelta: 0.001,
  });

  const progressHeight = useTransform(smoothProgress, [0, 1], ["0%", "100%"]);

  const titleVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      },
    },
  };

  const subtitleVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.7,
        delay: 0.1,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      },
    },
  };

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative overflow-hidden py-24 md:py-36"
      aria-labelledby="how-it-works-title"
    >
      {/* Background decorations */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-2xl px-4 md:px-8">
        {/* Title block */}
        <div className="mb-16 text-center">
          <motion.div
            variants={titleVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <span className="mb-4 inline-block rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-orange-400">
              Como funciona
            </span>
            <h2
              id="how-it-works-title"
              className="font-sora mt-4 text-3xl font-bold text-white md:text-4xl"
            >
              Simples como{" "}
              <span className="bg-gradient-to-r from-orange-400 to-orange-500 bg-clip-text text-transparent">
                1, 2, 3
              </span>
            </h2>
          </motion.div>

          <motion.p
            variants={subtitleVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mt-4 text-base leading-relaxed text-neutral-400"
          >
            Menos de{" "}
            <strong className="font-medium text-neutral-200">
              5 minutos por dia
            </strong>{" "}
            para manter suas horas sempre em dia.
          </motion.p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Continuous progress track (desktop) */}
          <div
            className="pointer-events-none absolute bottom-0 left-[19px] top-0 w-px bg-white/[0.04]"
            aria-hidden="true"
          >
            <motion.div
              style={{ height: progressHeight }}
              className="w-full origin-top bg-gradient-to-b from-orange-500 via-orange-400/60 to-orange-500/10"
            />
          </div>

          {/* Steps */}
          <div>
            {steps.map((step, index) => (
              <TimelineStep
                key={step.number}
                step={step}
                index={index}
                isLast={index === steps.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
