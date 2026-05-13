'use strict';

const Path = require('path');
const Text = Tools('text');
const Template = Tools('html-template');

const managerTemplate = new Template(Path.resolve(__dirname, 'templates', 'manager-list.html'));

const BotHandler = require(Path.resolve(__dirname, 'bot.js'));
const AddonsHandler = require(Path.resolve(__dirname, 'addons.js'));
const LoginHandler = require(Path.resolve(__dirname, '../../bot-modules/core/handlers/login.js'));
const ManagerUtils = require(Path.resolve(__dirname, 'manager-utils.js'));

exports.setup = function (App) {
	App.server.setMenuOption('manager', 'Bot&nbsp;Manager', '/manager/', 'root', 2);

	App.server.setHandler('manager', (context, parts) => {
		if (!parts[0]) {
			if (!context.user || !context.user.can('root')) {
				context.endWith403();
				return;
			}
			return handleManagerList(context);
		}

		const target = ManagerUtils.resolveManagedBot(App, parts.shift());
		if (!target) {
			context.endWith404();
			return;
		}

		if (!parts[0]) {
			context.response.writeHead(302, { Location: target.botPath });
			context.response.end();
			return;
		}

		switch (parts.shift()) {
			case 'bot':
				if (!context.user || !context.user.can('bot')) {
					context.endWith403();
					return;
				}
				return BotHandler.handleManaged(App, context, parts, target);
			case 'login':
				if (!context.user || !context.user.can('core')) {
					context.endWith403();
					return;
				}
				return LoginHandler.handleManaged(App, context, parts, target);
			case 'addons':
				if (!context.user || !context.user.can('root')) {
					context.endWith403();
					return;
				}
				return AddonsHandler.handleManaged(App, context, parts, target);
			default:
				context.endWith404();
		}
	});

	function handleManagerList(context) {
		if (context.post.createbot) {
			return ManagerUtils.createManagedBot(App, context.post.botid || '').then(createdBotId => {
				App.logServerAction(context.user.id, 'Created bot profile: ' + createdBotId);
				renderManagerList(context, 'Bot "' + Text.escapeHTML(createdBotId) + '" created successfully.', null, '');
			}).catch(err => {
				renderManagerList(context, null, err.message, context.post.botid || '');
			});
		}

		return renderManagerList(context, null, null, context.post.botid || '');
	}

	function renderManagerList(context, ok, error, botId) {
		let botsHtml = '';
		for (let bot of ManagerUtils.listBots(App)) {
			const currentTag = bot.current ? '&nbsp;<span class="ok-msg">(current)</span>' : '';
			botsHtml += '<div>';
			botsHtml += '<p><strong>' + Text.escapeHTML(bot.id) + '</strong>' + currentTag + '</p>';
			botsHtml += '<p><a href="' + bot.paths.botPath + '"><button>Bot Configuration</button></a>&nbsp;';
			botsHtml += '<a href="' + bot.paths.loginPath + '"><button>Bot Login</button></a>&nbsp;';
			botsHtml += '<a href="' + bot.paths.addonsPath + '"><button>Add-ons</button></a></p>';
			botsHtml += '</div><hr />';
		}

		context.endWithWebPage(managerTemplate.make({
			botid: Text.escapeHTML(botId),
			bots: botsHtml || '<p>No bots found.</p>',
			request_result: (ok ? 'ok-msg' : (error ? 'error-msg' : '')),
			request_msg: (ok ? ok : (error || '')),
		}), { title: 'Bot Manager - Showdown ChatBot' });
	}
};
