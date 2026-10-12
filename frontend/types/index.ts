export interface Product {
  id: number;
  category_id: number | null;
  category_name: string | null;
  sku: string;
  name: string;
  cost_price: string;
  selling_price: string;
  stock: number;
  minimum_stock: number;
}

export interface Category {
  id: number;
  name: string;
}