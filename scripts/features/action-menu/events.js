import { onDrop } from "./drop.js";
import { enableLongPressDrag } from "./drag.js";
import { MODULE_ID, DOM_IDS } from "../../constants.js";

const PRIMARY_FAVORITE_DRAG_TYPE = "application/x-niks-action-hud-favorite";

const closest = (target, selector) => (target?.closest ? target.closest(selector) : null);

const clearFavoriteDropIndicators = (root) => {
	if (!root) return;
	root
		.querySelectorAll(".nah-quick-slot.drop-before, .nah-quick-slot.drop-after")
		.forEach((el) => el.classList.remove("drop-before", "drop-after"));
};

const isFavoriteDragEvent = (event) => {
	const types = Array.from(event.dataTransfer?.types || []);
	return types.includes(PRIMARY_FAVORITE_DRAG_TYPE);
};

let outsideClickAttached = false;
export function bindOutsideClickListener(ActionMenu) {
	if (outsideClickAttached) return;
	outsideClickAttached = true;

	document.addEventListener(
		"click",
		(event) => {
			const sub = document.getElementById(ActionMenu.SUB_ID);
			if (!sub || !sub.classList.contains("active")) return;

			const root = document.getElementById(ActionMenu.ROOT_ID);
			const inside = (root && root.contains(event.target)) || sub.contains(event.target);

			if (!inside) {
				sub.classList.remove("active");
				root?.classList.remove("has-active-submenu");
				ActionMenu.hideTooltip(true);
			}
		},
		true
	);
}

export function clearAllDragState(ActionMenu) {
	const root = document.getElementById(ActionMenu.ROOT_ID);
	if (root) {
		clearFavoriteDropIndicators(root);
		root
			.querySelectorAll(".nah-quick-slot.is-dragging")
			.forEach((s) => s.classList.remove("is-dragging"));
		root.classList.remove("drag-hover");
		root.removeAttribute("data-drag-text");
		root.querySelectorAll(".drag-target")?.forEach((el) => el.classList.remove("drag-target"));
	}
	const sub = document.getElementById(ActionMenu.SUB_ID);
	sub?.classList.remove("drag-hover");
}

let globalDragAttached = false;
function bindGlobalDragCleanup(ActionMenu) {
	if (globalDragAttached) return;
	globalDragAttached = true;

	window.addEventListener("dragend", () => {
		clearAllDragState(ActionMenu);
	});

	window.addEventListener("drop", (e) => {
		const root = document.getElementById(ActionMenu.ROOT_ID);
		const sub = document.getElementById(ActionMenu.SUB_ID);
		if ((!root || !root.contains(e.target)) && (!sub || !sub.contains(e.target))) {
			clearAllDragState(ActionMenu);
		}
	});
}

