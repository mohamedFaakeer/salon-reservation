export interface BundleComponentView {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  quantityPerBundle: number;
  quantityOnHand: number;
}

export interface BundleView {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
  /** `min(floor(variant.quantityOnHand / quantityPerBundle))` across every component — 0 for a bundle with no components. */
  availableCount: number;
  components: BundleComponentView[];
  createdAt: Date;
  updatedAt: Date;
}
