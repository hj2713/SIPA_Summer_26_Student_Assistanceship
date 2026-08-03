import { useAuthContext } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";

export function HeaderBar({ title, description }: { title?: string; description?: string }) {
  const { user, activeWorkspace, signOut } = useAuthContext();
  const navigate = useNavigate();

  return (
    <header className="h-14 border-b border-border/50 bg-card/60 backdrop-blur-md px-6 flex items-center justify-between z-20 sticky top-0 transition-colors">
      <div className="flex items-center gap-3">
        {title ? (
          <div>
            <h1 className="text-sm font-semibold text-foreground tracking-tight">{title}</h1>
            {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
              LD
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">Law Delegation Platform</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
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
                  <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 text-white font-medium text-xs flex items-center justify-center shadow-sm uppercase">
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
                <p className="text-xs font-medium text-foreground truncate">{user.email}</p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {user.is_admin ? "Administrator" : "Team Member"}
                </p>
              </div>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
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
  );
}
