import { useEffect, useState } from "react";
import type { Session, User, Workspace, AuthContextValue } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function useAuth(): AuthContextValue {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);

  useEffect(() => {
    // Sync Supabase Google OAuth session with backend
    const syncSupabaseGoogleUser = async (email: string) => {
      try {
        const response = await fetch(`${BASE_URL}/api/auth/google-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (response.ok) {
          const data = await response.json();
          const newSession = {
            access_token: data.session.access_token,
            user: {
              id: data.user.id,
              email: data.user.email,
              is_admin: !!data.user.is_admin,
              can_add: !!data.user.can_add,
              can_delete: !!data.user.can_delete,
            },
          };
          localStorage.setItem("local_session", JSON.stringify(newSession));
          setSession(newSession);
          setUser(newSession.user);
        }
      } catch (err) {
        console.error("Failed to sync Supabase Google login:", err);
      }
    };

    const initAuth = async () => {
      // 1. Hydrate from local storage first
      const stored = localStorage.getItem("local_session");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Session;
          if (parsed && parsed.access_token && parsed.user) {
            setSession(parsed);
            setUser(parsed.user);
          }
        } catch (e) {
          console.error("Failed to parse local session:", e);
          localStorage.removeItem("local_session");
        }
      }

      // 2. Direct URL hash token extraction fallback
      if (window.location.hash.includes("access_token=")) {
        try {
          const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
          const token = hashParams.get("access_token");
          if (token) {
            const parts = token.split(".");
            if (parts.length === 3) {
              const base64Url = parts[1];
              const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
              const jsonPayload = decodeURIComponent(
                atob(base64)
                  .split("")
                  .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                  .join("")
              );
              const payload = JSON.parse(jsonPayload);
              if (payload?.email) {
                await syncSupabaseGoogleUser(payload.email);
                window.history.replaceState(null, "", window.location.pathname);
              }
            }
          }
        } catch (err) {
          console.error("Failed to parse URL hash access token:", err);
        }
      }

      // 3. Supabase getSession check (PKCE flow or existing cookie session)
      try {
        const { data: { session: sbSession } } = await supabase.auth.getSession();
        if (sbSession?.user?.email) {
          await syncSupabaseGoogleUser(sbSession.user.email);
        }
      } catch (err) {
        console.error("Failed to get Supabase session:", err);
      }

      setLoading(false);
    };

    void initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, sbSession) => {
      if (event === "SIGNED_OUT") {
        localStorage.removeItem("local_session");
        localStorage.removeItem("active_workspace_id");
        setSession(null);
        setUser(null);
        setWorkspaces([]);
        setActiveWorkspaceState(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        if (sbSession?.user?.email) {
          void syncSupabaseGoogleUser(sbSession.user.email);
        }
      }
    });


    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const setActiveWorkspace = (workspace: Workspace) => {
    if (workspace.id === "QA" || workspace.id === "TEST") return;
    localStorage.setItem("active_workspace_id", workspace.id);
    setActiveWorkspaceState(workspace);
  };

  const refreshWorkspaces = async (token?: string) => {
    const activeToken = token ?? session?.access_token;
    if (!activeToken) return;
    try {
      const response = await fetch(`${BASE_URL}/api/auth/workspaces`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (response.ok) {
        const rawList = (await response.json()) as Workspace[];
        const list = rawList.filter((w) => w.id !== "QA" && w.id !== "TEST");
        setWorkspaces(list);
        
        // Restore active workspace or fallback to PRODUCTION / first one
        const storedId = localStorage.getItem("active_workspace_id");
        const found = list.find((w) => w.id === storedId && w.id !== "QA" && w.id !== "TEST");
        if (found) {
          setActiveWorkspaceState(found);
        } else if (list.length > 0) {
          const prod = list.find((w) => w.id === "PRODUCTION") ?? list[0];
          setActiveWorkspaceState(prod);
          localStorage.setItem("active_workspace_id", prod.id);
        }
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      void refreshWorkspaces();
    } else {
      setWorkspaces([]);
      setActiveWorkspaceState(null);
    }
  }, [session]);

  const signIn = async (email: string, password: string): Promise<void> => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        msg = body.detail ?? body.message ?? msg;
      } catch {}
      throw new Error(msg);
    }

    const data = await response.json();
    const newSession = {
      access_token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        is_admin: !!data.user.is_admin,
        can_add: !!data.user.can_add,
        can_delete: !!data.user.can_delete,
      },
    };
    localStorage.setItem("local_session", JSON.stringify(newSession));
    setSession(newSession);
    setUser(newSession.user);
  };

  const signUp = async (email: string, password: string): Promise<void> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        msg = body.detail ?? body.message ?? msg;
      } catch {}
      throw new Error(msg);
    }

    const data = await response.json();
    
    if (session?.access_token) {
      return;
    }

    const newSession = {
      access_token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        is_admin: !!data.user.is_admin,
        can_add: !!data.user.can_add,
        can_delete: !!data.user.can_delete,
      },
    };
    localStorage.setItem("local_session", JSON.stringify(newSession));
    setSession(newSession);
    setUser(newSession.user);
  };

  const signInWithGoogle = async (googleEmail?: string): Promise<void> => {
    if (googleEmail && googleEmail.trim()) {
      const response = await fetch(`${BASE_URL}/api/auth/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: googleEmail.trim() }),
      });

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          msg = body.detail ?? body.message ?? msg;
        } catch {}
        throw new Error(msg);
      }

      const data = await response.json();
      const newSession = {
        access_token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          is_admin: !!data.user.is_admin,
          can_add: !!data.user.can_add,
          can_delete: !!data.user.can_delete,
        },
      };
      localStorage.setItem("local_session", JSON.stringify(newSession));
      setSession(newSession);
      setUser(newSession.user);
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const linkGoogleAccount = async (googleEmail: string): Promise<void> => {
    if (!session?.access_token) throw new Error("Unauthorized");
    const response = await fetch(`${BASE_URL}/api/auth/link-google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ google_email: googleEmail }),
    });

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        msg = body.detail ?? body.message ?? msg;
      } catch {}
      throw new Error(msg);
    }
  };

  const inviteMember = async (email: string): Promise<void> => {
    if (!session?.access_token || !activeWorkspace) throw new Error("No active workspace");
    const response = await fetch(`${BASE_URL}/api/auth/workspaces/${activeWorkspace.id}/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        msg = body.detail ?? body.message ?? msg;
      } catch {}
      throw new Error(msg);
    }
  };

  const createWorkspace = async (name: string): Promise<Workspace> => {
    if (!session?.access_token) throw new Error("Unauthorized");
    const response = await fetch(`${BASE_URL}/api/auth/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        msg = body.detail ?? body.message ?? msg;
      } catch {}
      throw new Error(msg);
    }

    const newWorkspace = (await response.json()) as Workspace;
    setWorkspaces((prev) => [...prev, newWorkspace]);
    setActiveWorkspace(newWorkspace);
    return newWorkspace;
  };

  const signOut = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Failed to sign out of Supabase OAuth:", err);
    }
    localStorage.removeItem("local_session");
    localStorage.removeItem("active_workspace_id");
    setSession(null);
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceState(null);
  };


  return {
    session,
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    linkGoogleAccount,
    inviteMember,
    signOut,
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    refreshWorkspaces,
  };
}
