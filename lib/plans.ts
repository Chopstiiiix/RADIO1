export type BillingInterval = "monthly" | "annual";
export type SubscribableRole = "listener" | "broadcaster" | "advertiser";

export const PLAN_DETAILS: Record<SubscribableRole, { monthly: number; annual: number; label: string }> = {
  listener: { monthly: 5, annual: 50, label: "Listener" },
  broadcaster: { monthly: 20, annual: 200, label: "Broadcaster" },
  advertiser: { monthly: 15, annual: 150, label: "Advertiser" },
};
