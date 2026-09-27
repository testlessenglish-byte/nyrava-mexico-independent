import { z } from "zod";

// Existing live social_cases contract; UI terminology is independent of storage.
export const SOCIAL_CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SocialCasePriority = (typeof SOCIAL_CASE_PRIORITIES)[number];
export const socialCasePriority = z.enum(SOCIAL_CASE_PRIORITIES);
export const socialCasePriorityOptions = (es: boolean) => [
  { value: "low", label: es ? "Baja" : "Low" },
  { value: "normal", label: es ? "Estándar" : "Standard" },
  { value: "high", label: es ? "Alta" : "High" },
  { value: "urgent", label: es ? "Urgente" : "Urgent" },
];
