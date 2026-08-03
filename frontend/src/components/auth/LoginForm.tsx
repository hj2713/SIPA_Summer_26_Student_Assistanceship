import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthContext } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function LoginForm() {
  const { signIn, signInWithGoogle } = useAuthContext();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  const [googleEmailFallback, setGoogleEmailFallback] = useState("hj2713@columbia.edu");
  const [showGoogleInput, setShowGoogleInput] = useState(false);

  const handleGoogleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGoogleLoading(true);
    try {
      if (showGoogleInput) {
        await signInWithGoogle(googleEmailFallback.trim());
      } else {
        await signInWithGoogle();
      }
      navigate("/chat", { replace: true });
      toast.success("Successfully signed in with Google!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      if (msg.toLowerCase().includes("provider is not enabled") || msg.toLowerCase().includes("unsupported provider")) {
        setShowGoogleInput(true);
        toast.info("Google OAuth provider pending in Supabase. Enter your Google email below:");
      } else {
        toast.error(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-background overflow-hidden selection:bg-primary/20">
      {/* Background Decorative Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-500/15 to-violet-500/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Header Controls */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md relative z-10 glass-panel border border-border/60 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-xl">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Law Delegation Portal
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            Enterprise Legal RAG & Autonomous Workflow Platform
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-4 space-y-5">
          {/* Google OAuth Section */}
          {showGoogleInput ? (
            <form onSubmit={handleGoogleSignIn} className="space-y-3 p-3 rounded-xl border bg-muted/20 border-primary/20">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Google Account Email
              </label>
              <Input
                type="email"
                required
                value={googleEmailFallback}
                onChange={(e) => setGoogleEmailFallback(e.target.value)}
                placeholder="hj2713@columbia.edu"
                className="h-10 text-sm"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGoogleInput(false)}
                  className="w-1/3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={googleLoading}
                  className="w-2/3 text-xs font-bold"
                >
                  {googleLoading ? "Signing in..." : "Continue with Email"}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-border/80 hover:bg-muted/80 font-medium text-sm gap-3 rounded-xl transition-all shadow-sm group"
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
          )}

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <span className="relative bg-card px-3 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Or sign in with email
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-foreground">
                Work Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="test@test.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 rounded-xl bg-background/50 border-border/80 focus:ring-primary/30 text-sm"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold text-foreground">
                  Password
                </label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 rounded-xl bg-background/50 border-border/80 focus:ring-primary/30 text-sm"
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-semibold text-sm rounded-xl bg-primary text-primary-foreground hover:opacity-95 shadow-md shadow-primary/20 transition-all mt-2"
              disabled={loading || googleLoading}
            >
              {loading ? "Authenticating…" : "Sign In to Workspace"}
            </Button>
          </form>

          {/* Quick Demo Shortcut */}
          <div className="pt-2 text-center">
            <button
              type="button"
              className="text-xs text-primary/80 hover:text-primary hover:underline font-medium transition-colors"
              onClick={() => {
                setEmail("test@test.com");
                setPassword("test123456");
              }}
            >
              Use demo credentials (test@test.com)
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
