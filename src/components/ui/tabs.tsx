"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "framer-motion";
import { Tabs as TabsPrimitive } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";

import { cn } from "@/lib/utils";

export type TabsVariant = "default" | "line" | "pill";

interface TabsRootContextValue {
  activeValue: string | undefined;
  tabsId: string;
}

interface TabsListContextValue extends TabsRootContextValue {
  variant: TabsVariant;
}

const TabsRootContext = createContext<TabsRootContextValue>({
  activeValue: undefined,
  tabsId: "tabs",
});

const TabsListContext = createContext<TabsListContextValue>({
  activeValue: undefined,
  tabsId: "tabs",
  variant: "default",
});

const INDICATOR_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.8,
} as const;

function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>): ReactElement {
  const tabsId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState<
    string | undefined
  >(defaultValue);

  const activeValue = value !== undefined ? value : uncontrolledValue;

  const handleValueChange = useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  const contextValue = useMemo<TabsRootContextValue>(
    () => ({ activeValue, tabsId }),
    [activeValue, tabsId],
  );

  return (
    <TabsRootContext.Provider value={contextValue}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        className={cn(
          "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
          className,
        )}
        {...props}
      />
    </TabsRootContext.Provider>
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "min-h-10 rounded-xl border border-border/60 bg-muted/75 p-1 dark:border-white/[0.07] dark:bg-neutral-900/75",
        pill: "min-h-11 rounded-full border border-neutral-300/60 bg-neutral-200/60 p-1 dark:border-white/[0.08] dark:bg-neutral-900/85",
        line: "min-h-9 gap-1 rounded-none bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>): ReactElement {
  const rootContext = useContext(TabsRootContext);
  const resolvedVariant: TabsVariant = variant ?? "default";

  const listContext = useMemo<TabsListContextValue>(
    () => ({
      ...rootContext,
      variant: resolvedVariant,
    }),
    [resolvedVariant, rootContext],
  );

  return (
    <TabsListContext.Provider value={listContext}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={resolvedVariant}
        className={cn(
          tabsListVariants({ variant: resolvedVariant }),
          className,
        )}
        {...props}
      />
    </TabsListContext.Provider>
  );
}

function TabsTrigger({
  className,
  children,
  value,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>): ReactElement {
  const { activeValue, tabsId, variant } = useContext(TabsListContext);
  const prefersReducedMotion = useReducedMotion();

  const hasTrackedValue = activeValue !== undefined;
  const isActive = hasTrackedValue && activeValue === value;

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap border border-transparent px-3 py-1.5 text-sm font-medium text-foreground/65 transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === "pill" ? "min-h-9 rounded-full px-4" : "min-h-8 rounded-lg",
        variant === "pill"
          ? "data-[state=active]:text-brand-600 dark:data-[state=active]:text-brand-400"
          : "data-[state=active]:text-foreground dark:data-[state=active]:text-foreground",
        !hasTrackedValue &&
          variant !== "line" &&
          "data-[state=active]:bg-background data-[state=active]:shadow-sm dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30",
        className,
      )}
      {...props}
    >
      {isActive ? (
        <motion.span
          layoutId={prefersReducedMotion ? undefined : `${tabsId}-indicator`}
          transition={prefersReducedMotion ? { duration: 0 } : INDICATOR_SPRING}
          aria-hidden="true"
          data-slot="tabs-indicator"
          className={cn(
            "pointer-events-none absolute",
            variant === "line"
              ? "inset-x-0 -bottom-[5px] h-0.5 rounded-full bg-brand-500"
              : variant === "pill"
                ? "inset-0 rounded-full bg-white shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10"
                : "inset-0 rounded-lg bg-background shadow-sm ring-1 ring-black/5 dark:bg-neutral-800/90 dark:ring-white/10",
          )}
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>): ReactElement {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
