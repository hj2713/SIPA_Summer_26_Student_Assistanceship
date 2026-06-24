import { API_BASE_URL } from "@/constants";
import type { CodingWorkflow, WorkflowDefinition, WorkflowTemplate, WorkflowValidationResult } from "@/types/workflow";

export type WorkflowTestResult = {
  trace: Array<{ node_id: string; name: string; kind: string; status: string; outputs: Record<string, unknown>; message: string }>;
  outputs: Record<string, unknown>;
  context: Record<string, unknown>;
};

function workspaceQuery(workspaceId: string) {
  return `workspace_id=${encodeURIComponent(workspaceId)}`;
}

async function request<T>(url: string, jwt: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        ...options?.headers,
      },
    });
  } catch (error) {
    throw new Error(
      `Could not reach the API at ${API_BASE_URL}. The backend may be restarting, down, or returning a non-CORS server error. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }
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
  create(payload: { name: string; description: string; template_id?: string; template?: string }, jwt: string, workspaceId: string) {
    return request<CodingWorkflow>(`/api/workflows?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listTemplates(jwt: string, workspaceId: string) {
    return request<WorkflowTemplate[]>(`/api/workflow-templates?${workspaceQuery(workspaceId)}`, jwt);
  },
  getTemplate(id: string, jwt: string, workspaceId: string) {
    return request<WorkflowTemplate>(`/api/workflow-templates/${id}?${workspaceQuery(workspaceId)}`, jwt);
  },
  createTemplate(payload: { name: string; description: string; category: string; definition: WorkflowDefinition }, jwt: string, workspaceId: string) {
    return request<WorkflowTemplate>(`/api/workflow-templates?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateTemplate(id: string, payload: { name?: string; description?: string; category?: string; status?: string; definition?: WorkflowDefinition; revision: number }, jwt: string, workspaceId: string) {
    return request<WorkflowTemplate>(`/api/workflow-templates/${id}?${workspaceQuery(workspaceId)}`, jwt, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  removeTemplate(id: string, jwt: string, workspaceId: string) {
    return request<void>(`/api/workflow-templates/${id}?${workspaceQuery(workspaceId)}`, jwt, { method: "DELETE" });
  },
  duplicateTemplate(id: string, jwt: string, workspaceId: string) {
    return request<WorkflowTemplate>(`/api/workflow-templates/${id}/duplicate?${workspaceQuery(workspaceId)}`, jwt, { method: "POST" });
  },
  importTemplate(payload: { name: string; description: string; category: string; definition: WorkflowDefinition }, jwt: string, workspaceId: string) {
    return request<WorkflowTemplate>(`/api/workflow-templates/import?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  exportTemplate(id: string, jwt: string, workspaceId: string) {
    return request<WorkflowTemplate>(`/api/workflow-templates/${id}/export?${workspaceQuery(workspaceId)}`, jwt);
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
    return request<WorkflowTestResult>(`/api/workflows/${id}/test?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify({ source_text: sourceText }),
    });
  },
  resultsDashboard(id: string, jwt: string, workspaceId: string, payload: { source?: "draft" | "published"; version?: number } = {}) {
    return request<{ id: string }>(`/api/workflows/${id}/results-dashboard?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify({ source: payload.source || "draft", version: payload.version }),
    });
  },
  runTextToDashboard(id: string, payload: { name: string; source_text: string; rerun?: boolean; source?: "draft" | "published"; version?: number }, jwt: string, workspaceId: string) {
    return request<{ dashboard: { id: string }; row: unknown; rows: unknown[]; skipped: string[] }>(`/api/workflows/${id}/results-dashboard/run-text?${workspaceQuery(workspaceId)}`, jwt, {
      method: "POST",
      body: JSON.stringify({ source: payload.source || "draft", name: payload.name, source_text: payload.source_text, rerun: payload.rerun || false, version: payload.version }),
    });
  },
  async runFilesToDashboard(id: string, files: File[], jwt: string, workspaceId: string, rerunFilenames: string[] = []) {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/workflows/${id}/results-dashboard/run-files?${workspaceQuery(workspaceId)}&source=draft&rerun_filenames=${encodeURIComponent(rerunFilenames.join(","))}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: formData,
      });
    } catch (error) {
      throw new Error(
        `Could not reach the API at ${API_BASE_URL}. The backend may be restarting, down, or returning a non-CORS server error. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }
    if (!response.ok) {
      let detail = "Workflow file dashboard run failed";
      try {
        const body = await response.json();
        detail = typeof body.detail === "string" ? body.detail : body.detail?.message || detail;
      } catch {
        // Keep fallback.
      }
      throw new Error(detail);
    }
    return response.json() as Promise<{ dashboard: { id: string }; row: unknown; rows: unknown[]; skipped: string[] }>;
  },
  async testFile(id: string, file: File, jwt: string, workspaceId: string) {
    const formData = new FormData();
    formData.append("file", file);
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/workflows/${id}/test-file?${workspaceQuery(workspaceId)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: formData,
      });
    } catch (error) {
      throw new Error(
        `Could not reach the API at ${API_BASE_URL}. The backend may be restarting, down, or returning a non-CORS server error. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }
    if (!response.ok) {
      let detail = "Workflow file test failed";
      try {
        const body = await response.json();
        detail = typeof body.detail === "string" ? body.detail : body.detail?.message || detail;
      } catch {
        // Keep fallback.
      }
      throw new Error(detail);
    }
    return response.json() as Promise<WorkflowTestResult>;
  },
};
