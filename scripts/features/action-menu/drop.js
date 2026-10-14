import { MODULE_ID, DOM_IDS } from "../../constants.js";
import { addMacro, addPersonalItem, addFavorite } from "./actions.js";

/**
 * Resolves drop payload into a normalized macro entry.
 * @param {object} payload - Parsed drag-and-drop payload from Foundry
 * @param {object} adapter - Active system adapter instance
 * @returns {Promise<{id: string, name: string, img: string, type: string}|null>}
 */
async function resolveDroppedMacro(payload, adapter) {
	if (payload.type === "Macro") {
		const doc = await Macro.fromDropData(payload);
		if (!doc?.uuid) return null;
		return { id: doc.uuid, name: doc.name, img: doc.img, type: "Macro" };
	}
	if (payload.type === "Item") {
		if (adapter?.createSystemMacro) {
			const doc = await adapter.createSystemMacro(payload);
			if (doc?.uuid) return { id: doc.uuid, name: doc.name, img: doc.img, type: "Macro" };
		}
		const doc = await Item.fromDropData(payload);
		if (doc?.uuid) return { id: doc.uuid, name: doc.name, img: doc.img, type: "Item" };
	}
	return null;
}

/**
 * Determines target tab index for custom menu category drops.
 * @param {string|number} activeTab - Currently active tab key
 * @param {string|number} activeSubTab - Currently active sub-tab key
 * @param {number} categoryIndex - Parsed custom category index
 * @returns {number} 0-based tab index
 */
function resolveTargetTabIndex(activeTab, activeSubTab, categoryIndex) {
	const subStr = String(activeSubTab || "");
	const tabStr = String(activeTab || "");

	if (subStr.startsWith("tab-")) {
		return parseInt(subStr.slice(4), 10) || 0;
	}
	if (tabStr.startsWith("tab-")) {
		return parseInt(tabStr.slice(4), 10) || 0;
	}
	if (activeTab) {
		const config = game.settings.get(MODULE_ID, "configuration") || {};
		const categoryDef = config.customMenu?.[categoryIndex];
		if (Array.isArray(categoryDef?.tabs)) {
			const idx = categoryDef.tabs.findIndex((t) => {
				const slug = (t.label || "General").replace(/\s+/g, "_").toLowerCase();
				return slug === activeTab;
			});
			if (idx > -1) return idx;
		}
	}
	return 0;
}

/**
 * Handles drop event onto action submenu containers, custom category buttons, or favorites bar.
 * @param {typeof import("../action-menu.js").ActionMenu} ActionMenu
 * @param {DragEvent} event
 */
