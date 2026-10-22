export type ApprovalStyle = "popup" | "notification";

export function parseApprovalStyle(value: unknown): ApprovalStyle {
  return value === "notification" ? "notification" : "popup";
}