export function bindSubMenuEvents(ActionMenu) {
	const sub = document.getElementById(ActionMenu.SUB_ID);
	if (!sub) return;

	sub.addEventListener("drop", (event) => {
		clearAllDragState(ActionMenu);
		if (isFavoriteDragEvent(event)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		void onDrop(ActionMenu, event);
	});

	sub.addEventListener("dragenter", (e) => {
		e.preventDefault();
		if (isFavoriteDragEvent(e)) {
			e.stopPropagation();
			return;
		}
		sub.classList.add("drag-hover");
	});

	sub.addEventListener("dragover", (e) => {
		e.preventDefault();
		if (isFavoriteDragEvent(e)) e.stopPropagation();
	});

	sub.addEventListener("dragleave", (e) => {
		if (isFavoriteDragEvent(e)) {
			e.stopPropagation();
			sub.classList.remove("drag-hover");
			return;
		}
		if (!e.relatedTarget || !sub.contains(e.relatedTarget)) {
			sub.classList.remove("drag-hover");
		}
	});
}

export function bindRootEvents(ActionMenu) {
	const root = document.getElementById(ActionMenu.ROOT_ID);
	if (!root) return;

	bindOutsideClickListener(ActionMenu);
	bindGlobalDragCleanup(ActionMenu);

	let favoriteDrag = null;
	let suppressClickUntil = 0;

	const isFavDrag = (e) => Boolean(favoriteDrag || isFavoriteDragEvent(e));

	const finishFavDrag = () => {
		clearAllDragState(ActionMenu);
		favoriteDrag = null;
		suppressClickUntil = performance.now() + 250;
	};

	root.addEventListener("click", (event) => {
		const slot = closest(event.target, ".nah-quick-slot[data-favorite-id]");
		if (!slot) return;

		event.preventDefault();
		event.stopPropagation();
		if (performance.now() < suppressClickUntil) return;

		ActionMenu.hideTooltip(true);
		const fid = slot.dataset.favoriteId;
		if (fid) ActionMenu.useItem(fid, event);
	});

	root.addEventListener("contextmenu", (event) => {
		const slot = closest(event.target, ".nah-quick-slot[data-favorite-id]");
		if (!slot) return;

		event.preventDefault();
		event.stopPropagation();
		ActionMenu.hideTooltip(true);
		const fid = slot.dataset.favoriteId;
		if (fid) void ActionMenu.openFavoriteDialog(fid);
	});

	root.addEventListener("dragstart", (event) => {
		const slot = closest(event.target, ".nah-quick-slot[data-favorite-id]");
		if (!slot || !event.dataTransfer) return;

		const fid = slot.dataset.favoriteId;
		if (!fid || !ActionMenu.currentActor) return;

		ActionMenu.hideTooltip(true);
		favoriteDrag = { favoriteId: fid, actor: ActionMenu.currentActor };
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData(PRIMARY_FAVORITE_DRAG_TYPE, fid);
		event.dataTransfer.setData("text/plain", fid);
		slot.classList.add("is-dragging");
		root.classList.remove("drag-hover");
		event.stopPropagation();
	});

	root.addEventListener("dragend", () => {
		clearAllDragState(ActionMenu);
		if (favoriteDrag) finishFavDrag();
	});

	root.addEventListener("drop", (event) => {
		if (isFavDrag(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			const container = closest(event.target, ".nah-quick-slot-container");
			const targetSlot = closest(event.target, ".nah-quick-slot[data-favorite-id]");
			const sourceId = favoriteDrag?.favoriteId || event.dataTransfer?.getData(PRIMARY_FAVORITE_DRAG_TYPE);
			const actor = favoriteDrag?.actor || ActionMenu.currentActor;
			const targetId = targetSlot?.dataset.favoriteId || null;
			const insertAfter = targetSlot ? event.clientX >= targetSlot.getBoundingClientRect().left + targetSlot.getBoundingClientRect().width / 2 : true;

			finishFavDrag();
			if (container && sourceId && actor) {
				void ActionMenu.reorderFavorites(sourceId, targetId, insertAfter, actor);
			}
			return;
		}

		clearAllDragState(ActionMenu);
		void onDrop(ActionMenu, event);
	});

	root.addEventListener("dragover", (event) => {
		if (isFavDrag(event)) {
			event.preventDefault();
			event.stopPropagation();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			clearFavoriteDropIndicators(root);

			const container = closest(event.target, ".nah-quick-slot-container");
			const targetSlot = closest(event.target, ".nah-quick-slot[data-favorite-id]");
			if (!container || !targetSlot || targetSlot.dataset.favoriteId === favoriteDrag?.favoriteId) return;

			const rect = targetSlot.getBoundingClientRect();
			const insertAfter = event.clientX >= rect.left + rect.width / 2;
			targetSlot.classList.add(insertAfter ? "drop-after" : "drop-before");
			return;
		}

		event.preventDefault();

		// Highlight custom category button if directly hovering over one
		const customBtn = closest(event.target, ".nah-action-btn[data-category^='custom-']");
		root.querySelectorAll(".nah-action-btn.drag-target").forEach((b) => {
			if (b !== customBtn) b.classList.remove("drag-target");
		});
		if (customBtn) {
			customBtn.classList.add("drag-target");
		}

		// Show slot drop indicator if hovering over quick slots
		const targetSlot = closest(event.target, ".nah-quick-slot[data-favorite-id]");
		clearFavoriteDropIndicators(root);
		if (targetSlot) {
			const rect = targetSlot.getBoundingClientRect();
			const insertAfter = event.clientX >= rect.left + rect.width / 2;
			targetSlot.classList.add(insertAfter ? "drop-after" : "drop-before");
		}
	});

	root.addEventListener("dragenter", (event) => {
		if (isFavDrag(event)) return;
		event.preventDefault();

		const customBtn = closest(event.target, ".nah-action-btn[data-category^='custom-']");
		if (customBtn) {
			customBtn.classList.add("drag-target");
		}
		root.classList.add("drag-hover");
	});

	root.addEventListener("dragleave", (event) => {
		event.preventDefault();
		const related = event.relatedTarget;
		if (!related || !root.contains(related)) {
			clearAllDragState(ActionMenu);
		} else {
			const customBtn = closest(event.target, ".nah-action-btn[data-category^='custom-']");
			if (customBtn && !customBtn.contains(related)) {
				customBtn.classList.remove("drag-target");
			}
		}
	});

	enableLongPressDrag(ActionMenu, root);
}

export function checkEditMode(ActionMenu) {
	if (window.ActionHUD?.isEditMode) {
		ActionMenu.toggleEditMode(true);
	}
}
