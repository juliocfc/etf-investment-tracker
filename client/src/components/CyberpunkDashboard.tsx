import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, TrendingUp } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export const CyberpunkDashboard: React.FC<DashboardLayoutProps> = ({
  children,
  activeTab = "portfolio",
  onTabChange,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, logout } = useAuth();

  const navItems = [
    { id: "portfolio", label: "Portfolio", icon: "📊" },
    { id: "performance", label: "Performance", icon: "📈" },
    { id: "dividends", label: "Dividends", icon: "💰" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground scan-lines">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-40 bg-dark-bg/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-card rounded"
            >
              {sidebarOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6" style={{ color: '#ff006e' }} />
            <h1 className="text-xl font-bold" style={{
              textShadow: '0 0 10px #00d9ff, 0 0 20px #00d9ff, 0 0 30px #00d9ff',
              filter: 'drop-shadow(0 0 8px #00d9ff)'
            }}>
              ETF TRACKER
            </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user?.name || "User"}
            </span>
            <button
              onClick={() => logout()}
              className="p-2 hover:bg-card rounded transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-64" : "w-0"
          } bg-sidebar border-r border-sidebar-border transition-all duration-300 overflow-hidden lg:w-64`}
        >
          <nav className="p-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange?.(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-sm transition-all duration-200 ${
                  activeTab === item.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                }`}
                style={activeTab === item.id ? {
                  textShadow: '0 0 10px #ff006e, 0 0 20px #ff006e, 0 0 30px #ff006e',
                  filter: 'drop-shadow(0 0 8px #ff006e)'
                } : undefined}
              >
                <span className="mr-3">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
            <div className="text-xs text-sidebar-foreground/60">
              <div className="mb-2">Version 1.0</div>
              <div className="text-sidebar-foreground/40">
                Real-time ETF tracking
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default CyberpunkDashboard;
