"use client";

import {
  BookOpen,
  Database,
  Eye,
  MessageSquareText,
  Pencil,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Reference for what the agent can actually do, read live from
 * `/api/mcp/manifest` so it can never drift from the server's real catalog.
 */

interface ManifestTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  _optTime?: { scope?: string };
}

interface ManifestResource {
  uri: string;
  title: string;
  description: string;
}

interface ManifestPrompt {
  name: string;
  title: string;
  description: string;
}

interface Manifest {
  version: string;
  counts: { tools: number; resources: number; prompts: number };
  tools: ManifestTool[];
  resources: ManifestResource[];
  prompts: ManifestPrompt[];
}

function ToolKindBadge({ tool }: { tool: ManifestTool }) {
  if (tool.annotations?.destructiveHint) {
    return (
      <Badge className="gap-1 bg-red-500/10 text-[10px] text-red-400">
        <Trash2 className="h-2.5 w-2.5" />
        destrutiva
      </Badge>
    );
  }

  if (tool.annotations?.readOnlyHint) {
    return (
      <Badge className="gap-1 bg-blue-500/10 text-[10px] text-blue-400">
        <Eye className="h-2.5 w-2.5" />
        leitura
      </Badge>
    );
  }

  return (
    <Badge className="gap-1 bg-amber-500/10 text-[10px] text-amber-400">
      <Pencil className="h-2.5 w-2.5" />
      escrita
    </Badge>
  );
}

function ToolCard({ tool }: { tool: ManifestTool }) {
  const params = Object.keys(tool.inputSchema?.properties ?? {});
  const required = new Set(tool.inputSchema?.required ?? []);

  return (
    <li className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-xs font-medium text-brand-500">
          {tool.name}
        </code>
        <ToolKindBadge tool={tool} />
        {tool._optTime?.scope ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] text-muted-foreground"
          >
            {tool._optTime.scope}
          </Badge>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {tool.description}
      </p>

      {params.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {params.map((param) => (
            <span
              key={param}
              className={cn(
                "rounded-md px-1.5 py-0.5 font-mono text-[10px]",
                required.has(param)
                  ? "bg-brand-500/10 text-brand-500"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {param}
              {required.has(param) ? "*" : "?"}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-[10px] text-muted-foreground">
          Sem parâmetros
        </p>
      )}
    </li>
  );
}

export function McpCatalog() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/mcp/manifest");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Manifest;
        if (!cancelled) setManifest(data);
      } catch (error: unknown) {
        console.error("[McpCatalog] load:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!manifest) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar o catálogo do servidor MCP.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <BookOpen className="h-4 w-4 text-brand-500" />O que o agente consegue
          fazer
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Catálogo lido em tempo real do servidor (v{manifest.version}).
        </p>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="tools">
          <TabsList variant="line">
            <TabsTrigger value="tools">
              <Wrench className="h-3.5 w-3.5" />
              Ferramentas ({manifest.counts.tools})
            </TabsTrigger>
            <TabsTrigger value="resources">
              <Database className="h-3.5 w-3.5" />
              Recursos ({manifest.counts.resources})
            </TabsTrigger>
            <TabsTrigger value="prompts">
              <MessageSquareText className="h-3.5 w-3.5" />
              Prompts ({manifest.counts.prompts})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tools" className="mt-4">
            <ul className="grid gap-3 md:grid-cols-2">
              {manifest.tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="resources" className="mt-4">
            <ul className="space-y-3">
              {manifest.resources.map((resource) => (
                <li
                  key={resource.uri}
                  className="rounded-xl border border-border/60 bg-card/60 p-4"
                >
                  <code className="font-mono text-xs font-medium text-brand-500">
                    {resource.uri}
                  </code>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {resource.description}
                  </p>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="prompts" className="mt-4">
            <ul className="space-y-3">
              {manifest.prompts.map((prompt) => (
                <li
                  key={prompt.name}
                  className="rounded-xl border border-border/60 bg-card/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs font-medium text-brand-500">
                      /{prompt.name}
                    </code>
                    <span className="text-xs font-medium text-foreground">
                      {prompt.title}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {prompt.description}
                  </p>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
