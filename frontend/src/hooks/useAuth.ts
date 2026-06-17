import { useEffect, useState } from "react";
import type { Session, User, Workspace, AuthContextValue } from "@/context/AuthContext";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function useAuth(): AuthContextValue {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);

  useEffect(() => {
    // Hydrate immediately from local storage
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
    setLoading(false);
  }, []);

  const setActiveWorkspace = (workspace: Workspace) => {
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
        const list = (await response.json()) as Workspace[];
        setWorkspaces(list);
        
        // Restore active workspace or fallback to first one / TEST
        const storedId = localStorage.getItem("active_workspace_id");
        const found = list.find((w) => w.id === storedId);
        if (found) {
          setActiveWorkspaceState(found);
        } else if (list.length > 0) {
          const testWorkspace = list.find((w) => w.id === "TEST") ?? list[0];
          setActiveWorkspaceState(testWorkspace);
          localStorage.setItem("active_workspace_id", testWorkspace.id);
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
    
    // If the admin is creating a user, do NOT update local session / log the admin out!
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

  const signInWithGoogle = async (): Promise<void> => {
    alert("OAuth is disabled in local-only mode.");
  };

  const signOut = async (): Promise<void> => {
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
    signOut,
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    refreshWorkspaces,
  };
}
