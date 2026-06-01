"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Categories from "./Categories";
import Products from "./Products";
import OffCanvas from "./OffCanvas";
import MenuRealtimeRefresh from "./MenuRealtimeRefresh";
import Modal from "./Modals/Modal";
import { Product, Category, Highlight, MenuContext } from "./types";
import { sendTableAttentionRequest, sendTableOrderRequest } from "./actions";
import { ClipboardList, Plus, Minus, Bell, ReceiptText, CheckCircle2, TriangleAlert } from "lucide-react";

type CartItem = { product: Product; quantity: number; notes?: string };
type TableAttentionEvent = "service" | "bill";
type TableAttentionFeedback = { type: "success" | "error"; message: string } | null;
type OrderFeedback = { type: "success" | "error"; message: string } | null;
type ActivePopup = null | "orderWarning" | "orderSuccess" | "attentionSuccess";

const EMPTY_CART_SNAPSHOT = "[]";
const CART_CHANGE_EVENT = "menu-cart-changed";
const ORDER_WARNING_ACK_EVENT = "menu-order-warning-ack";

function loadStoredCart(cartStorageKey: string) {
  if (typeof window === "undefined") return [];

  try {
    const storedCart = window.localStorage.getItem(cartStorageKey);
    if (!storedCart) return [];

    const parsedCart = JSON.parse(storedCart) as { product: Product; quantity: number }[];
    if (!Array.isArray(parsedCart)) return [];

    return parsedCart.filter(
      (item) =>
        item &&
        typeof item.quantity === "number" &&
        item.quantity > 0 &&
        item.product &&
        typeof item.product.id === "number",
    );
  } catch {
    return [];
  }
}

function readStoredCartSnapshot(cartStorageKey: string) {
  if (typeof window === "undefined") return EMPTY_CART_SNAPSHOT;

  return JSON.stringify(loadStoredCart(cartStorageKey));
}

function subscribeStoredCart(cartStorageKey: string, onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === cartStorageKey) onStoreChange();
  };

  const handleCartChange = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    if (detail?.key === cartStorageKey) onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CART_CHANGE_EVENT, handleCartChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CART_CHANGE_EVENT, handleCartChange);
  };
}

function saveStoredCart(cartStorageKey: string, cartItems: CartItem[]) {
  window.localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
  window.dispatchEvent(new CustomEvent(CART_CHANGE_EVENT, { detail: { key: cartStorageKey } }));
}

function hasSeenOrderWarning(orderWarningKey: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(orderWarningKey) === "true";
}

function saveOrderWarningSeen(orderWarningKey: string) {
  window.localStorage.setItem(orderWarningKey, "true");
  window.dispatchEvent(new CustomEvent(ORDER_WARNING_ACK_EVENT, { detail: { key: orderWarningKey } }));
}

