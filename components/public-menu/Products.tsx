"use client";

import Modal from "./Modals/Modal";
import { useState } from "react";
import Image from "next/image";
import { Product, Highlight } from "./types";
import { BookOpenText, ClipboardPlus, Info } from "lucide-react";

const SHOW_PRODUCT_INFO_BUTTON = false;

export default function Products({
  products,
  highlights,
  selectedCategory,
  onAddToCart,
}: {
  products: Product[];
  highlights: Highlight[];
  selectedCategory: number | null;
  onAddToCart: (product: Product) => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<null | "viewProduct">(null);
  const activeProducts = products.filter((product) => product.active !== false);
  const activeHighlights = highlights.filter((highlight) => highlight.active !== false);

  const sortedProducts = selectedCategory
    ? activeProducts.filter((product) => product.category?.id === selectedCategory)
    : activeProducts;

  function openModal(modalName: "viewProduct", productId?: number) {
    setActiveModal(modalName);
    setSelectedProductId(productId ?? null);
  }

  function closeModal() {
    setActiveModal(null);
    setSelectedProductId(null);
  }

  const selectedProduct = activeProducts.find((p) => p.id === selectedProductId);
  return (
    <div className="flex flex-col gap-y-2 mb-5">
      {activeHighlights.length ? (
        <section className="pb-2 text-[var(--color-foreground)]">
          <h1 className="pb-3 font-bold">Destacados</h1>

          {/* Carrusel con scroll snap */}
          <div
            className="overflow-x-auto snap-x snap-mandatory scroll-smooth w-full scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex gap-4 pr-6 rounded-xl">
              {activeHighlights.map((highlight, index) => (
                <article
                  key={highlight.id}
                  className="snap-start snap-always shrink-0 basis-[90%] sm:basis-[70%] w-full rounded-xl bg-[var(--color-surface)] p-3"
                >
                  {highlight.image_url ? (
                    <Image
                      src={highlight.image_url}
                      alt={highlight.id.toString()}
                      width={1200}
                      height={800}
                      unoptimized
                      priority={index === 0}
                      className="h-32 w-full sm:h-56 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="h-32 w-full sm:h-56 border rounded-xl border-[var(--color-border-box)] grid place-items-center text-xs">
                      Sin foto
                    </div>
                  )}
                  <p className="mt-2 text-sm font-semibold text-[var(--color-category)]">{highlight.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {sortedProducts.map((product, index) => {
        const isFirstProduct = index === 0;

        return (
          <div key={product.id} className="flex flex-row gap-2 items-start rounded-xl bg-[var(--color-surface)] p-4">
            {/* Foto */}
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                width={96}
                height={96}
                unoptimized
                loading={isFirstProduct ? "eager" : "lazy"}
                priority={isFirstProduct}
                fetchPriority={isFirstProduct ? "high" : "auto"}
                className="w-24 h-24 object-cover rounded-xl border border-[var(--color-border-box)] flex-none shrink-0"
              />
            ) : (
              <div className="w-24 h-24 flex-none shrink-0 border border-[var(--color-border-box)] rounded-xl flex items-center justify-center text-xs">
                Sin foto
              </div>
            )}
          <div className="flex flex-col gap-2 items-start flex-1 min-w-0 text-xs">
            {/* Nombre */}
            <div className="font-semibold line-clamp-2">{product.name}</div>
            {/* Descripcion */}
            <div className="text-[var(--color-dish)] line-clamp-3">{product.description}</div>
            {/* Precio */}
            <div className="font-extrabold text-[var(--color-primary)]">
              {new Intl.NumberFormat("es-CL", {
                style: "currency",
                currency: "CLP",
                minimumFractionDigits: 0,
              }).format(product.price)}
            </div>
          </div>
          <div className="flex flex-col gap-2 ml-auto items-center justify-between h-14">
            <button
              className="items-center rounded-full p-1 bg-[var(--color-primary)] shrink-0"
              aria-label="Recordar plato"
              onClick={() => onAddToCart(product)}
            >
              <ClipboardPlus className="text-white" size={16} />
            </button>
            {SHOW_PRODUCT_INFO_BUTTON ? (
              <button
                onClick={() => {
                  openModal("viewProduct", product.id);
                }}
                className="order-last text-[var(--color-primary)]"
                aria-label="Mas informacion"
              >
                <Info size={20} />
              </button>
            ) : null}
          </div>
        </div>
        );
      })}

      {/* Modal unico fuera del map */}
      <Modal
        isOpen={activeModal === "viewProduct"}
        icon={<BookOpenText className="text-[var(--color-primary)]" />}
        iconBgOptionalClassName="bg-[var(--color-bg-selected)]"
        onCloseAction={closeModal}
        title={selectedProduct?.name ?? "Producto"}
        body={
          selectedProduct ? (
            <div className="flex flex-col gap-2 text-[var(--color-foreground)]">
              <p className="text-sm">{selectedProduct.description ?? "Sin descripcion"}</p>
            </div>
          ) : null
        }
        buttonAName="Cerrar"
        buttonAOptionalClassName="bg-[var(--color-cancel)]"
        onButtonAClickAction={closeModal}
      />
    </div>
  );
}

