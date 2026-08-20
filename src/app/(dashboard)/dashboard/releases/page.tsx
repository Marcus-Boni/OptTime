"use client";

import { motion } from "framer-motion";
import { BookMarked, Rss, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  PublishReleaseDialog,
  ReleaseCard,
  ReleaseFormDialog,
} from "@/components/releases";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Release, useReleases } from "@/hooks/use-releases";
import { useSession } from "@/lib/auth-client";
import { requestReleaseAnnouncement } from "@/lib/changelog/storage";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function ReleasesPage() {
  const { data: session, isPending } = useSession();
  const sessionRole =
    (session?.user as { role?: string } | undefined)?.role ?? "member";
  const isAdmin = !isPending && sessionRole === "admin";

  const {
    releases,
    isLoading,
    error,
    refetch,
    createRelease,
    updateRelease,
    deleteRelease,
    publishRelease,
  } = useReleases();

  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const publishingRelease = releases.find((r) => r.id === publishingId) ?? null;
  const publishedReleases = releases.filter((r) => r.status === "published");
  const draftReleases = releases.filter((r) => r.status === "draft");
  const latestPublishedRelease = publishedReleases[0] ?? null;
  const currentVersionLabel = latestPublishedRelease
    ? latestPublishedRelease.versionTag.startsWith("v")
      ? latestPublishedRelease.versionTag
      : `v${latestPublishedRelease.versionTag}`
    : null;

  async function handleDelete(id: string) {
    try {
      await deleteRelease(id);
      toast.success("Rascunho excluído.");
    } catch (err: unknown) {
      console.error("[ReleasesPage] handleDelete:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  async function handlePublish(notifyUsers: boolean) {
    if (!publishingId) return;
    const result = await publishRelease(publishingId, notifyUsers);
    if (result.email) {
      const { sent, failed } = result.email;
      if (failed > 0) {
        toast.warning(`${sent} e-mails enviados, ${failed} falharam.`);
      }
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Page header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10">
              <Rss className="h-5 w-5 text-brand-400" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Changelog
            </h1>
            {!isLoading && currentVersionLabel ? (
              <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                Atual {currentVersionLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isLoading
              ? "Carregando..."
              : `${publishedReleases.length} ${
                  publishedReleases.length === 1
                    ? "versão publicada"
                    : "versões publicadas"
                }${
                  isAdmin && draftReleases.length > 0
                    ? ` · ${draftReleases.length} rascunho${draftReleases.length > 1 ? "s" : ""}`
                    : ""
                }`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Re-open the "what's new" summary of the current version */}
          {!isLoading && latestPublishedRelease ? (
            <Button
              variant="outline"
              size="sm"
              onClick={requestReleaseAnnouncement}
              aria-label={`Ver destaques da versão ${currentVersionLabel}`}
            >
              <Sparkles className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Ver destaques
            </Button>
          ) : null}

          {/* Admin: create button */}
          {isAdmin && (
            <ReleaseFormDialog
              onSubmit={createRelease}
              onSuccess={() => void refetch()}
            />
          )}
        </div>
      </motion.div>

      {/* Error state */}
      {error ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </motion.div>
      ) : null}

      {/* Loading skeletons */}
      {isLoading ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="space-y-4"
        >
          {[1, 2, 3].map((i) => (
            <output
              key={i}
              className="block rounded-xl border border-border/50 bg-card/80 p-6"
              aria-label="Carregando release"
            >
              <Skeleton className="mb-3 h-5 w-24 rounded-full" />
              <Skeleton className="mb-2 h-5 w-64" />
              <Skeleton className="h-4 w-40" />
            </output>
          ))}
        </motion.div>
      ) : null}

      {/* Admin drafts section */}
      {!isLoading && isAdmin && draftReleases.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="space-y-3"
        >
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            Rascunhos
          </h2>
          <div className="space-y-3">
            {draftReleases.map((release, i) => (
              <ReleaseCard
                key={release.id}
                release={release}
                index={i}
                isAdmin={isAdmin}
                onEdit={setEditingRelease}
                onDelete={handleDelete}
                onPublish={setPublishingId}
              />
            ))}
          </div>
        </motion.div>
      ) : null}

      {/* Published releases — timeline */}
      {!isLoading && publishedReleases.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="space-y-3"
        >
          {isAdmin && draftReleases.length > 0 && (
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Publicadas
            </h2>
          )}
          <div className="space-y-3">
            {publishedReleases.map((release, i) => (
              <ReleaseCard
                key={release.id}
                release={release}
                index={i}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </motion.div>
      ) : null}

      {/* Empty state */}
      {!isLoading && !error && releases.length === 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="flex flex-col items-center justify-center gap-4 py-20 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
            <BookMarked
              className="h-8 w-8 text-muted-foreground/50"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="font-medium text-foreground">
              Nenhuma versão publicada ainda
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? "Crie e publique a primeira release do sistema."
                : "Assim que uma nova versão for publicada, ela aparecerá aqui."}
            </p>
          </div>
        </motion.div>
      ) : null}

      {/* Edit dialog (admin) */}
      {isAdmin && editingRelease && (
        <ReleaseFormDialog
          release={editingRelease}
          open={!!editingRelease}
          onOpenChange={(v) => {
            if (!v) setEditingRelease(null);
          }}
          onSubmit={(data) => updateRelease(editingRelease.id, data)}
          onSuccess={() => {
            setEditingRelease(null);
            void refetch();
          }}
        />
      )}

      {/* Publish confirm dialog */}
      {publishingRelease && (
        <PublishReleaseDialog
          open={!!publishingId}
          versionTag={publishingRelease.versionTag}
          onConfirm={handlePublish}
          onClose={() => setPublishingId(null)}
        />
      )}
    </motion.div>
  );
}
