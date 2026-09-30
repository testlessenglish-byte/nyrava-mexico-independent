import { createServerFn } from "@tanstack/react-start";
import { contactInquirySchema, submitContactInquiry } from "@/lib/contact-inquiry.server";

/** Public sales inquiry endpoint. The destination is fixed server-side. */
export const sendContactInquiry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactInquirySchema.parse(data))
  .handler(({ data }) => submitContactInquiry(data));
