import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";

export type RfqCartItem = {
  key: string;
  productId?: Id<"products">;
  sku?: string;
  nameAr?: string;
  nameEn?: string;
  specificationsAr?: string;
  specificationsEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  quantity: number;
  unit: string;
};

type AddItemInput = Omit<RfqCartItem, "key" | "quantity" | "unit"> & {
  quantity?: number;
  unit?: string;
};

type RfqCartContextValue = {
  items: RfqCartItem[];
  addItem: (item: AddItemInput) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  replaceAll: (items: AddItemInput[]) => void;
  clear: () => void;
};

const RfqCartContext = createContext<RfqCartContextValue | null>(null);

type RfqCartProviderProps = {
  children: ReactNode;
};

function buildItem(input: AddItemInput, fallbackKey: string): RfqCartItem {
  return {
    ...input,
    key: input.productId ?? fallbackKey,
    quantity: input.quantity ?? 1,
    unit: input.unit ?? "unit"
  };
}

export function RfqCartProvider({ children }: RfqCartProviderProps) {
  const [items, setItems] = useState<RfqCartItem[]>([]);

  const addItem = useCallback<RfqCartContextValue["addItem"]>((item) => {
    setItems((current) => {
      const candidateKey = item.productId ?? `custom-${Date.now()}-${current.length}`;
      const existing = current.find((entry) => entry.key === candidateKey);
      if (existing) {
        return current.map((entry) =>
          entry.key === candidateKey ? { ...entry, quantity: entry.quantity + (item.quantity ?? 1) } : entry
        );
      }
      return [...current, buildItem(item, candidateKey)];
    });
  }, []);

  const removeItem = useCallback<RfqCartContextValue["removeItem"]>((key) => {
    setItems((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const updateQuantity = useCallback<RfqCartContextValue["updateQuantity"]>((key, quantity) => {
    setItems((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, quantity: Math.max(1, Math.floor(quantity)) } : entry))
    );
  }, []);

  const replaceAll = useCallback<RfqCartContextValue["replaceAll"]>((nextItems) => {
    setItems(() =>
      nextItems.map((item, index) => buildItem(item, item.productId ?? `custom-${Date.now()}-${index}`))
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, addItem, removeItem, updateQuantity, replaceAll, clear }),
    [items, addItem, removeItem, updateQuantity, replaceAll, clear]
  );

  return <RfqCartContext.Provider value={value}>{children}</RfqCartContext.Provider>;
}

export function useRfqCart() {
  const context = useContext(RfqCartContext);
  if (!context) {
    throw new Error("useRfqCart must be used within RfqCartProvider.");
  }
  return context;
}
