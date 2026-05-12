/**
 * Server Handler: Add-Ons
 * This handler allows administrators to install,
 * edit and uninstall add-ons for Showdown-ChatBot
 */

'use strict';

const Path = require('path');
const Text = Tools('text');
const check = Tools('check');
const Template = Tools('html-template');
const CodeMirrorBundle = require("@asanrom/showdown-chatbot-codemirror");

const ManagerUtils = require(Path.resolve(__dirname, 'manager-utils.js'));

const listTemplate = new Template(Path.resolve(__dirname, 'templates', 'addons-list.html'));
const addonItemTemplate = new Template(Path.resolve(__dirname, 'templates', 'addons-item.html'));
const addingTemplate = new Template(Path.resolve(__dirname, 'templates', 'addons-new.html'));
const editTemplate = new Template(Path.resolve(__dirname, 'templates', 'addons-edit.html'));

function getAddonsMap(App, target) {
	if (target.current) {
		return App.addons;
	}

	const addons = Object.create(null);
	for (let file of ManagerUtils.listManagedAddons(target)) {
		addons[file] = { desc: '' };
	}
	return addons;
}

function renderAddonsList(App, context, target, ok, error) {
	const addons = getAddonsMap(App, target);
	const htmlVars = Object.create(null);
	htmlVars.addons_list = '';
	htmlVars.base_url = target.current ? '/addons/' : target.addonsPath;
	htmlVars.page_note = target.current ? '' :
		'<p><span class="ok-msg">These add-ons belong only to bot "' + Text.escapeHTML(target.id) + '".</span></p>';

	for (let file in addons) {
		htmlVars.addons_list += addonItemTemplate.make({
			file: Text.escapeHTML(file),
			desc: (addons[file].desc ? ('<p>' + Text.escapeHTML(addons[file].desc) + '</p>') : ""),
			base_url: htmlVars.base_url,
		});
	}

	htmlVars.request_result = (ok ? 'ok-msg' : (error ? 'error-msg' : ''));
	htmlVars.request_msg = (ok ? ok : (error || ""));

	context.endWithWebPage(listTemplate.make(htmlVars), { title: "Add-ons - Showdown ChatBot" });
}

function newAddonHandler(App, context, target) {
	let ok = null;
	let error = null;

	if (context.post.add) {
		const addonId = Text.toAddOnId(context.post.addon);
		const file = 'add-ons/' + addonId + '.js';
		const content = (context.post.content || "").trim();
		const addons = getAddonsMap(App, target);

		try {
			check(addonId, "You must specify an addon filename");
			check(addonId.length <= 20, "Addon filename is too long");
			check(content, "Addon content cannot be blank");
			check(!addons[file], "Addon " + Text.escapeHTML(file) + " already exists");
		} catch (err) {
			error = err.message;
		}

		if (!App.jsInject) {
			error = "[Javascript injection is disabled]";
		}

		if (!error) {
			if (target.current) {
				App.dam.setFileContent(file, content);
				if (!App.installAddon(file)) {
					error = "Failed to install the add-on";
				}
			} else {
				ManagerUtils.setManagedAddonContent(target, file, content);
			}

			if (!error) {
				App.logServerAction(context.user.id, `Add-on installed for ${target.id}: ${file}`);
				context.response.writeHead(302, { 'Location': target.addonsPath });
				context.response.end();
				return;
			}
		}
	}

	context.endWithWebPage(addingTemplate.make({
		content: Text.escapeHTML(context.post.content || ''),
		base_url: target.current ? '/addons/' : target.addonsPath,
		request_result: (ok ? 'ok-msg' : (error ? 'error-msg' : '')),
		request_msg: (ok ? ok : (error || "")),
	}), {
		title: "New Add-on - Showdown ChatBot",
		styles: ["/static/addons.css"],
	});
}

function editAddonHandler(App, context, parts, target) {
	const file = parts[2];
	if (!file) {
		return context.endWith404();
	}

	const addon = 'add-ons/' + file;
	let addonContent = '';

	try {
		addonContent = target.current ? App.dam.getFileContent(addon) : ManagerUtils.getManagedAddonContent(target, addon);
	} catch (err) {
		return context.endWith404();
	}

	let ok = null;
	let error = null;

	if (context.post.edit) {
		const content = (context.post.content || "").trim();

		try {
			check(content, "Addon content cannot be blank");
			check(getAddonsMap(App, target)[addon], "Addon " + Text.escapeHTML(addon) + " not found");
		} catch (err) {
			error = err.message;
		}

		if (!App.jsInject) {
			error = "[Javascript injection is disabled]";
		}

		if (!error) {
			if (target.current) {
				App.removeAddon(addon);
				App.dam.setFileContent(addon, content);
				if (!App.installAddon(addon)) {
					error = "Failed to re-install the add-on";
				}
			} else {
				ManagerUtils.setManagedAddonContent(target, addon, content);
			}

			if (!error) {
				addonContent = content;
				App.logServerAction(context.user.id, `Add-on updated for ${target.id}: ${addon}`);
				ok = target.current ? "Add-on re-installed successfully" : "Add-on saved successfully";
			}
		}
	}

	context.endWithWebPage(editTemplate.make({
		content: Text.escapeHTML(addonContent),
		file: Text.escapeHTML(addon),
		base_url: target.current ? '/addons/' : target.addonsPath,
		request_result: (ok ? 'ok-msg' : (error ? 'error-msg' : '')),
		request_msg: (ok ? ok : (error || "")),
	}), {
		title: "Add-ons - Showdown ChatBot",
		styles: ["/static/addons.css"],
	});
}

function handleManaged(App, context, parts, target) {
	if (parts[0] === 'new') {
		return newAddonHandler(App, context, target);
	} else if (parts[0] === 'edit') {
		return editAddonHandler(App, context, parts, target);
	} else if (parts[0] === 'code-mirror.js') {
		return context.endWithStaticFile(CodeMirrorBundle.getBundlePath(), 31536000);
	}

	let ok = null;
	let error = null;
	if (context.post.remove) {
		const addon = context.post.addon;
		if (addon && getAddonsMap(App, target)[addon]) {
			if (target.current) {
				App.removeAddon(addon);
				try {
					App.dam.removeFile(addon);
				} catch (err) {
					App.reportCrash(err);
				}
			} else {
				ManagerUtils.removeManagedAddon(target, addon);
			}
			App.logServerAction(context.user.id, `Add-on deleted for ${target.id}: ${addon}`);
			ok = "Addon " + Text.escapeHTML(addon) + " deleted successfully";
		} else {
			error = "Invalid add-on";
		}
	}

	renderAddonsList(App, context, target, ok, error);
}

exports.handleManaged = handleManaged;

exports.setup = function (App) {
	if (App.env.staticmode) return;

	App.server.setMenuOption('addons', 'Add-ons', '/manager/' + ManagerUtils.getCurrentBotId(App) + '/addons/', 'root', 2);

	App.server.setHandler('addons', (context, parts) => {
		if (!context.user || !context.user.can('root')) {
			context.endWith403();
			return;
		}

		handleManaged(App, context, parts, ManagerUtils.resolveManagedBot(App, ManagerUtils.getCurrentBotId(App)));
	});
};
