import { Link, useLocation } from "wouter";
import { UserButton, useUser, useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import {
  Box,
  LayoutDashboard,
  Settings,
  Package,
  LogOut,
  Menu,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

function NavItems({ pathname }: { pathname: string }) {
  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/products", label: "Catalog", icon: Package },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="flex-1 space-y-1 px-2 py-4">
      {links.map((link) => {
        const isActive = pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
          >
            <Icon className={`mr-3 h-5 w-5 flex-shrink-0 ${isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"}`} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const [pathname] = useLocation();
  const { data: me } = useGetMe();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Set dir="rtl" if locale is arabic
  const dir = me?.locale === "ar" ? "rtl" : "ltr";

  return (
    <div dir={dir} className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground selection:bg-primary/20">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 flex-shrink-0 items-center px-6 border-b border-sidebar-border gap-3 text-sidebar-foreground">
          <Box className="h-6 w-6 text-sidebar-primary" />
          <span className="font-semibold tracking-tight text-lg">DimensionX</span>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-2">
          <NavItems pathname={pathname} />
        </div>
        <div className="flex flex-shrink-0 border-t border-sidebar-border p-4">
          <div className="group block w-full flex-shrink-0">
            <div className="flex items-center">
              <div>
                <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "h-9 w-9" } }} />
              </div>
              <div className="ml-3 rtl:mr-3 rtl:ml-0 flex-1">
                <p className="text-sm font-medium text-sidebar-foreground truncate max-w-[140px]">{me?.displayName || user?.fullName || "Merchant"}</p>
                <p className="text-xs font-medium text-sidebar-foreground/60 truncate max-w-[140px]">{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b bg-white px-4 md:px-6 shadow-sm">
          <div className="flex items-center md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-2 md:hidden">
                  <span className="sr-only">Open sidebar</span>
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border flex flex-col">
                <div className="flex h-16 flex-shrink-0 items-center px-6 border-b border-sidebar-border gap-3 text-sidebar-foreground">
                  <Box className="h-6 w-6 text-sidebar-primary" />
                  <span className="font-semibold tracking-tight text-lg">DimensionX</span>
                </div>
                <div className="flex flex-1 flex-col overflow-y-auto">
                  <NavItems pathname={pathname} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          
          <div className="flex flex-1 justify-end items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground hidden sm:flex">
              <Activity className="h-4 w-4 text-green-500" />
              <span className="font-medium">System Operational</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50 focus:outline-none">
          <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 xl:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
