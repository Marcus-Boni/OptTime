"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  members?: { userId: string }[];
}

interface EmptyOption {
  label: string;
  value: string;
}

interface ProjectComboboxProps {
  projects: ProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyOption?: EmptyOption;
  "aria-invalid"?: boolean;
}

export function ProjectCombobox({
  projects,
  value,
  onChange,
  placeholder = "Selecione um projeto",
  disabled = false,
  emptyOption,
  "aria-invalid": ariaInvalid,
}: ProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const currentUserId = session?.user.id;

  const sortedProjects = useMemo(() => {
    let filtered = projects;
    if (currentUserId) {
      filtered = projects.filter((project) => {
        if (!project.members) return true;
        return project.members.some((m) => m.userId === currentUserId);
      });
    }

    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
    );
  }, [projects, currentUserId]);

  const selectedProject =
    value === emptyOption?.value
      ? { id: emptyOption.value, name: emptyOption.label, color: "" }
      : sortedProjects.find((project) => project.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled || (!emptyOption && projects.length === 0)}
          className={cn(
            "h-9 w-full justify-between rounded-md bg-background/80 font-normal",
            !selectedProject && "text-muted-foreground",
          )}
        >
          {selectedProject ? (
            <span className="flex min-w-0 items-center gap-2">
              {selectedProject.color ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedProject.color }}
                />
              ) : null}
              <span className="truncate">{selectedProject.name}</span>
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onWheel={(event) => event.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Buscar projeto..." />
          <CommandList className="max-h-72 overscroll-contain">
            <CommandEmpty>
              {projects.length === 0
                ? "Nenhum projeto ativo disponível"
                : "Nenhum projeto encontrado"}
            </CommandEmpty>
            {emptyOption ? (
              <CommandItem
                key={emptyOption.value}
                value={emptyOption.label}
                onSelect={() => {
                  onChange(emptyOption.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    emptyOption.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{emptyOption.label}</span>
              </CommandItem>
            ) : null}
            {sortedProjects.map((project) => (
              <CommandItem
                key={project.id}
                value={`${project.name} ${project.id}`}
                onSelect={() => {
                  onChange(project.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    project.id === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate">{project.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
