import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart2,
  History,
  Settings,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetAuthStatus } from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sinais", label: "Sinais", icon: TrendingUp },
  { href: "/ativos", label: "Ativos", icon: BarChart2 },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();
  const status = useGetAuthStatus();

  const connected = status.data?.connected ?? false;
  const accountType = status.data?.accountType;
  const balance = status.data?.balance;

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm tracking-wide text-foreground">IA TRADER</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">IQ Option Signal Bot</p>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location === href || (href !== "/" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <div
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors cursor-pointer",
                  active
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground")} />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 mb-1">
          {connected ? (
            <Wifi className="w-3.5 h-3.5 text-primary" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className={cn("text-xs font-medium", connected ? "text-primary" : "text-muted-foreground")}>
            {connected ? "Conectado" : "Desconectado"}
          </span>
        </div>
        {connected && accountType && (
          <>
            <p className="text-[11px] text-muted-foreground font-mono">
              Conta: <span className={cn("font-medium", accountType === "REAL" ? "text-destructive" : "text-accent")}>{accountType}</span>
            </p>
            {balance !== undefined && (
              <p className="text-[11px] text-muted-foreground font-mono">
                Saldo: <span className="text-foreground font-medium">${balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
