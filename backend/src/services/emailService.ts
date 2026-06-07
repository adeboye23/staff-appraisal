import { config } from "../config.js";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: EmailInput, attempts = 2) {
  if (!config.resendApiKey) {
    console.info(`[email skipped] ${input.subject} -> ${input.to}`);
    console.info((input.text ?? input.html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
    return { sent: false, skipped: true };
  }

  let lastError = "Unable to send email";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
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
        html: input.html,
        text: input.text
      })
    });

    if (response.ok) {
      return { sent: true, skipped: false };
    }

    lastError = await response.text().catch(() => "Unable to send email");
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }

  throw new Error(`Email delivery failed: ${lastError}`);
}
