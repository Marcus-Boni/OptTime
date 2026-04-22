"use client";

import { motion } from "framer-motion";

interface TechLogo {
  name: string;
  label: string;
}

const techLogos: TechLogo[] = [
  { name: "Next.js", label: "Next.js" },
  { name: "TypeScript", label: "TypeScript" },
  { name: "TailwindCSS", label: "Tailwind CSS" },
  { name: "Azure DevOps", label: "Azure DevOps" },
  { name: "Azure PostgreSQL", label: "Azure PostgreSQL" },
  { name: "Azure App Service", label: "Azure App Service" },
  { name: "Drizzle", label: "Drizzle ORM" },
  { name: "Better Auth", label: "Better Auth" },
  { name: "Framer Motion", label: "Framer Motion" },
  { name: "shadcn/ui", label: "shadcn/ui" },
];

function InfiniteMarquee() {
  const doubled = [...techLogos, ...techLogos];

  return (
    <div className="relative overflow-hidden">
      {/* Fade masks */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-neutral-950 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-neutral-950 to-transparent"
        aria-hidden="true"
      />

      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          duration: 30,
          ease: "linear",
          repeat: Infinity,
        }}
        className="flex w-max gap-12 py-2"
        style={{ willChange: "transform" }}
      >
        {doubled.map((logo, i) => (
          <div
            key={`${logo.name}-${i}`}
            className="flex items-center gap-2 opacity-35 transition-opacity duration-300 hover:opacity-75"
          >
            {logo.name === "Next.js" && (
              <svg
                className="h-4 w-4 shrink-0 fill-white"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M11.572 0c-.176 0-.31.001-.358.007a19.76 19.76 0 0 1-.364.033C7.443.346 4.25 2.185 2.228 5.012a11.875 11.875 0 0 0-2.119 5.243c-.096.659-.108.854-.108 1.747s.012 1.089.108 1.748c.652 4.506 3.86 8.292 8.209 9.695.779.25 1.6.422 2.534.525.363.04 1.935.04 2.299 0 1.611-.178 2.977-.577 4.323-1.264.207-.106.247-.134.219-.158-.02-.013-.9-1.193-1.955-2.62l-1.919-2.592-2.404-3.558a338.739 338.739 0 0 0-2.422-3.556c-.009-.002-.018 1.579-.023 3.51-.007 3.38-.01 3.515-.052 3.595a.426.426 0 0 1-.206.214c-.075.037-.14.044-.495.044H7.81l-.108-.068a.438.438 0 0 1-.157-.171l-.05-.106.006-4.703.007-4.705.072-.092a.645.645 0 0 1 .174-.143c.096-.047.134-.051.54-.051.478 0 .558.018.682.154.035.038 1.337 1.999 2.895 4.361a10760.433 10760.433 0 0 0 4.735 7.17l1.9 2.879.096-.063a12.317 12.317 0 0 0 2.466-2.163 11.944 11.944 0 0 0 2.824-6.134c.096-.66.108-.854.108-1.748s-.012-1.088-.108-1.747C23.73 4.445 20.522.7 16.173.296a13.783 13.783 0 0 0-.372-.026A84.26 84.26 0 0 0 11.572 0zm4.069 7.217c.347 0 .408.005.486.047a.473.473 0 0 1 .237.277c.018.06.023 1.365.018 4.304l-.006 4.218-.744-1.14-.746-1.14v-3.066c0-1.982.01-3.097.023-3.15a.478.478 0 0 1 .233-.296c.096-.05.15-.055.499-.055z" />
              </svg>
            )}
            <span className="font-mono text-sm font-medium text-white">
              {logo.label}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SocialProof() {
  return (
    <section
      id="social-proof"
      className="relative overflow-hidden border-y border-white/[0.05] bg-neutral-950 py-20 md:py-28"
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div
          className="h-[500px] w-[500px] rounded-full opacity-10"
          style={{
            background:
              "radial-gradient(circle, rgba(249,115,22,0.3) 0%, transparent 65%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-10 flex items-center gap-4"
        >
          <div className="h-px flex-1 bg-white/[0.05]" aria-hidden="true" />
          <p className="shrink-0 text-xs font-medium text-neutral-600">
            Construído com tecnologia de ponta
          </p>
          <div className="h-px flex-1 bg-white/[0.05]" aria-hidden="true" />
        </motion.div>

        {/* Tech Marquee */}
        <InfiniteMarquee />
      </div>
    </section>
  );
}
