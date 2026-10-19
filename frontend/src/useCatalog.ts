import { useEffect, useRef, useState } from "react";
import { INITIAL_ITEMS, type ManageableItem } from "./data/items";
import { applyReleaseCheck, mergeInventory, type Installation, type CategoryAssignment, type ReleaseCheck } from "./inventory";

export async function readApiJson(response: Response) {
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`DotCode API returned an invalid response (HTTP ${response.status}). Restart the DotCode server, then reload.`); }
  if (!response.ok) throw new Error(data?.error || `DotCode API request failed (HTTP ${response.status}).`);
  return data;
}

export function useCatalog() {
  const [items, setItems] = useState<ManageableItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const releaseChecks = useRef(new Map<string, ReleaseCheck>());

  const checkUpdates = async (item: ManageableItem) => {
    let check: ReleaseCheck;
    try {
      const response = await fetch(`/api/updates?githubUrl=${encodeURIComponent(item.githubUrl)}`);
      const data = await readApiJson(response);
      check = data;
    } catch (error) {
      check = { githubUrl: item.githubUrl, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Update check failed.' };
    }
    releaseChecks.current.set(item.githubUrl, check);
    setItems(previous => previous.map(entry => entry.githubUrl === item.githubUrl ? applyReleaseCheck(entry, check) : entry));
  };

  const refreshInventory = async () => {
    try {
      const response = await fetch("/api/inventory");
      const data = await readApiJson(response);
      setItems(previous => mergeInventory(previous, data.installations as Installation[], data.categories as CategoryAssignment[] | undefined, [...releaseChecks.current.values()]));
      setInventoryError("");
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Inventory unavailable.");
    }
  };

  const refreshCatalog = async () => {
    try {
      const response = await fetch("/api/catalog");
      const data = await readApiJson(response);
      let catalog = data.items as ManageableItem[] | null;
      if (!catalog) {
        let legacy: ManageableItem[] | null = null;
        try { legacy = JSON.parse(localStorage.getItem("dotcode_items") || "null"); } catch {}
        catalog = legacy ?? INITIAL_ITEMS;
        await readApiJson(await fetch("/api/catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: catalog }) }));
      }
      setItems(mergeInventory(catalog, []));
      setCatalogLoaded(true);
      await refreshInventory();
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "Catalog unavailable.");
    }
  };

  useEffect(() => { void refreshCatalog(); }, []);

  return { items, inventoryError, catalogLoaded, refreshCatalog, checkUpdates };
}
