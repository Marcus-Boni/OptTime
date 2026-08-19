"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
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
import { cn } from "@/lib/utils";

interface UserOption {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface EmptyOption {
  label: string;
  value: string;
}

interface UserComboboxProps {
  users: UserOption[];
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyOption?: EmptyOption;
  "aria-invalid"?: boolean;
  className?: string;
  variant?: "outline" | "ghost" | "none";
}

export function UserCombobox({
  users,
  value,
  onChange,
  placeholder = "Selecione um colaborador",
  disabled = false,
  emptyOption,
  "aria-invalid": ariaInvalid,
  className,
  variant = "outline",
}: UserComboboxProps) {
  const [open, setOpen] = useState(false);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
    );
  }, [users]);

  const selectedUser =
    value === emptyOption?.value
      ? {
          id: emptyOption.value,
          name: emptyOption.label,
          email: "",
          image: null,
        }
      : sortedUsers.find((user) => user.id === value);

  const Comp = variant === "none" ? "button" : Button;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Comp
          type="button"
          {...(variant !== "none" ? { variant } : {})}
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled || (!emptyOption && users.length === 0)}
          className={cn(
            variant === "none"
              ? "flex items-center justify-between transition-all duration-200 outline-none"
              : "h-9 w-full justify-between rounded-md bg-background/80 font-normal",
            className,
            !selectedUser && "text-muted-foreground",
          )}
        >
          {selectedUser ? (
            <span className="flex min-w-0 items-center gap-2">
              {selectedUser.name !== emptyOption?.label ? (
                <UserAvatar
                  name={selectedUser.name}
                  image={selectedUser.image}
                  size="sm"
                />
              ) : null}
              <span className="truncate">{selectedUser.name}</span>
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Comp>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onWheel={(event) => event.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Buscar colaborador..." />
          <CommandList className="max-h-72 overscroll-contain">
            <CommandEmpty>
              {users.length === 0
                ? "Nenhum colaborador ativo disponível"
                : "Nenhum colaborador encontrado"}
            </CommandEmpty>
            {emptyOption ? (
              <CommandItem
                key={emptyOption.value}
                value={emptyOption.label.toLowerCase()}
                onSelect={() => {
                  onChange(emptyOption.value);
                  setOpen(false);
                }}
                className="gap-2 cursor-pointer focus:bg-brand-500/10 focus:text-brand-500"
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
            {sortedUsers.map((user) => (
              <CommandItem
                key={user.id}
                value={`${user.name} ${user.email} ${user.id}`.toLowerCase()}
                onSelect={() => {
                  onChange(user.id);
                  setOpen(false);
                }}
                className="gap-2 cursor-pointer focus:bg-brand-500/10 focus:text-brand-500"
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    user.id === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <UserAvatar name={user.name} image={user.image} size="sm" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm font-medium">
                    {user.name}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
