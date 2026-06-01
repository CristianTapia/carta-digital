"use server";

import { createPublicTableEvent, resolvePublicTableByToken } from "@/app/lib/data/public-tables";
import { createAdmin } from "@/app/lib/supabase";
import { broadcastTableAttentionUpdated } from "@/app/lib/realtime/menu";
import { PublicTableTokenSchema } from "@/app/lib/validators/public-tables";
import type { PublicTableOrderItem } from "./types";

type TableAttentionEvent = "service" | "bill";

type ProductRow = {
  id: number;
  name: string;
  price: number;
  active: boolean | null;
};

class PublicMenuActionError extends Error {}

async function resolveTableContext(tableToken: string) {
  const token = PublicTableTokenSchema.parse(tableToken);
  const table = await resolvePublicTableByToken(token);

  if (!table) {
    throw new PublicMenuActionError("Mesa no encontrada");
  }

  if (table.table.active === false) {
    throw new PublicMenuActionError("Mesa no disponible");
  }

  return table;
}

async function notifyTableEventCreated(table: Awaited<ReturnType<typeof resolveTableContext>>, eventType: string) {
  await broadcastTableAttentionUpdated({
    tableId: table.table.id,
    tableToken: table.table.public_token,
    tenantId: table.table.tenant_id,
    action: "created",
    eventType,
  });
}

export async function sendTableAttentionRequest(tableToken: string, eventType: TableAttentionEvent) {
  if (eventType !== "service" && eventType !== "bill") {
    throw new PublicMenuActionError("Tipo de solicitud invalido");
  }

  const table = await resolveTableContext(tableToken);

  await createPublicTableEvent({
    tableId: table.table.id,
    tenantId: table.table.tenant_id,
    eventType,
    metadata: {
      source: "menu",
      route: "table",
    },
  });

  await notifyTableEventCreated(table, eventType);
}

function normalizeOrderItems(items: PublicTableOrderItem[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PublicMenuActionError("La comanda debe incluir productos");
  }

  return items.map((item, index) => {
    const productId = Number(item.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new PublicMenuActionError(`Producto invalido en la posicion ${index + 1}`);
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99) {
      throw new PublicMenuActionError(`Cantidad invalida para el producto ${productId}`);
    }

    const notes = typeof item.notes === "string" ? item.notes.trim().slice(0, 240) : undefined;

    return {
      id: productId,
      quantity: item.quantity,
      ...(notes ? { notes } : {}),
    };
  });
}

async function buildSafeOrderMetadata({
  tenantId,
  items,
}: {
  tenantId: string;
  items: PublicTableOrderItem[];
}) {
  const clientItems = normalizeOrderItems(items);
  const productIds = Array.from(new Set(clientItems.map((item) => item.id)));
  const db = createAdmin();

  const { data, error } = await db
    .from("products")
    .select("id,name,price,active")
    .eq("tenant_id", tenantId)
    .in("id", productIds)
    .or("active.is.null,active.eq.true");

  if (error) throw new Error(error.message);

  const productsById = new Map(((data ?? []) as ProductRow[]).map((product) => [product.id, product]));
  const missingProductId = productIds.find((productId) => !productsById.has(productId));

  if (missingProductId) {
    throw new PublicMenuActionError(`Producto invalido o no disponible: ${missingProductId}`);
  }

  const safeItems = clientItems.map((item) => {
    const product = productsById.get(item.id);
    if (!product) {
      throw new PublicMenuActionError(`Producto invalido o no disponible: ${item.id}`);
    }

    const price = Number(product.price);
    const lineTotal = price * item.quantity;

    return {
      id: product.id,
      name: product.name,
      quantity: item.quantity,
      price,
      ...(item.notes ? { notes: item.notes } : {}),
      lineTotal,
    };
  });

  return {
    items: safeItems,
    total: safeItems.reduce((sum, item) => sum + item.lineTotal, 0),
    currency: "CLP",
    source: "menu",
  };
}

export async function sendTableOrderRequest(
  tableToken: string,
  order: { items: PublicTableOrderItem[]; total: number; currency: "CLP" },
) {
  if (order.currency !== "CLP") {
    throw new PublicMenuActionError("Moneda invalida");
  }

  const table = await resolveTableContext(tableToken);
  const metadata = await buildSafeOrderMetadata({
    tenantId: table.table.tenant_id,
    items: order.items,
  });

  await createPublicTableEvent({
    tableId: table.table.id,
    tenantId: table.table.tenant_id,
    eventType: "order",
    metadata,
  });

  await notifyTableEventCreated(table, "order");
}
