export const dashboardViews = ["dashboard", "pets", "grooming", "products", "reservations", "reviews", "messages", "notifications", "account"] as const;

export type DashboardView = (typeof dashboardViews)[number];
