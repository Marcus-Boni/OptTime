import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectSkeleton } from "@/components/projects";
import { ProjectsClient } from "@/components/projects/projects-client";

export const metadata: Metadata = {
  title: "Projetos",
  description: "Gestão e acompanhamento dos projetos da organização.",
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectsClient />
    </Suspense>
  );
}
