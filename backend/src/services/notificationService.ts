// Notification service for SMS / email alerts
// In production, integrate with Twilio for SMS and SendGrid for email

export interface NotificationPayload {
  to: string; // phone number or email
  type: "sms" | "email";
  templateId: "transfer_sent" | "transfer_received" | "transfer_claimed" | "transfer_refunded";
  data: Record<string, string | number>;
}

export interface NotificationResult {
  success: boolean;
  messageId: string;
  message: string;
}

// SMS templates
const SMS_TEMPLATES: Record<string, (data: Record<string, string | number>) => string> = {
  transfer_sent: (d) =>
    `BitExpress: You sent $${d.amount} to ${d.recipientName} in ${d.destCountry}. TX ID: ${d.transferId}. Track at bitexpress.io`,

  transfer_received: (d) =>
    `BitExpress: You have a pending payment of $${d.amount} from ${d.senderCountry}. Claim code: ${d.claimCode}. Visit bitexpress.io to withdraw.`,

  transfer_claimed: (d) =>
    `BitExpress: Your transfer of $${d.amount} to ${d.recipientName} has been claimed. TX ID: ${d.transferId}`,

  transfer_refunded: (d) =>
    `BitExpress: Your transfer of $${d.amount} (TX: ${d.transferId}) has been refunded to your wallet.`,
};

async function sendSms(
  to: string,
  message: string
): Promise<NotificationResult> {
  // Simulate Twilio API call
  await new Promise((resolve) => setTimeout(resolve, 30));
  const messageId = `SMS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  console.log(`[SMS] To: ${to} | Message: ${message}`);
  return {
    success: true,
    messageId,
    message: `SMS sent to ${to}`,
  };
}

async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<NotificationResult> {
  // Simulate SendGrid API call
  await new Promise((resolve) => setTimeout(resolve, 30));
  const messageId = `EMAIL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
  return {
    success: true,
    messageId,
    message: `Email sent to ${to}`,
  };
}

export async function sendNotification(
  payload: NotificationPayload
): Promise<NotificationResult> {
  try {
    if (payload.type === "sms") {
      const template = SMS_TEMPLATES[payload.templateId];
      if (!template) {
        return { success: false, messageId: "", message: "Unknown template" };
      }
      const message = template(payload.data);
      return sendSms(payload.to, message);
    }

    if (payload.type === "email") {
      const subject = `BitExpress: ${payload.templateId.replace(/_/g, " ")}`;
      const body = JSON.stringify(payload.data, null, 2);
      return sendEmail(payload.to, subject, body);
    }

    return { success: false, messageId: "", message: "Unknown notification type" };
  } catch (error) {
    console.error("Notification error:", error);
    return { success: false, messageId: "", message: "Notification failed" };
  }
}
