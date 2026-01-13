export type GeneratedContent = {
  hero: {
    headline: string;
    subheadline: string;
    primaryCtaLabel: string;
  };
  about: {
    title: string;
    paragraph: string;
    bullets: string[];
  };
  services: {
    title: string;
    intro: string;
    items: {
      name: string;
      description: string;
      icon?: string; // emoji or icon name, optional
    }[];
  };
  gallery: {
    title: string;
    description: string;
    imagePrompts: string[];
  };
  reviews: {
    title: string;
    items: string[];
  };
  contact: {
    title: string;
    paragraph: string;
  };
  seo: {
    pageTitle: string;
    metaDescription: string;
  };
  theme?: {
    primary?: "sky" | "emerald" | "rose" | "violet" | "slate";
    accent?: "amber" | "cyan" | "pink" | "indigo" | null;
  };
};

