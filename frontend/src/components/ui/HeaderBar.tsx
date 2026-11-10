import { useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CiteUsModal } from "@/components/ui/CiteUsModal";
import { AccountSettingsModal } from "@/components/ui/AccountSettingsModal";
import { Quote, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HeaderBar({ title, description }: { title?: string; description?: string }) {
  const { user, activeWorkspace, signOut } = useAuthContext();
  const [citeModalOpen, setCiteModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  return (
    <>
      <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between z-20 sticky top-0 transition-colors shadow-xs">
        <div className="flex items-center gap-3">
          {title ? (
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-tight">{title}</h1>
              {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-xs">
                LD
              </div>
              <span className="font-bold text-sm tracking-tight text-foreground">Law Delegation Platform</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Cite Us Button */}
          <button
            type="button"
            onClick={() => setCiteModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-accent-plum/30 bg-accent-plum/10 text-accent-plum hover:bg-accent-plum/20 text-xs font-semibold transition-all shadow-xs"
          >
            <Quote className="w-3.5 h-3.5" />
            <span>Cite Us</span>
          </button>

          {/* Workspace Chip */}
          {activeWorkspace && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeWorkspace.name}</span>
            </div>
          )}

          {/* Theme Toggle Button */}
          <ThemeToggle />

        {/* User Account Menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-xl border border-border/60 hover:bg-muted/60 transition-colors text-left"
                >
                  <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground font-medium text-xs flex items-center justify-center shadow-xs uppercase">
                    {user.email.slice(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-foreground max-w-[120px] truncate hidden md:inline">
                    {user.email}
                  </span>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2 border-b border-border/50">
                <p className="text-xs font-semibold text-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenuItem onClick={() => setAccountModalOpen(true)}>
                <UserIcon className="mr-2 h-4 w-4 text-primary" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()} className="text-destructive">
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
    <CiteUsModal open={citeModalOpen} onOpenChange={setCiteModalOpen} />
    <AccountSettingsModal open={accountModalOpen} onOpenChange={setAccountModalOpen} />
    </>
  );
}

