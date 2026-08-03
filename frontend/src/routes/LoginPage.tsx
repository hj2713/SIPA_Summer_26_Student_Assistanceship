import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { useAuthContext } from "@/context/AuthContext";

export function LoginPage() {
  const { session, loading } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) {
      navigate("/chat", { replace: true });
    }
  }, [session, loading, navigate]);

  if (session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm font-medium">
        Redirecting to workspace...
      </div>
    );
  }

  return <LoginForm />;
}