export default function ClientMenu({
  products,
  categories,
  highlights,
  context,
}: {
  products: Product[];
  categories: Category[];
  highlights: Highlight[];
  context?: MenuContext;
}) {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isOffCanvasOpen, setIsOffCanvasOpen] = useState(false);
  const [pendingAttentionEvent, setPendingAttentionEvent] = useState<TableAttentionEvent | null>(null);
  const [attentionFeedback, setAttentionFeedback] = useState<TableAttentionFeedback>(null);
  const [isSendingOrder, setIsSendingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<OrderFeedback>(null);
  const [activePopup, setActivePopup] = useState<ActivePopup>(null);
  const [attentionSuccessMessage, setAttentionSuccessMessage] = useState("");
  const cartStorageKey = useMemo(() => {
    const tenantScope = context?.tenantName?.trim() || "menu";
    const tableScope = context?.tableToken?.trim() || "general";

    return `menu-cart:${tenantScope}:${tableScope}`;
  }, [context?.tableToken, context?.tenantName]);
  const orderWarningKey = useMemo(() => `${cartStorageKey}:order-warning-seen`, [cartStorageKey]);
  const cartSnapshot = useSyncExternalStore(
    (onStoreChange) => subscribeStoredCart(cartStorageKey, onStoreChange),
    () => readStoredCartSnapshot(cartStorageKey),
    () => EMPTY_CART_SNAPSHOT,
  );
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartItems = useMemo(() => {
    const storedItems = JSON.parse(cartSnapshot) as CartItem[];

    return storedItems.flatMap((item) => {
      const currentProduct = productsById.get(item.product.id);
      if (!currentProduct || currentProduct.active === false) return [];

      return [{ ...item, product: currentProduct }];
    });
  }, [cartSnapshot, productsById]);

  useEffect(() => {
    const storedItems = JSON.parse(cartSnapshot) as CartItem[];
    const hasStaleItems =
      storedItems.length !== cartItems.length ||
      storedItems.some((item) => item.product.active === false || !productsById.has(item.product.id));

    if (hasStaleItems) {
      saveStoredCart(cartStorageKey, cartItems);
    }
  }, [cartItems, cartSnapshot, cartStorageKey, productsById]);

  const subTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cartItems],
  );
  const tableContextLabel = [context?.roomName, context?.tableLabel].filter(Boolean).join(" - ");

  const formatCLP = (value: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(value);

  const handleAddToCart = (product: Product) => {
    const exists = cartItems.find((item) => item.product.id === product.id);
    const updatedCartItems = exists
      ? cartItems.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      : [...cartItems, { product, quantity: 1 }];

    saveStoredCart(cartStorageKey, updatedCartItems);
    setIsOffCanvasOpen(true);
  };

  const handleRemoveFromCart = (product: Product) => {
    saveStoredCart(
      cartStorageKey,
      cartItems
        .map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0),
    );
  };

  const sendOrder = async () => {
    const tableToken = context?.tableToken?.trim();
    if (!tableToken || isSendingOrder || cartItems.length === 0) return;

    setIsSendingOrder(true);
    setOrderFeedback(null);

    try {
      await sendTableOrderRequest(tableToken, {
        items: cartItems.map((item) => ({
          id: String(item.product.id),
          name: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
          ...(item.notes ? { notes: item.notes } : {}),
        })),
        total: subTotal,
        currency: "CLP",
      });
      saveStoredCart(cartStorageKey, []);
      setOrderFeedback({ type: "success", message: "Comanda enviada" });
      setActivePopup("orderSuccess");
    } catch (error) {
      console.error(error);
      setOrderFeedback({
        type: "error",
        message: "No pudimos enviar la comanda. Intenta nuevamente.",
      });
    } finally {
      setIsSendingOrder(false);
    }
  };

  const handleSendOrder = async () => {
    if (hasSeenOrderWarning(orderWarningKey)) {
      await sendOrder();
      return;
    }

    setActivePopup("orderWarning");
  };

  const handleConfirmFirstOrder = async () => {
    saveOrderWarningSeen(orderWarningKey);
    setActivePopup(null);
    await sendOrder();
  };

  const handleTableAttentionRequest = async (eventType: TableAttentionEvent) => {
    const tableToken = context?.tableToken?.trim();
    if (!tableToken || pendingAttentionEvent) return;

    setPendingAttentionEvent(eventType);
    setAttentionFeedback(null);

    try {
      await sendTableAttentionRequest(tableToken, eventType);
      const successMessage = eventType === "service" ? "El garz\u00f3n fue llamado" : "La cuenta fue pedida";
      setAttentionFeedback({ type: "success", message: successMessage });
      setAttentionSuccessMessage(successMessage);
      setActivePopup("attentionSuccess");
    } catch (error) {
      console.error(error);
      setAttentionFeedback({
        type: "error",
        message: "No pudimos enviar la solicitud. Intenta nuevamente.",
      });
    } finally {
      setPendingAttentionEvent(null);
    }
  };

  const hasTableAttention = Boolean(context?.tableToken);
  const isSendingAttention = pendingAttentionEvent !== null;
  const footerColumns = hasTableAttention ? "grid-cols-3" : "grid-cols-1";

  return (
    <div className="flex flex-col bg-[var(--color-background)]">
      <MenuRealtimeRefresh
        fallbackIntervalMs={Number(process.env.NEXT_PUBLIC_MENU_AUTO_REFRESH_MS ?? 0)}
        tenantId={context?.tenantId}
        tableId={context?.tableId}
        tableToken={context?.tableToken}
      />
      <header className="fixed inset-x-0 top-0 overflow-x-auto p-3 text-[var(--color-foreground)] bg-[rgb(var(--color-background-rgb)/0.92)] ">
        <div className="items-center text-center font-bold p-2">
          {context?.tenantName ? context.tenantName : "Menu"}
          {tableContextLabel ? <div className="text-xs font-medium opacity-70 mt-1">{tableContextLabel}</div> : null}
        </div>
        <Categories categories={categories} onCategorySelectionAction={setSelectedCategory} />
      </header>
      <main
        className={`overflow-y-auto p-4 bg-[var(--color-background)] mt-25 ${
          hasTableAttention
            ? "pb-[calc(6rem+env(safe-area-inset-bottom))]"
            : "pb-[calc(4rem+env(safe-area-inset-bottom))]"
        }`}
      >
        <Products
          products={products}
          selectedCategory={selectedCategory}
          highlights={highlights}
          onAddToCart={handleAddToCart}
        />
      </main>
      <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--color-primary)] bg-[rgb(var(--color-background-rgb)/0.95)] text-center px-4 py-3">
        <div className="max-w-4xl mx-auto h-full grid gap-2">
          {hasTableAttention ? (
            <p
              className={`min-h-4 text-xs font-semibold ${
                attentionFeedback?.type === "error" ? "text-[var(--color-primary)]" : "text-[var(--color-category)]"
              }`}
              aria-live="polite"
            >
              {attentionFeedback?.message ?? ""}
            </p>
          ) : null}
          <div className={`grid gap-4 ${footerColumns}`}>
            {hasTableAttention ? (
              <>
                <button
                  type="button"
                  aria-label="Llamar garzon"
                  onClick={() => handleTableAttentionRequest("service")}
                  disabled={isSendingAttention}
                  className="flex flex-col items-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Bell className="h-6 w-6 text-[var(--color-category)]" aria-hidden="true" />
                  <span className="pt-1 text-xs font-extrabold text-[var(--color-category)]">
                    {pendingAttentionEvent === "service" ? "Enviando..." : "Llamar garz\u00f3n"}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Pedir cuenta"
                  onClick={() => handleTableAttentionRequest("bill")}
                  disabled={isSendingAttention}
                  className="flex flex-col items-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ReceiptText className="h-6 w-6 text-[var(--color-category)]" aria-hidden="true" />
                  <span className="pt-1 text-xs font-extrabold text-[var(--color-category)]">
                    {pendingAttentionEvent === "bill" ? "Enviando..." : "Pedir cuenta"}
                  </span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              aria-label="Mi comanda"
              onClick={() => setIsOffCanvasOpen(true)}
              className="flex flex-col items-center"
            >
              <ClipboardList className="h-6 w-6 text-[var(--color-category)]" aria-hidden="true" />
              <span className="pt-1 text-xs font-extrabold text-[var(--color-category)]">Mi comanda</span>
            </button>
          </div>
        </div>
      </footer>
      <OffCanvas
        subTotal={subTotal}
        isOpen={isOffCanvasOpen}
        onCloseAction={() => setIsOffCanvasOpen(false)}
        canSendOrder={Boolean(context?.tableToken) && cartItems.length > 0}
        isSendingOrder={isSendingOrder}
        orderFeedback={orderFeedback}
        onSendOrderAction={handleSendOrder}
      >
        {cartItems.length === 0 ? (
          <div className="p-4 text-sm text-[var(--color-foreground)]">Tu comanda esta vacia</div>
        ) : (
          <div className="p-2 flex flex-col gap-3 text-sm text-[var(--color-foreground)]">
            {cartItems.map((item) => (
              <div key={item.product.id} className="flex items-center gap-3 pb-3 last:pb-0">
                {item.product.image_url ? (
                  <div className="w-12 h-12 overflow-hidden rounded-lg border border-[var(--color-border-box)]">
                    <Image
                      src={item.product.image_url}
                      alt={item.product.name}
                      width={48}
                      height={48}
                      unoptimized
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg border border-[var(--color-border-box)] grid place-items-center text-[10px]">
                    Sin foto
                  </div>
                )}
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="font-semibold line-clamp-2">{item.product.name}</div>
                  <div className="text-[var(--color-dish)] text-xs">
                    {formatCLP(item.product.price * item.quantity)}
                  </div>
                </div>
                {/* Botones de cantidad */}
                <div className="flex font-bold items-center justify-center gap-3 rounded-full border border-[var(--color-border)] px-3 py-1">
                  <button onClick={() => handleRemoveFromCart(item.product)} className="text-[var(--color-primary)]">
                    <Minus size={14} />
                  </button>
                  <span className="w-3 text-center font-medium text-[var(--color-foreground)]">{item.quantity}</span>
                  <button onClick={() => handleAddToCart(item.product)} className="text-[var(--color-primary)]">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </OffCanvas>
      <Modal
        isOpen={activePopup === "orderWarning"}
        icon={<TriangleAlert className="text-[var(--color-primary)]" />}
        iconBgOptionalClassName="bg-[var(--color-bg-selected)]"
        onCloseAction={() => setActivePopup(null)}
        title="Confirmar comanda"
        body={
          <div className="max-w-sm text-center text-sm leading-6">
            Al enviar esta comanda, el local recibira tu pedido y alguien llevara estos platos a tu mesa. Usa este boton
            solo cuando quieras pedir de verdad.
          </div>
        }
        buttonAName="Revisar"
        buttonAOptionalClassName="bg-[var(--color-cancel)]"
        onButtonAClickAction={() => setActivePopup(null)}
        buttonBName={isSendingOrder ? "Enviando..." : "Enviar comanda"}
        buttonBOptionalClassName="bg-[var(--color-primary)] text-[var(--color-background)]"
        onButtonBClickAction={() => {
          if (!isSendingOrder) void handleConfirmFirstOrder();
        }}
      />
      <Modal
        isOpen={activePopup === "orderSuccess"}
        icon={<CheckCircle2 className="text-[var(--color-accent)]" />}
        iconBgOptionalClassName="bg-[var(--color-bg-selected)]"
        onCloseAction={() => setActivePopup(null)}
        title="Comanda enviada"
        body={<div className="max-w-[13rem] text-center text-sm leading-6">Tu orden fue enviada correctamente.</div>}
        buttonAName="Entendido"
        buttonAOptionalClassName="bg-[var(--color-primary)] text-[var(--color-background)]"
        onButtonAClickAction={() => setActivePopup(null)}
      />
      <Modal
        isOpen={activePopup === "attentionSuccess"}
        icon={<CheckCircle2 className="text-[var(--color-accent)]" />}
        iconBgOptionalClassName="bg-[var(--color-bg-selected)]"
        onCloseAction={() => setActivePopup(null)}
        title="Solicitud enviada"
        body={
          <div className="max-w-sm text-center text-sm leading-6">
            {attentionSuccessMessage || "Tu solicitud fue enviada correctamente."}
          </div>
        }
        buttonAName="Entendido"
        buttonAOptionalClassName="bg-[var(--color-primary)] text-[var(--color-background)]"
        onButtonAClickAction={() => setActivePopup(null)}
      />
    </div>
  );
}


