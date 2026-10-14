/**
 * Event listeners and DOM bindings for Nik's Action HUD Configuration.
 * Exclusively designed for Foundry V14.
 */

import { switchTab, refreshConfigStatus } from "./helpers.js";
import { captureInputData } from "./capture.js";
import { triggerPreview } from "./preview.js";
import { onSave } from "./handlers.js";
import { cycleSettingLock, canManageLocks } from "./settings-locks.js";

export const bindNavigationListeners = (app) => {
	const root = app.element;
	if (!root) return;

	root.querySelectorAll(".hud-nav-item").forEach((item) => {
		item.addEventListener("click", (e) => {
			e.preventDefault();
			const tab = item.dataset.tab;
			if (tab) switchTab(app, tab, false);
		});
	});
};

export const bindInputLiveListeners = (app) => {
	const root = app.element;
	if (!root) return;

	// Real-time Range Sliders
	root.querySelectorAll('input[type="range"]').forEach((slider) => {
		const updateDisplay = () => {
			const display = slider.parentElement?.querySelector(".hud-range-value");
			if (display) {
				const unit = slider.dataset.unit || "x";
				display.textContent = `${Number(slider.value).toFixed(2)}${unit}`;
			}
		};

		slider.addEventListener("input", () => {
			updateDisplay();
			captureInputData(app, root);
			triggerPreview(app);
		});
		updateDisplay();
	});

	// Selects, Number inputs, and Color Inputs
	root.querySelectorAll("select, input[type='number'], input.hud-color-input").forEach((el) => {
		el.addEventListener("input", () => {
			captureInputData(app, root);
			triggerPreview(app);
		});
		el.addEventListener("change", () => {
			captureInputData(app, root);
			triggerPreview(app);
		});
	});

	// Toggle switches
	root.querySelectorAll(".hud-switch-input").forEach((toggle) => {
		toggle.addEventListener("change", () => {
			captureInputData(app, root);
			triggerPreview(app);
		});
	});

	root.querySelectorAll('.hud-chip input[type="checkbox"]').forEach((checkbox) => {
		checkbox.addEventListener("change", () => {
			checkbox.closest(".hud-chip")?.classList.toggle("active", checkbox.checked);
			captureInputData(app, root);
			triggerPreview(app);
		});
	});

	// Keybinding: Ctrl+S / Cmd+S to save
	root.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === "s") {
			e.preventDefault();
			onSave(app, e, root.querySelector('[data-action="save"]'));
		}
	});
};

export const bindFilePickers = (app) => {
	const root = app.element;
	if (!root) return;

	root.querySelectorAll("[data-file-picker]").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			const targetName = btn.dataset.filePicker;
			const targetInput = root.querySelector(`input[name="${targetName}"]`);
			if (!targetInput) return;

			const current = targetInput.value;
			const fp = new foundry.applications.apps.FilePicker.implementation({
				type: btn.dataset.type || "image",
				current: current,
				callback: (path) => {
					targetInput.value = path;
					targetInput.dispatchEvent(new Event("change", { bubbles: true }));
				},
			});
			fp.render(true);
		});
	});
};

export const bindDragDrop = (app) => {
	const root = app.element;
	if (!root) return;

	const container = root.querySelector(".hud-categories-list");
	if (!container) return;

	let draggedCard = null;

	container.querySelectorAll(".hud-category-card[draggable='true']").forEach((card) => {
		card.addEventListener("dragstart", (e) => {
			draggedCard = card;
			card.classList.add("dragging");
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", card.dataset.catIndex || "");
		});

		card.addEventListener("dragend", () => {
			if (draggedCard) draggedCard.classList.remove("dragging");
			draggedCard = null;
			container.querySelectorAll(".hud-category-card").forEach((c) => c.classList.remove("drag-over"));
		});

		card.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			card.classList.add("drag-over");
		});

		card.addEventListener("dragleave", () => {
			card.classList.remove("drag-over");
		});

		card.addEventListener("drop", async (e) => {
			e.preventDefault();
			card.classList.remove("drag-over");

			if (!draggedCard || draggedCard === card) return;

			const fromIndex = Number(draggedCard.dataset.catIndex);
			const toIndex = Number(card.dataset.catIndex);

			if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;

			captureInputData(app, root);
			const list = app.tempData.customMenu;
			if (Array.isArray(list) && list[fromIndex] && list[toIndex]) {
				const item = list.splice(fromIndex, 1)[0];
				list.splice(toIndex, 0, item);
				await app.render();
			}
		});
	});
};

/**
 * Bind click and contextmenu listeners for setting lock icons (niks-settings-locks).
 * @param {Application} app
 */
export const bindSettingsLocksListeners = (app) => {
	const root = app.element;
	if (!root || !canManageLocks()) return;

	root.querySelectorAll(".hud-lock-icon[data-setting-key]").forEach((icon) => {
		const settingKey = icon.dataset.settingKey;
		if (!settingKey) return;

		const updateIconDom = (lock) => {
			icon.classList.remove("none", "unlocked", "soft", "hard");
			const i = icon.querySelector("i");
			const row = icon.closest(".hud-cfg-row");

			if (!lock) {
				icon.classList.add("unlocked");
				if (i) i.className = "fa-solid fa-lock-open";
				icon.title = game.i18n.localize("NSL.Tooltip.Unlocked") || "Unlocked — Click to soft-lock, right-click to hard-lock.";
				row?.classList.remove("hard-locked");
			} else if (lock.type === "soft") {
				icon.classList.add("soft");
				if (i) i.className = "fa-solid fa-lock";
				icon.title = game.i18n.localize("NSL.Tooltip.Soft") || "Soft Locked — Applied once, players can override. Click for hard lock.";
				row?.classList.remove("hard-locked");
			} else if (lock.type === "hard") {
				icon.classList.add("hard");
				if (i) i.className = "fa-solid fa-lock";
				icon.title = game.i18n.localize("NSL.Tooltip.Hard") || "Hard Locked — Enforced for all players. Click to unlock.";
				row?.classList.add("hard-locked");
			}
		};

		// Left click: cycle forward
		icon.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const newLock = await cycleSettingLock(settingKey, "forward");
			updateIconDom(newLock);
		});

		// Right click: cycle backward
		icon.addEventListener("contextmenu", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const newLock = await cycleSettingLock(settingKey, "backward");
			updateIconDom(newLock);
		});
	});
};

export const bindUnsavedChangesTracking = (app) => {
	const root = app.element;
	if (!root) return;

	const refresh = () => refreshConfigStatus(app);
	root.addEventListener("input", refresh);
	root.addEventListener("change", refresh);
	root.addEventListener("click", refresh);
};

