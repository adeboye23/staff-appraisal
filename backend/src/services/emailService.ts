import { config } from "../config.js";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(input: EmailInput) {
  if (!config.resendApiKey) {
    console.info(`[email skipped] ${input.subject} -> ${input.to}`);
    console.info(input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: input.to,
      subject: input.subject,
      html: input.html
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Unable to send email");
    throw new Error(`Email delivery failed: ${message}`);
  }
}
