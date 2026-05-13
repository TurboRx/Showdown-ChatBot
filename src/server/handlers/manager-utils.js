'use strict';

const Path = require('path');
const FileSystem = require('fs');

const checkDir = Tools('checkdir');
const Text = Tools('text');
const CryptoDataBase = Tools('crypto-json');

const MAIN_BOT_ID = 'main';
const DEFAULT_LOGIN_SERVER = 'play.pokemonshowdown.com';
const DEFAULT_SERVER_PORT = 8080;

function createNullObject() {
	return Object.create(null);
}

function ensureObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return createNullObject();
	}
	return value;
}

function getInstancesDir(App) {
	return Path.resolve(App.appDir, 'instances');
}

function getCurrentRootDir(App) {
	return Path.resolve(App.confDir, '..');
}

function getCurrentBotId(App) {
	const currentRoot = getCurrentRootDir(App);
	if (currentRoot === App.appDir) {
		return MAIN_BOT_ID;
	}

	const rel = Path.relative(getInstancesDir(App), currentRoot);
	if (!rel || rel.startsWith('..') || Path.isAbsolute(rel) || rel.includes(Path.sep)) {
		return MAIN_BOT_ID;
	}

	return rel;
}

function getBotRootDir(App, botId) {
	if (botId === MAIN_BOT_ID) {
		return App.appDir;
	}
	return Path.resolve(getInstancesDir(App), botId);
}

function sanitizeBotId(botId) {
	return Text.toAddOnId(botId || '').slice(0, 32);
}

function ensureConfigDefaults(config) {
	config = ensureObject(config);
	config.modules = ensureObject(config.modules);
	config.modules.core = ensureObject(config.modules.core);

	if (!('nick' in config.modules.core)) config.modules.core.nick = '';
	if (!('pass' in config.modules.core)) config.modules.core.pass = '';
	if (!('avatar' in config.modules.core)) config.modules.core.avatar = '';
	if (!('status' in config.modules.core)) config.modules.core.status = '';
	if (!(config.modules.core.rooms instanceof Array)) config.modules.core.rooms = [];
	if (!(config.modules.core.privaterooms instanceof Array)) config.modules.core.privaterooms = [];
	if (!('joinall' in config.modules.core)) config.modules.core.joinall = false;
	if (!('joinofficial' in config.modules.core)) config.modules.core.joinofficial = false;
	if (!('idlePrevent' in config.modules.core)) config.modules.core.idlePrevent = false;

	config.bot = ensureObject(config.bot);
	if (!('server' in config.bot)) config.bot.server = '';
	if (!('port' in config.bot)) config.bot.port = '443';
	if (!('secure' in config.bot)) config.bot.secure = true;
	if (!('loginserv' in config.bot)) config.bot.loginserv = DEFAULT_LOGIN_SERVER;
	if (!('serverid' in config.bot)) config.bot.serverid = 'showdown';
	if (!('retrydelay' in config.bot)) config.bot.retrydelay = (5 * 1000);
	if (!('msgQueueMaxLength' in config.bot)) config.bot.msgQueueMaxLength = 120;
	if (!('accountType' in config.bot)) config.bot.accountType = 'regular';
	if (!('safetyThrottleExtraDelay' in config.bot)) config.bot.safetyThrottleExtraDelay = 50;

	config.server = ensureObject(config.server);
	if (!('bindaddress' in config.server)) config.server.bindaddress = '';
	if (!('port' in config.server)) config.server.port = DEFAULT_SERVER_PORT;
	if (!('https' in config.server)) config.server.https = false;
	if (!('httpsPort' in config.server)) config.server.httpsPort = 5000;
	if (!('sslcert' in config.server)) config.server.sslcert = '';
	if (!('sslkey' in config.server)) config.server.sslkey = '';

	config.loadmodules = ensureObject(config.loadmodules);
	config.menuOrder = ensureObject(config.menuOrder);
	config.langfilter = ensureObject(config.langfilter);

	config.language = ensureObject(config.language);
	if (!('default' in config.language)) config.language.default = 'english';
	config.language.rooms = ensureObject(config.language.rooms);

	config.parser = ensureObject(config.parser);
	if (!(config.parser.tokens instanceof Array)) config.parser.tokens = ['.'];
	if (!(config.parser.groups instanceof Array)) config.parser.groups = ['+', '%', '@', '*', '#', '~'];
	if (!('admin' in config.parser)) config.parser.admin = '~';
	if (!('owner' in config.parser)) config.parser.owner = '#';
	if (!('bot' in config.parser)) config.parser.bot = '*';
	if (!('mod' in config.parser)) config.parser.mod = '@';
	if (!('driver' in config.parser)) config.parser.driver = '%';
	if (!('voice' in config.parser)) config.parser.voice = '+';

	if (!(config.cmdtokens instanceof Array)) config.cmdtokens = [];
	if (config.logMaxOld === undefined) config.logMaxOld = 0;

	return config;
}

