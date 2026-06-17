export interface Document {
  id: string;
  user_id: string;
  filename: string;
  file_path: string;
  file_size: number;
  content_type: string;
  status: "pending" | "processing" | "completed" | "failed";
  error_message: string | null;
  content_hash: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}
