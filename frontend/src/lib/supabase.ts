import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://nqgufodcrkzpeikiudga.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xZ3Vmb2Rjcmt6cGVpa2l1ZGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEyMzgxNTUsImV4cCI6MjA1NjgxNDE1NX0.4y8dJg-3c4S6mY41_g9d2-7kR82k1n_h3-k1l9m8n7o";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