function makeDefaultConfig(loginData) {
	const config = createNullObject();
	ensureConfigDefaults(config);
	config.modules.core.nick = loginData.nick || '';
	config.modules.core.pass = loginData.pass || '';
	return config;
}

function getTargetConfigFiles(target) {
	return {
		keyFile: Path.resolve(target.confDir, 'config.key'),
		configFile: Path.resolve(target.confDir, 'config.crypto'),
	};
}

function resolveManagedBot(App, botId) {
	botId = sanitizeBotId(botId);
	if (!botId) return null;

	const currentBotId = getCurrentBotId(App);
	const rootDir = getBotRootDir(App, botId);
	if (botId !== MAIN_BOT_ID && !FileSystem.existsSync(rootDir)) {
		return null;
	}

	return {
		id: botId,
		current: (botId === currentBotId),
		rootDir: rootDir,
		confDir: Path.resolve(rootDir, 'config'),
		dataDir: Path.resolve(rootDir, 'data'),
		logsDir: Path.resolve(rootDir, 'logs'),
		addonsDir: Path.resolve(rootDir, 'config', 'add-ons'),
		basePath: '/manager/' + botId + '/',
		botPath: '/manager/' + botId + '/bot/',
		loginPath: '/manager/' + botId + '/login/',
		addonsPath: '/manager/' + botId + '/addons/',
	};
}

function listBots(App) {
	const bots = [];
	const currentBotId = getCurrentBotId(App);

	bots.push({
		id: MAIN_BOT_ID,
		current: currentBotId === MAIN_BOT_ID,
		paths: resolveManagedBot(App, MAIN_BOT_ID),
	});

	const instancesDir = getInstancesDir(App);
	if (FileSystem.existsSync(instancesDir)) {
		const files = FileSystem.readdirSync(instancesDir);
		files.sort((a, b) => a.localeCompare(b));
		for (let file of files) {
			const absPath = Path.resolve(instancesDir, file);
			if (!FileSystem.statSync(absPath).isDirectory()) continue;
			const id = sanitizeBotId(file);
			if (!id || id === MAIN_BOT_ID) continue;
			bots.push({
				id: id,
				current: currentBotId === id,
				paths: resolveManagedBot(App, id),
			});
		}
	}

	return bots;
}

function loadManagedConfig(App, target) {
	if (target.current) {
		return {
			config: ensureConfigDefaults(App.config),
			save(callback) {
				App.saveConfig(callback);
			},
		};
	}

	checkDir(target.confDir);
	const files = getTargetConfigFiles(target);
	let key = '';

	if (FileSystem.existsSync(files.keyFile)) {
		key = FileSystem.readFileSync(files.keyFile).toString();
	} else if (FileSystem.existsSync(files.configFile)) {
		throw new Error('Missing config.key for bot "' + target.id + '"');
	} else {
		key = Text.randomToken(20);
		FileSystem.writeFileSync(files.keyFile, key);
	}

	const db = new CryptoDataBase(files.configFile, key);
	ensureConfigDefaults(db.data);

	return {
		config: db.data,
		save(callback) {
			db.write(callback);
		},
	};
}

