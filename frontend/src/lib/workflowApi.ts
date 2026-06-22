import { API_BASE_URL } from "@/constants";
import type { CodingWorkflow, WorkflowDefinition, WorkflowValidationResult } from "@/types/workflow";

function workspaceQuery(workspaceId: string) {
  return `workspace_id=${encodeURIComponent(workspaceId)}`;
}

async function request<T>(url: string, jwt: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    let detail = "Request failed";
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : body.detail?.message || detail;
    } catch {
      // Keep the fallback message.
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const workflowApi = {
  list(jwt: string, workspaceId: string) {
    return request<CodingWorkflow[]>(`/api/workflows?${workspaceQuery(workspaceId)}`, jwt);
  },
  get(id: string, jwt: string, workspaceId: string) {
    return request<CodingWorkflow>(`/api/workflows/${id}?${workspaceQuery(workspaceId)}`, jwt);
  },
  create(payload: { name: string; description: string; template: string }, jwt: string, workspaceId: string) {
    return request<CodingWorkflow>(`/api/workflows?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  update(id: string, payload: { name: string; description: string; definition: WorkflowDefinition; revision: number }, jwt: string, workspaceId: string) {
    return request<CodingWorkflow>(`/api/workflows/${id}?${workspaceQuery(workspaceId)}`, jwt, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  remove(id: string, jwt: string, workspaceId: string) {
    return request<void>(`/api/workflows/${id}?${workspaceQuery(workspaceId)}`, jwt, { method: "DELETE" });
  },
  validate(id: string, jwt: string, workspaceId: string) {
    return request<WorkflowValidationResult>(`/api/workflows/${id}/validate?${workspaceQuery(workspaceId)}`, jwt, { method: "POST" });
  },
  publish(id: string, changelog: string, jwt: string, workspaceId: string) {
    return request<{ version: number }>(`/api/workflows/${id}/publish?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify({ changelog }),
    });
  },
  test(id: string, sourceText: string, jwt: string, workspaceId: string) {
    return request<{ trace: Array<{ node_id: string; name: string; kind: string; status: string; outputs: Record<string, unknown>; message: string }>; outputs: Record<string, unknown> }>(`/api/workflows/${id}/test?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify({ source_text: sourceText }),
    });
  },
};
