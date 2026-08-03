import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/constants";
import { ALL_MODELS_BY_PROVIDER, type ModelOption } from "@/utils/modelRegistry";

export function useAvailableModels() {
  const [savedProviders, setSavedProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadCredentials() {
      try {
        const stored = localStorage.getItem("local_session");
        if (!stored) return;
        const parsed = JSON.parse(stored);
        const token = parsed?.access_token;
        if (!token) return;

        const res = await fetch(`${API_BASE_URL}/api/auth/llm-credentials`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        const activeSet = new Set<string>();
        // Check primary legacy credentials provider
        if (data.has_api_key && data.provider) {
          const norm = data.provider === "google" ? "gemini" : data.provider;
          activeSet.add(norm);
        }
        // Check multi-provider saved_keys array
        if (Array.isArray(data.saved_keys)) {
          for (const item of data.saved_keys) {
            if (item.has_api_key && item.provider) {
              const norm = item.provider === "google" ? "gemini" : item.provider;
              activeSet.add(norm);
            }
          }
        }
        setSavedProviders(Array.from(activeSet));
      } catch (err) {
        console.error("Failed to fetch saved provider credentials:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadCredentials();
    return () => {
      isMounted = false;
    };
  }, []);

  const availableModels: ModelOption[] = [];
  for (const prov of savedProviders) {
    const p = prov as keyof typeof ALL_MODELS_BY_PROVIDER;
    if (ALL_MODELS_BY_PROVIDER[p]) {
      availableModels.push(...ALL_MODELS_BY_PROVIDER[p]);
    }
  }

  return {
    savedProviders,
    availableModels,
    loading,
    hasSavedKeys: savedProviders.length > 0,
  };
}
