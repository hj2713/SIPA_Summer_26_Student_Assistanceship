# Frontend Application Architecture

This directory contains the React TypeScript source code for the Law Delegation application frontend, powered by React Router v6, Lucide icons, and modern CSS/Glassmorphism styling.

---

## 📁 Directory Structure Overview

| Folder / File | Purpose & Responsibilities |
| :--- | :--- |
| [`routes/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/routes) | Top-level page views (Campaign Dashboard, Document Library, Workflow Library, Settings, Login, Register, Invite landing). |
| [`components/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/components) | Shared reusable UI components (Layout navbar/sidebar, Modals, Dynamic Tables, Spreadsheet views, Buttons, Dropdowns). |
| [`hooks/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/hooks) | Custom React hooks for Auth management ([`useAuth.ts`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/hooks/useAuth.ts)), Campaign fetching ([`useCampaigns.ts`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/hooks/useCampaigns.ts)), Document state, and Workflows. |
| [`context/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/context) | React Context providers: Auth Context (`AuthContext.tsx`) maintaining session state, JWT tokens, active workspace ID, and workspace lists. |
| [`features/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/features) | Complex feature sub-modules (Visual Workflow Builder canvas, node editors, DAG connection renderers). |
| [`types/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/types) | TypeScript interfaces and type declarations for Workspace, User, Campaign, Document, and Workflow models. |
| [`constants/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/constants) | System constants, default settings, and navigation routes. |
| [`lib/`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/lib) | API client wrappers (`apiClient.ts`), fetch interceptors attaching `Authorization` Bearer tokens and `X-Workspace-ID` headers. |

---

## 🔐 Workspace Context & API Header Flow

1. **Active Workspace Persistence**: The active workspace is stored in `localStorage` as `active_workspace_id` and managed via [`useAuth.ts`](file:///Users/himanshujhawar/Desktop/Developing/Law%20Delegation/frontend/src/hooks/useAuth.ts).
2. **API Requests**: All outgoing API requests attach:
   - `Authorization: Bearer <JWT_TOKEN>`
   - `X-Workspace-ID: <ACTIVE_WORKSPACE_ID>`
3. **Workspace Switching**: Selecting a different workspace in the UI header updates `active_workspace_id` and triggers a re-fetch of campaigns, documents, and workflows scoped exclusively to the newly selected workspace.
