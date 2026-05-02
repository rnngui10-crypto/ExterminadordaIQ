import { useState } from "react";
import { useGetSignals, useGetAssets, getGetSignalsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import SignalTable from "@/components/SignalTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Sinais() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [dirFilter, setDirFilter] = useState<"all" | "call" | "put" | "neutro">("all");

  const assets = useGetAssets({ query: { queryKey: [] } });
  const categories = assets.data?.categories.map((c) => c.name) ?? [];

  const signals = useGetSignals(
    selectedCategory ? { category: selectedCategory } : undefined,
    {
      query: {
        refetchInterval: 5000,
        queryKey: getGetSignalsQueryKey(selectedCategory ? { category: selectedCategory } : undefined),
      },
    }
  );

  const allSignals = signals.data?.signals ?? [];
  const filtered = allSignals.filter((s) => {
    if (dirFilter === "call") return s.directionFinal === "CALL";
    if (dirFilter === "put") return s.directionFinal === "PUT";
    if (dirFilter === "neutro") return s.directionFinal === "NEUTRO";
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Sinais</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allSignals.length} ativos analisados · Atualiza a cada 5s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="button-refresh-signals"
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: getGetSignalsQueryKey() })}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", signals.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="filter-category">
                {selectedCategory ?? "Todas as categorias"}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              <DropdownMenuItem onClick={() => setSelectedCategory(undefined)}>
                Todas as categorias
              </DropdownMenuItem>
              {categories.map((cat) => (
                <DropdownMenuItem key={cat} onClick={() => setSelectedCategory(cat)}>
                  {cat}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-1.5">
            {[
              { key: "all", label: "Todos" },
              { key: "call", label: "CALL" },
              { key: "put", label: "PUT" },
              { key: "neutro", label: "Neutro" },
            ].map(({ key, label }) => (
              <button
                key={key}
                data-testid={`dir-filter-${key}`}
                onClick={() => setDirFilter(key as typeof dirFilter)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded font-mono transition-colors border",
                  dirFilter === key
                    ? key === "call"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : key === "put"
                      ? "bg-red-500/20 text-red-400 border-red-500/30"
                      : "bg-muted text-foreground border-border"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground ml-auto">
            Exibindo {filtered.length} de {allSignals.length}
          </span>
        </div>

        {/* Table */}
        <div className="bg-card border border-card-border rounded-lg overflow-hidden">
          {signals.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <SignalTable signals={filtered} />
          )}
        </div>

        {signals.data?.lastUpdate && (
          <p className="text-[11px] text-muted-foreground/60 font-mono">
            Atualizado em: {new Date(signals.data.lastUpdate).toLocaleString("pt-BR")}
          </p>
        )}
      </div>
    </div>
  );
}
