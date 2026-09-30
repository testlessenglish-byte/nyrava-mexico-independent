import { z } from "zod";
import { sendTransactionalEmail } from "@/lib/email/transactional.server";

export const contactInquirySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160).default(""),
  message: z.string().trim().min(10).max(5000),
  // Hidden anti-spam field. A filled value is silently accepted without send.
  website: z.string().max(200).default(""),
});

type ContactInquiry = z.infer<typeof contactInquirySchema>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

export async function submitContactInquiry(data: ContactInquiry) {
  if (data.website) return { sent: true as const };

  const name = data.name.trim();
  const email = data.email.trim();
  const company = data.company.trim();
  const message = data.message.trim();
  const result = await sendTransactionalEmail({
    to: "contact@mexico.nyrava.com",
    replyTo: email,
    subject: "New Enterprise sales inquiry",
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company || "Not provided"}`,
      "",
      "Message:",
      message,
    ].join("\n"),
    html: `<h2>Enterprise sales inquiry</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Company:</strong> ${escapeHtml(company || "Not provided")}</p><p><strong>Message:</strong></p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
    label: "sales-inquiry",
  });

  if (!result.sent) {
    throw new Error("We could not send your inquiry right now. Please try again later.");
  }
  return { sent: true as const };
}
