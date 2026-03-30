/**
 * Salon product catalog (Firestore: sites/{siteId}/products/{productId})
 */
export type Product = {
  id: string;
  salonId: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  stock: number;
  isVisible: boolean;
};

export type ProductFirestoreInput = Omit<Product, "id">;