export async function onDrop(ActionMenu, event) {
	event.preventDefault();
	event.stopPropagation();

	const root = document.getElementById(ActionMenu.ROOT_ID);
	root?.classList.remove("drag-hover");
	root?.removeAttribute("data-drag-text");
	root?.querySelectorAll(".drag-target")?.forEach((el) => el.classList.remove("drag-target"));

	const subContainer = document.getElementById(ActionMenu.SUB_ID) || document.getElementById(DOM_IDS.SUBMENU);
	subContainer?.classList.remove("drag-hover");

	const dragPayload = foundry.applications?.ux?.TextEditor?.implementation?.getDragEventData
		? foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
		: (TextEditor.getDragEventData ? TextEditor.getDragEventData(event) : null);
	if (!dragPayload?.type) return;

	const actor = ActionMenu?.currentActor;
	if (!actor) return;

	// Case 1: Dropped directly onto a Custom Category button on the HUD dock
	const customBtn = event.target?.closest?.(".nah-action-btn[data-category^='custom-']");
	if (customBtn) {
		const catStr = customBtn.dataset.category || "";
		const catIdx = parseInt(catStr.replace("custom-", ""), 10);
		if (!Number.isNaN(catIdx)) {
			const itemEntry = await resolveDroppedMacro(dragPayload, ActionMenu.adapter);
			if (itemEntry?.id) {
				await addPersonalItem(ActionMenu, catIdx, 0, itemEntry);
			}
			return;
		}
	}

	// Case 2: Dropped inside an active submenu
	const targetCategory = subContainer?.dataset?.activeCat;
	const isInsideSubmenu = Boolean(subContainer && subContainer.contains(event.target));
	const isQuickSlotsTarget = Boolean(event.target?.closest?.(".nah-quick-slot-container"));

	if (targetCategory && (isInsideSubmenu || !isQuickSlotsTarget)) {
		const menuInfo = ActionMenu._currentSubMenuData || (await ActionMenu.adapter?.getSubMenuData(actor, targetCategory));
		const isCustom = targetCategory.startsWith("custom-");
		const isMacroTab =
			String(ActionMenu.activeTab) === "macro" &&
			menuInfo?.items?.macro?.all &&
			menuInfo?.subTabLabels?.macro?.all;

		if (isMacroTab) {
			let macroDoc = null;
			if (dragPayload.type === "Macro") {
				macroDoc = await Macro.fromDropData(dragPayload);
			} else if (dragPayload.type === "Item") {
				macroDoc = await ActionMenu.adapter?.createSystemMacro(dragPayload);
			}
			if (macroDoc) {
				await addMacro(ActionMenu, macroDoc);
			}
			return;
		}

		if (isCustom) {
			const catIdx = parseInt(targetCategory.replace("custom-", ""), 10);
			const tabIdx = resolveTargetTabIndex(ActionMenu.activeTab, ActionMenu.activeSubTab, catIdx);
			const itemEntry = await resolveDroppedMacro(dragPayload, ActionMenu.adapter);
			if (itemEntry?.id) {
				await addPersonalItem(ActionMenu, catIdx, tabIdx, itemEntry);
			}
			return;
		}
	}

	// Case 3: Dropped onto the Favorites Bar or dock (add Item or Macro to Favorites)
	if (dragPayload.type === "Item") {
		const itemDoc = await Item.fromDropData(dragPayload);
		if (itemDoc) {
			let targetItem = actor.items?.get(itemDoc.id);
			if (!targetItem && itemDoc.actor?.id === actor.id) {
				targetItem = itemDoc;
			}
			if (!targetItem && (actor.isOwner || game.user.isGM)) {
				try {
					const created = await actor.createEmbeddedDocuments("Item", [itemDoc.toObject()]);
					if (created?.[0]) targetItem = created[0];
				} catch (err) {
					console.warn("Nik's Action HUD | Failed to import dropped item:", err);
				}
			}

			if (targetItem) {
				const favs = ActionMenu.getFavorites() || [];
				if (!favs.includes(targetItem.id)) {
					const targetSlot = event.target?.closest?.(".nah-quick-slot[data-favorite-id]");
					let insertIdx = -1;
					if (targetSlot) {
						const targetId = targetSlot.dataset.favoriteId;
						const rect = targetSlot.getBoundingClientRect();
						const insertAfter = event.clientX >= rect.left + rect.width / 2;
						const idx = favs.indexOf(targetId);
						if (idx > -1) insertIdx = insertAfter ? idx + 1 : idx;
					}
					await addFavorite(ActionMenu, targetItem.id, insertIdx);
					ui.notifications.info(game.i18n.format("NAH.Notifications.AddedFavorite", { name: targetItem.name }) || `Added ${targetItem.name} to favorites.`);
				} else {
					ui.notifications.warn(game.i18n.format("NAH.Notifications.AlreadyFavorite", { name: targetItem.name }) || `${targetItem.name} is already in favorites.`);
				}
				return;
			}
		}
	} else if (dragPayload.type === "Macro") {
		const macroDoc = await Macro.fromDropData(dragPayload);
		if (macroDoc) {
			const macroFavId = `macro-${macroDoc.id}`;
			const favs = ActionMenu.getFavorites() || [];
			if (!favs.includes(macroFavId)) {
				const targetSlot = event.target?.closest?.(".nah-quick-slot[data-favorite-id]");
				let insertIdx = -1;
				if (targetSlot) {
					const targetId = targetSlot.dataset.favoriteId;
					const rect = targetSlot.getBoundingClientRect();
					const insertAfter = event.clientX >= rect.left + rect.width / 2;
					const idx = favs.indexOf(targetId);
					if (idx > -1) insertIdx = insertAfter ? idx + 1 : idx;
				}
				await addFavorite(ActionMenu, macroFavId, insertIdx);
				ui.notifications.info(game.i18n.format("NAH.Notifications.AddedFavorite", { name: macroDoc.name }) || `Added ${macroDoc.name} to favorites.`);
			} else {
				ui.notifications.warn(game.i18n.format("NAH.Notifications.AlreadyFavorite", { name: macroDoc.name }) || `${macroDoc.name} is already in favorites.`);
			}
			return;
		}
	}
}
