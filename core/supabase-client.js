// core/supabase-client.js

// 💡 Paste your actual Supabase URL and Anon Key here
const SUPABASE_URL = "https://sffyshljswsqsowanowg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZnlzaGxqc3dzcXNvd2Fub3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MjA2NDAsImV4cCI6MjEwNTQ5NjY0MH0.kXHtuT_rAg4o0HiFPxklYv16aUQoiZL_QdzicORi8Vg";

// Initialize and export the single global client
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to handle database errors cleanly across the app
export function handleDBError(error, customMessage = "Database error occurred.") {
    console.error("Supabase Error:", error);
    return { success: false, message: error?.message || customMessage };
}
