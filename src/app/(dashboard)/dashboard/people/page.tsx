"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import InviteUserDialog from "@/components/people/InviteUserDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { cn, getInitials } from "@/lib/utils";

interface PersonData {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  isActive: boolean;
  weeklyCapacity: number;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const roleColors: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-400",
  manager: "bg-blue-500/10 text-blue-400",
  member: "bg-muted text-muted-foreground",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  manager: "Gerente",
  member: "Membro",
};

function PeopleCardSkeleton() {
  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="flex items-center gap-4 pt-5">
        <Skeleton className="h-12 w-12 rounded-full" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" aria-hidden="true" />
          <Skeleton className="h-3 w-1/2" aria-hidden="true" />
          <Skeleton className="h-5 w-16 rounded-full" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PeoplePage() {
  const { data: session } = useSession();
  const sessionRole =
    (session?.user as { role?: string } | undefined)?.role ?? "member";
  const sessionUserId = session?.user?.id;

  const [people, setPeople] = useState<PersonData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPeople = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/people");
      if (!res.ok) {
        setError("Não foi possível carregar a equipe.");
        return;
      }
      const data: PersonData[] = await res.json();
      setPeople(data);
    } catch (err: unknown) {
      console.error("[PeoplePage] fetchPeople:", err);
      setError("Erro inesperado ao carregar a equipe.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPeople();
  }, [fetchPeople]);

  const canInvite = sessionRole === "admin" || sessionRole === "manager";

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Equipe
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie os colaboradores da sua organização.
          </p>
        </div>
        {canInvite && <InviteUserDialog sessionRole={sessionRole} />}
      </motion.div>

      {/* Loading state */}
      {isLoading && (
        <output
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Carregando equipe..."
        >
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton list
            <PeopleCardSkeleton key={i} />
          ))}
        </output>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-12 text-center"
          role="alert"
        >
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void fetchPeople()}
            className="text-xs text-brand-400 underline-offset-4 hover:underline"
          >
            Tentar novamente
          </button>
        </motion.div>
      )}

      {/* Empty state */}
      {!isLoading && !error && people.length === 0 && (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center gap-3 rounded-xl border border-border/50 py-16 text-center"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Users
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="font-medium text-foreground">
              Nenhum colaborador encontrado
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Convide pessoas para começar a montar sua equipe.
            </p>
          </div>
        </motion.div>
      )}

      {/* People grid */}
      {!isLoading && !error && people.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person, i) => (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
            >
              <Card className="border-border/50 bg-card/80 backdrop-blur transition-colors hover:border-border/80">
                <CardContent className="flex items-center gap-4 pt-5">
                  <Avatar className="h-12 w-12 border border-border">
                    <AvatarFallback
                      className={cn(
                        "font-semibold",
                        person.isActive
                          ? "bg-brand-500/10 text-brand-500"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {getInitials(person.name || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {person.name || "Usuário"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.email}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          roleColors[person.role] ||
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {roleLabels[person.role] ?? person.role}
                      </Badge>
                      {person.id === sessionUserId && (
                        <Badge className="text-[10px] bg-brand-500/10 text-brand-500 hover:bg-brand-500/20">
                          Você
                        </Badge>
                      )}
                      {!person.isActive && (
                        <Badge className="text-[10px] bg-muted text-muted-foreground">
                          Inativo
                        </Badge>
                      )}
                      {person.department && (
                        <span className="text-[10px] text-muted-foreground">
                          {person.department}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