function createManagedBot(App, botId) {
	botId = sanitizeBotId(botId);
	if (!botId || botId === MAIN_BOT_ID) {
		throw new Error('Invalid bot id');
	}

	if (resolveManagedBot(App, botId)) {
		throw new Error('Bot "' + botId + '" already exists');
	}

	const instancesDir = getInstancesDir(App);
	checkDir(instancesDir);

	const rootDir = getBotRootDir(App, botId);
	const confDir = Path.resolve(rootDir, 'config');
	const dataDir = Path.resolve(rootDir, 'data');
	const logsDir = Path.resolve(rootDir, 'logs');
	const addonsDir = Path.resolve(confDir, 'add-ons');

	checkDir(rootDir);
	checkDir(confDir);
	checkDir(dataDir);
	checkDir(logsDir);
	checkDir(addonsDir);

	const loginData = ensureConfigDefaults(App.config).modules.core || createNullObject();
	const config = makeDefaultConfig({
		nick: loginData.nick,
		pass: loginData.pass,
	});
	const keyFile = Path.resolve(confDir, 'config.key');
	const configFile = Path.resolve(confDir, 'config.crypto');
	const key = Text.randomToken(20);

	FileSystem.writeFileSync(keyFile, key);
	const db = new CryptoDataBase(configFile, key);
	db.set(config);

	return new Promise((resolve, reject) => {
		db.write(err => {
			if (err) {
				reject(err);
				return;
			}

			resolve(botId);
		});
	});
}

function validateAddonFile(file) {
	return /^add-ons\/[A-Za-z0-9_-]+\.js$/.test(file || '');
}

function addonAbsPath(target, file) {
	if (!validateAddonFile(file)) {
		throw new Error('Invalid add-on');
	}

	const absPath = Path.resolve(target.confDir, file);
	const relPath = Path.relative(target.addonsDir, absPath);
	if (relPath.startsWith('..') || Path.isAbsolute(relPath)) {
		throw new Error('Invalid add-on');
	}
	return absPath;
}

function listManagedAddons(target) {
	checkDir(target.addonsDir);
	const files = FileSystem.readdirSync(target.addonsDir);
	return files.filter(file => {
		const absPath = Path.resolve(target.addonsDir, file);
		return file.endsWith('.js') && FileSystem.statSync(absPath).isFile();
	}).sort((a, b) => a.localeCompare(b)).map(file => 'add-ons/' + file);
}

function getManagedAddonContent(target, file) {
	return FileSystem.readFileSync(addonAbsPath(target, file)).toString();
}

function setManagedAddonContent(target, file, content) {
	checkDir(target.addonsDir);
	FileSystem.writeFileSync(addonAbsPath(target, file), content);
}

function removeManagedAddon(target, file) {
	const absPath = addonAbsPath(target, file);
	if (FileSystem.existsSync(absPath)) {
		FileSystem.unlinkSync(absPath);
	}
}

exports.MAIN_BOT_ID = MAIN_BOT_ID;
exports.sanitizeBotId = sanitizeBotId;
exports.getCurrentBotId = getCurrentBotId;
exports.getInstancesDir = getInstancesDir;
exports.resolveManagedBot = resolveManagedBot;
exports.listBots = listBots;
exports.ensureConfigDefaults = ensureConfigDefaults;
exports.loadManagedConfig = loadManagedConfig;
exports.createManagedBot = createManagedBot;
exports.listManagedAddons = listManagedAddons;
exports.getManagedAddonContent = getManagedAddonContent;
exports.setManagedAddonContent = setManagedAddonContent;
exports.removeManagedAddon = removeManagedAddon;
