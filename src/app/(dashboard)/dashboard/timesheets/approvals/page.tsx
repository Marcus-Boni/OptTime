"use client";

import { motion } from "framer-motion";
import { useCallback } from "react";
import { toast } from "sonner";
import { ApprovalCard } from "@/components/timesheets/ApprovalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimesheetApprovals } from "@/hooks/use-timesheets";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function TimesheetApprovalsPage() {
  const {
    timesheets: approvals,
    loading,
    approveTimesheet,
    rejectTimesheet,
  } = useTimesheetApprovals();

  const pending = approvals.filter((ts) => ts.status === "submitted");

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveTimesheet(id);
        toast.success("Timesheet aprovado com sucesso.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Nao foi possivel aprovar o timesheet.",
        );
        throw error;
      }
    },
    [approveTimesheet],
  );

  const handleReject = useCallback(
    async (id: string, reason: string) => {
      try {
        await rejectTimesheet(id, reason);
        toast.success("Timesheet rejeitado com sucesso.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Nao foi possivel rejeitar o timesheet.",
        );
        throw error;
      }
    },
    [rejectTimesheet],
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Aprovação de Timesheets
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Carregando…"
            : `${pending.length} timesheet${pending.length !== 1 ? "s" : ""} aguardando aprovação.`}
        </p>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-dashed border-border py-16 text-center"
          initial="hidden"
          animate="visible"
        >
          <p className="text-sm text-muted-foreground">
            Nenhum timesheet aguardando aprovação.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {pending.map((ts) => (
            <motion.div key={ts.id} variants={itemVariants}>
              <ApprovalCard
                timesheet={ts}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
