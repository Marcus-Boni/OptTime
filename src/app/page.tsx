import type { Metadata } from "next";
import { CtaFinal } from "@/components/landing/cta-final";
import { FeaturesBento } from "@/components/landing/features-bento";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Navbar } from "@/components/landing/navbar";
import { SocialProof } from "@/components/landing/social-proof";
import { StatsBar } from "@/components/landing/stats-bar";
import { Testimonial } from "@/components/landing/testimonial";
import { VideoDemo } from "@/components/landing/video-demo";

export const metadata: Metadata = {
  title: "OptSolv Time Tracker - Gestão Inteligente de Horas",
  description:
    "Sistema de registro e gestão de horas integrado ao Azure DevOps. Acompanhe a produtividade real da sua equipe.",
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <Hero />
      <SocialProof />
      <VideoDemo />
      <FeaturesBento />
      <HowItWorks />
      <StatsBar />
      <Testimonial />
      <CtaFinal />
      <Footer />
    </div>
  );
}
