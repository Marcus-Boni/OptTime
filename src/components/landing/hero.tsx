"use client";

import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Animated number counter for stats */
function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 1500;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // Ease out cubic
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [isInView, value]);

  return (
    <span ref={ref} className="font-mono">
      {display}
      {suffix}
    </span>
  );
}

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), {
    stiffness: 100,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), {
    stiffness: 100,
    damping: 30,
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: <Not needed, it's just for mouse tracking>
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden px-4 pb-20 pt-32 md:px-8 md:pb-32 md:pt-40"
    >
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0">
        {/* Mesh gradient */}
        <div className="absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full bg-brand-500/8 blur-[120px]" />
        <div className="absolute -bottom-20 -left-40 h-[400px] w-[400px] rounded-full bg-brand-500/5 blur-[100px]" />

        {[
          "particle-a",
          "particle-b",
          "particle-c",
          "particle-d",
          "particle-e",
        ].map((particleId, i) => (
          <motion.div
            key={particleId}
            className="absolute h-1 w-1 rounded-full bg-brand-500/30"
            style={{
              top: `${20 + i * 15}%`,
              left: `${10 + i * 20}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 4 + i,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — Text */}
          <div>
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-400 backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                </span>
                Plataforma Corporativa OptSolv · v1.8 Oficial
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-6 font-display text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl"
              style={{
                fontSize: "clamp(2.5rem, 5vw, 4.5rem)",
              }}
            >
              Suas horas,
              <br />
              organizadas com{" "}
              <span className="gradient-text">precisão cirúrgica.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-6 max-w-lg text-lg leading-relaxed text-white/60"
            >
              Registro inteligente e governança de tempo integrado nativamente
              ao Azure DevOps — desenvolvido sob medida para a OptSolv.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              <Button
                size="lg"
                className="shimmer-btn gap-2 bg-brand-500 px-8 text-base font-semibold text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25"
                asChild
              >
                <Link href="/login">
                  Acessar Agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 border-white/10 px-8 text-base text-white hover:bg-white/5"
                asChild
              >
                <a href="#video-demo">
                  <Play className="h-4 w-4" />
                  Ver Demo (90s)
                </a>
              </Button>
            </motion.div>
          </div>

          {/* Right — Dashboard Preview Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            style={{ rotateX, rotateY, perspective: 1000 }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#171717] p-1 shadow-2xl shadow-brand-500/10">
              {/* Mock browser chrome */}
              <div className="flex items-center gap-1.5 rounded-t-xl bg-[#0a0a0a] px-4 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                <div className="ml-4 flex-1 rounded-md bg-white/5 px-3 py-1 text-center font-mono text-[10px] text-white/40">
                  time.optsolv.com.br/dashboard
                </div>
              </div>

              {/* Dashboard mockup content */}
              <div className="space-y-3 bg-[#0a0a0a] p-4">
                {/* Header bar with live timer badge */}
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-white">
                      01:42:15
                    </span>
                    <span className="rounded bg-brand-500/15 px-1.5 py-0.5 font-mono text-[9px] text-brand-400">
                      AB#2184
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50">
                      Azure DevOps Sync
                    </span>
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                  </div>
                </div>

                {/* Summary cards row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      label: "Hoje",
                      value: "6h 15m",
                      color: "bg-brand-500",
                    },
                    {
                      label: "Semana",
                      value: "38.5h",
                      color: "bg-blue-500",
                    },
                    {
                      label: "Projetos",
                      value: "5 Ativos",
                      color: "bg-green-500",
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5"
                    >
                      <div className="text-[9px] text-white/40">
                        {card.label}
                      </div>
                      <div className="mt-1 font-mono text-sm font-bold text-white">
                        {card.value}
                      </div>
                      <div
                        className={`mt-1.5 h-1 w-2/3 rounded-full ${card.color} opacity-60`}
                      />
                    </div>
                  ))}
                </div>

                {/* Recent entries mockup with real enterprise context */}
                <div className="space-y-1.5">
                  {[
                    {
                      project: "OptSolv Platform · Core",
                      task: "Sincronização Azure DevOps Pipelines & MCP Server",
                      time: "3h 30m",
                      tag: "AB#1924",
                      color: "#f97316",
                    },
                    {
                      project: "Executive HQ · Analytics",
                      task: "Magic Reconstructor & Gestão de Times",
                      time: "2h 45m",
                      tag: "AB#1855",
                      color: "#3b82f6",
                    },
                  ].map((item) => (
                    <div
                      key={item.task}
                      className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-white">
                              {item.project}
                            </span>
                            <span className="font-mono text-[9px] text-white/40">
                              {item.tag}
                            </span>
                          </div>
                          <div className="text-[10px] text-white/50">
                            {item.task}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-white/80">
                        {item.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Glow effect behind mockup */}
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-brand-500/5 blur-2xl" />
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-8 border-t border-white/5 pt-8 md:gap-16"
        >
          {[
            { value: 2400, suffix: "h", label: "registradas" },
            { value: 30, suffix: "", label: "colaboradores" },
            { value: 100, suffix: "%", label: "integrado" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-2xl font-bold text-white md:text-3xl">
                <AnimatedNumber value={stat.value} suffix={stat.suffix} />
              </div>
              <div className="mt-1 text-xs text-white/40">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
