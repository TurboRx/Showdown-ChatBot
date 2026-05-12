/**
 * Server Handler: Bot Login Configuration
 */

'use strict';

const Path = require('path');
const Text = Tools('text');
const check = Tools('check');
const Template = Tools('html-template');

const ManagerUtils = require(Path.resolve(__dirname, '../../../server/handlers/manager-utils.js'));

const mainTemplate = new Template(Path.resolve(__dirname, 'templates', 'login.html'));

function serveLoginConfigPage(App, context, target, config, ok, error) {
	const CoreMod = (target.current && App.modules.core && App.modules.core.system) ? App.modules.core.system : null;
	const htmlVars = Object.create(null);

	htmlVars.nick = Text.escapeHTML(config.modules.core.nick || '-');
	htmlVars.pass = (config.modules.core.pass ? 'Yes' : 'No');
	htmlVars.nick_fail = Text.escapeHTML(context.post.nick || '');
	htmlVars.wrong_password = (CoreMod && CoreMod.wrongPassword) ? "(Wrong password)" : "";
	htmlVars.page_note = target.current ? '' :
		'<p><span class="ok-msg">This bot profile keeps its own login credentials.</span></p>';
	htmlVars.request_result = (ok ? 'ok-msg' : (error ? 'error-msg' : ''));
	htmlVars.request_msg = (ok ? ok : (error || ""));

	context.endWithWebPage(mainTemplate.make(htmlVars), { title: "Bot Login - Showdown ChatBot" });
}

function handleManaged(App, context, parts, target) {
	let loaded;
	try {
		loaded = ManagerUtils.loadManagedConfig(App, target);
	} catch (err) {
		context.endWithError(500, 'Internal Server Error', Text.escapeHTML(err.message));
		return;
	}

	const config = loaded.config;
	let ok = null;
	let error = null;

	if (context.post.setlogin) {
		const nick = context.post.nick || '';
		const pass = context.post.pass || '';
		const pass2 = context.post.passconfirm || '';
		try {
			check(nick.length < 20, "Nick must not be longer than 19 characters");
			check(!nick || (/[a-zA-Z]/).test(nick), "The nick must contain at least one letter");
			check(pass === pass2, "The passwords do not match");
		} catch (err) {
			error = err.message;
		}
		if (!error) {
			config.modules.core.nick = nick;
			config.modules.core.pass = pass;

			if (target.current && App.bot.isConnected()) {
				loaded.save(() => {
					App.logServerAction(context.user.id, 'Edit Bot Login details (' + target.id + ')');
					App.bot.rename(nick, pass, (success, err) => {
						if (success) {
							serveLoginConfigPage(App, context, target, config, "Bot login details have been set successfully", null);
						} else {
							serveLoginConfigPage(App, context, target, config, null, "Bot login details seem incorrect: " + Text.escapeHTML(err));
						}
					});
				});
				return;
			}

			loaded.save(() => {
				App.logServerAction(context.user.id, 'Edit Bot Login details (' + target.id + ')');
				serveLoginConfigPage(
					App,
					context,
					target,
					config,
					target.current ?
						"Bot login details have been set successfully. Restart the bot to make them effective." :
						"Bot login details have been set successfully for this bot profile.",
					null
				);
			});
			return;
		}
	}

	serveLoginConfigPage(App, context, target, config, ok, error);
}

exports.handleManaged = handleManaged;

exports.setup = function (App) {
	App.server.setMenuOption('botlogin', 'Bot&nbsp;Login', '/manager/' + ManagerUtils.getCurrentBotId(App) + '/login/', 'core', 1);

	App.server.setHandler('botlogin', (context, parts) => {
		if (!context.user || !context.user.can('core')) {
			context.endWith403();
			return;
		}

		handleManaged(App, context, parts, ManagerUtils.resolveManagedBot(App, ManagerUtils.getCurrentBotId(App)));
	});
};
