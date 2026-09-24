import { createFileRoute } from "@tanstack/react-router";
// Retired integration endpoint; independent Supabase handles authentication emails.
export const Route = createFileRoute("/lovable/email/auth/webhook")({server:{handlers:{POST:()=>new Response("Integration retired",{status:410})}}});
