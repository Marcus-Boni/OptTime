"use client";

import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSmoothScroll } from "./smooth-scroll";

export function Footer() {
  const { scrollTo } = useSmoothScroll();

  return (
    <footer className="relative border-t border-white/[0.08] bg-[#070708] pt-16 pb-12">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand-500/5 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 md:px-8">
        {/* Top Header */}
        <div className="flex flex-col items-start justify-between gap-6 border-b border-white/[0.06] pb-12 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-500/30">
                <Image
                  src="/logo-white.svg"
                  alt="OptSolv Logo"
                  width={14}
                  height={21}
                />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-white">
                OptSolv
              </span>
              <span className="font-display text-xl font-light tracking-tight text-brand-500">
                Time
              </span>
            </Link>
          </div>

          <p className="max-w-md text-xs leading-relaxed text-white/50 md:text-right">
            Sistema corporativo para registro e gestão de horas de trabalho,
            integrado ao Azure DevOps para a equipe OptSolv.
          </p>
        </div>

        {/* 3 Columns Grid */}
        <div className="grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 md:grid-cols-3">
          {/* Col 1: Navegação */}
          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-white">
              Navegação
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/60">
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo("#video-demo", -72)}
                  className="transition-colors hover:text-white text-left"
                >
                  Demonstração em Vídeo
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo("#features", -72)}
                  className="transition-colors hover:text-white text-left"
                >
                  Funcionalidades
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo("#how-it-works", -72)}
                  className="transition-colors hover:text-white text-left"
                >
                  Como Funciona
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo("#social-proof", -72)}
                  className="transition-colors hover:text-white text-left"
                >
                  Tecnologias
                </button>
              </li>
            </ul>
          </div>

          {/* Col 2: Solução Corporativa */}
          <div>
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-white">
              Recursos do Sistema
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/60">
              <li>
                <Link
                  href="/login"
                  className="transition-colors hover:text-white"
                >
                  Timer ao Vivo & Registro Manual
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="transition-colors hover:text-white"
                >
                  Integração Azure DevOps
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="transition-colors hover:text-white"
                >
                  Fluxo de Aprovação Semanal
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="transition-colors hover:text-white"
                >
                  Painel de Gestão & Indicadores
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="transition-colors hover:text-white"
                >
                  Relatórios em Excel e PDF
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Ambiente Corporativo & Governança */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-white">
                  Ambiente Corporativo
                </h4>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Operacional
              </span>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-white/60">
              Plataforma interna com autenticação via{" "}
              <strong className="text-white">Microsoft Entra ID</strong>,
              auditoria de horas e integração contínua com o{" "}
              <strong className="text-white">Azure DevOps</strong>.
            </p>

            <div className="mt-4 pt-4 border-t border-white/5">
              <Link
                href="/login"
                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition-all hover:border-brand-500/40 hover:bg-brand-500/10"
              >
                <span className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-white/70" />
                  <span>Acesso Corporativo Seguro</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-white/50 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-400" />
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom copyright and signature bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 text-xs text-white/40 md:flex-row">
          <p>
            © 2026 OptSolv Soluções em Tecnologia. Todos os direitos reservados.
          </p>
          <p className="flex items-center gap-1.5">
            <span>Desenvolvido por</span>
            <a
              href="https://github.com/Marcus-Boni"
              target="_blank"
              rel="noreferrer"
              className="text-white hover:text-brand-400 transition-colors font-medium underline underline-offset-4 decoration-white/20 hover:decoration-brand-400"
            >
              Marcus Boni
            </a>
            <span>para a OptSolv</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
