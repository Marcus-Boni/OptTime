"use client";

import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 md:flex-row md:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
            <Image
              src="/logo-white.svg"
              alt="OptSolv Logo"
              width={9}
              height={14}
            />
          </div>
          <span className="font-display text-sm font-bold text-white">
            OptSolv
          </span>
          <span className="font-display text-sm font-light text-brand-500">
            Time
          </span>
        </Link>

        {/* Info */}
        <div className="text-center text-xs text-white/30 md:text-right">
          <p>Desenvolvido para o Hackathon OptSolv 2026</p>
          <p className="mt-0.5">
            © 2026 OptSolv. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
