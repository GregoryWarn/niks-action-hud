import { captureInputData } from "./capture.js";

export const switchTab = (app, tabName, render = false) => {
	if (!game.user.can("SETTINGS_MODIFY")) {
		ui.notifications.warn(game.i18n.localize("NAH.UI.NoPermission"));
		return;
	}

	app.activeTab = tabName;

	if (!app.element) return;

	const navs = app.element.querySelectorAll(".hud-nav-item");
	navs.forEach((nav) => {
		if (nav.dataset.tab === tabName) nav.classList.add("active");
		else nav.classList.remove("active");
	});

	const contents = app.element.querySelectorAll(".hud-tab-pane");
	contents.forEach((content) => {
		if (content.dataset.tab === tabName) {
			content.classList.add("active");
		} else {
			content.classList.remove("active");
		}
	});

	if (render) {
		app._captureInputData(app.element);
		app.render();
	}
};

export const updateInputIfEmpty = (app, name, value) => {
	const input = app.element?.querySelector(`input[name="${name}"]`);
	if (input && (input.value === "0" || input.value === "")) {
		input.value = value;
	}
};

const serializeTempData = (tempData) =>
	Object.fromEntries(Object.entries(tempData || {}).map(([key, value]) => [key, JSON.stringify(value)]));

export const captureChangeBaseline = (app) => {
	if (!app.element) return;
	captureInputData(app, app.element);
	app.changeBaseline = serializeTempData(app.tempData);
};

export const countUnsavedChanges = (app) => {
	if (!app.changeBaseline) return 0;
	const current = serializeTempData(app.tempData);
	const keys = new Set([...Object.keys(app.changeBaseline), ...Object.keys(current)]);
	return [...keys].filter((key) => app.changeBaseline[key] !== current[key]).length;
};

export const refreshConfigStatus = (app) => {
	const root = app.element;
	if (!root) return;

	root.querySelectorAll("[data-cfg-count]").forEach((counter) => {
		const group = counter.closest(".hud-cfg-group");
		if (!group) return;
		const total = counter.dataset.cfgCount === "checked"
			? group.querySelectorAll(".hud-chip input:checked").length
			: group.querySelectorAll(".hud-cfg-row").length;
		counter.textContent = `· ${total}`;
	});

	const themeName = root.querySelector("[data-active-theme-name]");
	const activeTheme = root.querySelector(".hud-theme-card.active .hud-theme-title");
	if (themeName && activeTheme) themeName.textContent = activeTheme.firstChild?.textContent?.trim() ?? "";

	const summary = root.querySelector(".hud-footer-summary");
	if (!summary) return;
	const changes = countUnsavedChanges(app);
	summary.textContent = changes === 0
		? "No unsaved changes · preview is live"
		: `${changes} unsaved ${changes === 1 ? "change" : "changes"} · preview is live`;
};
