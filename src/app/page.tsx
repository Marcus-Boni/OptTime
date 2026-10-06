import type { Metadata } from "next";
import type { ReactElement } from "react";
import { CtaFinal } from "@/components/landing/cta-final";
import { FeaturesBento } from "@/components/landing/features-bento";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Navbar } from "@/components/landing/navbar";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { SocialProof } from "@/components/landing/social-proof";
import { StatsBar } from "@/components/landing/stats-bar";
import { Testimonial } from "@/components/landing/testimonial";
import { VideoDemo } from "@/components/landing/video-demo";
import { getLatestPublicRelease } from "@/lib/releases/public-release.server";

// Resolve the published release on every visit, including immediately after publication.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OptSolv Time Tracker - Gestão Inteligente de Horas",
  description:
    "Sistema de registro e gestão de horas integrado ao Azure DevOps. Acompanhe a produtividade real da sua equipe.",
};

export default async function LandingPage(): Promise<ReactElement> {
  const release = await getLatestPublicRelease();
  return (
    <SmoothScroll>
      <div className="relative min-h-screen bg-[#0a0a0a] text-white">
        <Navbar versionTag={release?.versionTag ?? null} />
        <Hero />
        <SocialProof />
        <VideoDemo
          release={release}
          mp4Src="/product-film.mp4"
          poster="/product-film-poster.jpg"
        />
        <FeaturesBento />
        <HowItWorks />
        <StatsBar />
        <Testimonial />
        <CtaFinal />
        <Footer />
      </div>
    </SmoothScroll>
  );
}
