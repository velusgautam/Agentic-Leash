/** `quiet` sends a notification, but still opens the popup for high-risk requests. */
export type ApprovalStyle = "popup" | "notification" | "quiet";

export function parseApprovalStyle(value: unknown): ApprovalStyle {
  return value === "notification" || value === "quiet" ? value : "popup";
}
