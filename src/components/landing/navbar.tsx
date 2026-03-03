"use client";

import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Como funciona", href: "#how-it-works" },
  { label: "Integrações", href: "#social-proof" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <motion.div
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.6 }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500"
          >
            <Image
              src="/logo-white.svg"
              alt="OptSolv Logo"
              width={14}
              height={21}
            />
          </motion.div>
          <span className="font-display text-lg font-bold text-white">
            OptSolv
          </span>
          <span className="font-display text-lg font-light text-brand-500">
            Time
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
          <Button
            size="sm"
            className="shimmer-btn bg-brand-500 font-semibold text-white hover:bg-brand-600"
            asChild
          >
            <Link href="/login">Acessar App →</Link>
          </Button>
        </div>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
        >
          {isOpen ? (
            <X className="h-5 w-5 text-white" />
          ) : (
            <Menu className="h-5 w-5 text-white" />
          )}
        </Button>
      </div>

      {/* Mobile drawer */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-white/5 bg-[#0a0a0a]/95 backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-4 px-4 py-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/70 transition-colors hover:text-white"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Button
              className="mt-2 bg-brand-500 font-semibold text-white hover:bg-brand-600"
              asChild
            >
              <Link href="/login">Acessar App →</Link>
            </Button>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
