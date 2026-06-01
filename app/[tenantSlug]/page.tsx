import { notFound } from "next/navigation";

import {
  listPublicCategoriesByTenant,
  listPublicHighlightsByTenant,
  listPublicProductsByTenant,
  resolveTenantByPublicKey,
} from "@/app/lib/data/public-menu";
import ClientMenu from "@/components/public-menu/ClientMenu";

export const dynamic = "force-dynamic";

export default async function PublicTenantMenuPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  let tenantKey: string;
  try {
    tenantKey = decodeURIComponent(tenantSlug);
  } catch {
    notFound();
  }

  const tenantData = await resolveTenantByPublicKey(tenantKey);
  if (!tenantData) notFound();

  const [products, categories, highlights] = await Promise.all([
    listPublicProductsByTenant(tenantData.id, { limit: 200 }),
    listPublicCategoriesByTenant(tenantData.id),
    listPublicHighlightsByTenant(tenantData.id, { limit: 20 }),
  ]);

  return (
    <ClientMenu
      products={products}
      categories={categories}
      highlights={highlights}
      context={{
        tenantId: tenantData.id,
        tenantName: tenantData.name,
      }}
    />
  );
}
