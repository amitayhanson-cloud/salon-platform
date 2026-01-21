export type User = {
  id: string;
  email: string;
  name?: string;
  siteId: string | null; // Reference to the user's site (null = no site yet, needs wizard)
  createdAt: Date;
  updatedAt?: Date;
};

export type SetupStatus = "not_started" | "in_progress" | "completed";

export type Website = {
  id: string;
  ownerUserId: string;
  templateId: string;
  subdomain: string; // e.g., "mysalon" -> mysalon.salonplatform.com
  customDomain?: string; // Optional custom domain
  setupStatus: SetupStatus; // Onboarding/setup state
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
};
