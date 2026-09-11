import { getResend } from "@/lib/utils/resend";
import MagicLinkEmail from "@/components/email/magic-link-email";

export async function sendVerificationRequest(params: {
  identifier: string;
  url: string;
  provider: string;
  theme: string;
}) {
  const { identifier, url } = params;
  const { host } = new URL(url);

  try {
    const data = await getResend().emails.send({
      from: "info@router.so",
      to: [identifier],
      subject: `Log in to ${host}`,
      text: text({ url, host }),
      react: MagicLinkEmail({ url, host }),
    });
    return data;
  } catch (error) {
    console.log(error);
    throw new Error("Failed to send the verification email.");
  }
}

/**
 * Generates text for email
 *
 * @param url - The URL to be included in the generated text.
 * @param host - The host to be included in the generated text.
 * @returns A string containing the generated text.
 */
function text({ url, host }: { url: string; host: string }) {
  return `Sign in to ${host}\n${url}\n\n`;
}
