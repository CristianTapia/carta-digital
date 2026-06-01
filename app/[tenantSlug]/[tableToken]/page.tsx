import { notFound } from "next/navigation";

import {
  listPublicCategoriesByTenant,
  listPublicHighlightsByTenant,
  listPublicProductsByTenant,
} from "@/app/lib/data/public-menu";
import { resolvePublicTableByToken } from "@/app/lib/data/public-tables";
import ClientMenu from "@/components/public-menu/ClientMenu";

export const dynamic = "force-dynamic";

export default async function PublicTenantTableMenuPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; tableToken: string }>;
}) {
  const { tenantSlug, tableToken } = await params;

  let tenantKey: string;
  let token: string;
  try {
    tenantKey = decodeURIComponent(tenantSlug);
    token = decodeURIComponent(tableToken);
  } catch {
    notFound();
  }

  const tableData = await resolvePublicTableByToken(token);
  if (!tableData) notFound();

  const validTenantKeys = [tableData.tenant.id, tableData.tenant.domain].filter(Boolean);
  if (!validTenantKeys.includes(tenantKey)) notFound();

  const [products, categories, highlights] = await Promise.all([
    listPublicProductsByTenant(tableData.tenant.id, { limit: 200 }),
    listPublicCategoriesByTenant(tableData.tenant.id),
    listPublicHighlightsByTenant(tableData.tenant.id, { limit: 20 }),
  ]);

  return (
    <ClientMenu
      products={products}
      categories={categories}
      highlights={highlights}
      context={{
        tenantId: tableData.tenant.id,
        tenantName: tableData.tenant.name,
        tableId: tableData.table.id,
        tableLabel: tableData.table.label,
        roomName: tableData.table.room_name,
        tableToken: tableData.table.public_token,
      }}
    />
  );
}
