import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthContext } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const { signIn, signInWithGoogle } = useAuthContext();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      await signIn(email, password);
      navigate("/chat", { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      if (msg.toLowerCase().includes("provider is not enabled") || msg.toLowerCase().includes("unsupported provider")) {
        toast.error("Google sign-in is not enabled in Supabase. Please sign in with email/password or enable Google provider in Supabase Dashboard.");
      } else {
        toast.error(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-background text-foreground overflow-hidden selection:bg-accent/30">
      {/* Background Decorative Warm Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-primary/10 to-accent/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-accent-plum/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Header Controls */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md relative z-10 bg-card border border-border shadow-xl rounded-2xl overflow-hidden">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-primary text-accent flex items-center justify-center shadow-md font-black">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
              <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
              <path d="M7 21h10"/>
              <path d="M12 3v18"/>
              <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Law Delegation Platform
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            Columbia SIPA · Empirical Legislative Coding Workbench
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-4 space-y-4">
          {/* Primary: Google OAuth Sign In / Sign Up */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-border hover:bg-muted font-semibold text-xs gap-3 rounded-xl transition-all shadow-xs group text-foreground"
              onClick={() => handleGoogleSignIn()}
              disabled={googleLoading || loading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.15C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.29C.47 8.21 0 10.05 0 12s.47 3.79 1.29 5.42l3.99-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.58l3.99 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>{googleLoading ? "Connecting Google..." : "Continue with Google"}</span>
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Sign in or sign up with your university or Google account.
            </p>
          </div>

          {/* Secondary: Developer / Test Account Sign In */}
          <div className="pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowDevLogin(!showDevLogin)}
              className="w-full flex items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors py-1 px-1 rounded-lg"
            >
              <span>Developer &amp; Test Credentials</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-muted-foreground", showDevLogin && "rotate-180")} />
            </button>

            {showDevLogin && (
              <form onSubmit={handleSubmit} className="space-y-3 pt-3">
                <div className="space-y-1">
                  <label htmlFor="email" className="text-xs font-semibold text-foreground">
                    Work / Test Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="test@test.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-9 rounded-xl bg-background/50 border-border/80 focus:ring-primary/30 text-xs"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="password" className="text-xs font-semibold text-foreground">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-9 rounded-xl bg-background/50 border-border/80 focus:ring-primary/30 text-xs"
                    autoComplete="current-password"
                  />
                </div>

                <Button
                  type="submit"
                  size="sm"
                  className="w-full h-9 font-semibold text-xs rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs transition-all mt-1"
                  disabled={loading || googleLoading}
                >
                  {loading ? "Authenticating…" : "Sign In with Credentials"}
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
