/**
 * Server Handler: Bot Configuration
 * Allows administrator to configure the connection options
 * for Showdown-ChatBot: server, port, serverId and retyConnectionDelay
 */

'use strict';

const Path = require('path');
const check = Tools('check');
const Text = Tools('text');
const Template = Tools('html-template');
const ServerGet = Tools('ps-cross-server');

const ManagerUtils = require(Path.resolve(__dirname, 'manager-utils.js'));

const mainTemplate = new Template(Path.resolve(__dirname, 'templates', 'bot-config.html'));

function getBotStatusData(App, target, config) {
	if (!target.current) {
		return {
			con: '<font color="gray"><strong>OFFLINE PROFILE</strong></font>',
			ctime: 0,
			nick: (config.modules.core.nick || "-"),
			rooms: [],
			battles: [],
		};
	}

	let cTime = 0;
	if (App.bot.status.connected) {
		try {
			const d = new Date(App.bot.conntime);
			cTime = Math.max(1, Math.ceil((Date.now() - d.getTime()) / 1000));
		} catch (ex) {
			App.reportCrash(ex);
		}
	}

	const data = {
		con: '<font color="red"><strong>NOT CONNECTED</strong></font>',
		ctime: cTime,
		nick: (App.bot.getBotNick().substr(1) || "-"),
		rooms: [],
		battles: [],
	};

	if (App.bot.status.connected) {
		data.con = '<font color="green"><strong>CONNECTED</strong></font>';
	} else if (App.bot.connecting) {
		data.con = '<font color="orange"><strong>CONNECTING...</strong></font>';
		data.ctime = 0;
	}

	for (let r in App.bot.rooms) {
		if (App.bot.rooms[r].type === 'chat') {
			data.rooms.push(App.bot.rooms[r].id);
		} else if (App.bot.rooms[r].type === 'battle') {
			data.battles.push(App.bot.rooms[r].id);
		}
	}

	return data;
}

function renderBotPage(App, context, target, config, ok, error) {
	const status = getBotStatusData(App, target, config);
	const htmlVars = Object.create(null);

	htmlVars.connection = '<span id="bot-connection">' + status.con + '</span>';
	htmlVars.conntime = '' + status.ctime;
	htmlVars.nick = Text.escapeHTML(status.nick);
	htmlVars.rooms = Text.escapeHTML(status.rooms.join(', '));
	htmlVars.battles = Text.escapeHTML(status.battles.join(', '));

	htmlVars.server = Text.escapeHTML(config.bot.server);
	htmlVars.port = Text.escapeHTML(config.bot.port);
	htmlVars.secure = (config.bot.secure ? 'checked="checked"' : '');
	htmlVars.serverid = Text.escapeHTML(config.bot.serverid);
	htmlVars.request_result = (ok ? 'ok-msg' : (error ? 'error-msg' : ''));
	htmlVars.request_msg = (ok ? ok : (error || ""));
	htmlVars.base_path = target.current ? '/bot/' : target.botPath;
	htmlVars.restart_button = target.current ? '<p><button onclick="showRestartConfirm();">Restart Bot</button><span id="confirm-restart">&nbsp;</span></p>' : '';
	htmlVars.stop_button = (target.current && App.status !== 'stopped') ? '<p><button onclick="showStopConfirm();">Stop Bot</button><span id="confirm-stop">&nbsp;</span></p>' : '';
	htmlVars.page_note = target.current ? '' : '<p><span class="ok-msg">This bot profile is not running in this process. Changes will apply the next time it starts.</span></p>';

	context.endWithWebPage(mainTemplate.make(htmlVars), {
		title: "Bot Configuration - Showdown ChatBot",
		scripts: ['/static/jquery-3.7.0.min.js']
	});
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

	if (context.get.getbotstatus) {
		return context.endWithText(JSON.stringify(getBotStatusData(App, target, config)));
	}

	if (context.get.server) {
		App.logServerAction(context.user.id, "Tool Server-Get used: " + context.get.server);
		ServerGet.getShowdownServer(context.get.server, (err, data) => {
			let result = '';
			if (err) {
				result = JSON.stringify({
					error: err.message || "Unknown error",
				});
			} else {
				result = JSON.stringify({
					host: data.host,
					port: data.port,
					id: data.id,
					https: !!data.https,
				});
			}
			context.endWithText(result);
		});
		return;
	}

	let ok = null;
	let error = null;

	if (context.post.restart) {
		if (!target.current) {
			error = 'Only the currently running bot can be restarted from this control panel.';
		} else if (App.restartBot()) {
			ok = "The bot was restarted.";
			App.logServerAction(context.user.id, 'Bot Restart');
		} else if (!App.bot.server) {
			error = "The bot could not start because the Server was not defined.";
		} else {
			error = "Could not restart the bot because it was already restarting.";
		}
	} else if (context.post.stop) {
		if (!target.current) {
			error = 'Only the currently running bot can be stopped from this control panel.';
		} else if (App.stopBot()) {
			ok = "The bot process was stopped.";
			App.logServerAction(context.user.id, 'Bot Stop');
		} else {
			error = "The bot was already stopped.";
		}
	} else if (context.post.editbot) {
		const newPort = parseInt(context.post.port);

		try {
			check(!isNaN(newPort), "Invalid Port");
		} catch (err) {
			error = err.message;
		}

		if (!error) {
			config.bot.server = context.post.server || '';
			config.bot.port = context.post.port;
			config.bot.secure = !!context.post.secure;
			config.bot.serverid = context.post.serverid || 'showdown';

			if (target.current) {
				App.bot.server = config.bot.server;
				App.bot.port = config.bot.port;
				App.bot.secure = config.bot.secure;
				App.bot.loginUrl.serverId = config.bot.serverid;
			}

			loaded.save(() => {
				App.logServerAction(context.user.id, 'Edit Bot configuration (' + target.id + ')');
				renderBotPage(
					App,
					context,
					target,
					config,
					target.current ?
						"Bot configuration changed successfully. Restart the bot to make the changes effective." :
						'Bot profile configuration changed successfully.',
					null
				);
			});
			return;
		}
	}

	renderBotPage(App, context, target, config, ok, error);
}

exports.handleManaged = handleManaged;

exports.setup = function (App) {
	App.server.setPermission('bot', 'Permission for changing the bot configuration');
	App.server.setMenuOption('bot', 'Bot&nbsp;Configuration', '/manager/' + ManagerUtils.getCurrentBotId(App) + '/bot/', 'bot', 1);

	App.server.setHandler('bot', (context, parts) => {
		if (!context.user || !context.user.can('bot')) {
			context.endWith403();
			return;
		}

		const target = ManagerUtils.resolveManagedBot(App, ManagerUtils.getCurrentBotId(App));
		handleManaged(App, context, parts, target);
	});
};
