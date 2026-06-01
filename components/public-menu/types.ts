export type Product = {
  id: number;
  name: string;
  price: number;
  active?: boolean;
  description?: string | null;
  category: {
    id: number;
    name: string;
  } | null;
  image_url?: string | null;
};

export type Category = {
  id: number;
  name: string;
};

export type Highlight = {
  id: number;
  description: string | null;
  active?: boolean;
  image_url?: string | null;
};

export type MenuContext = {
  tenantId?: string | null;
  tenantName?: string | null;
  tableId?: string | null;
  tableLabel?: string | null;
  roomName?: string | null;
  tableToken?: string | null;
};

export type PublicTableOrderItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
};
