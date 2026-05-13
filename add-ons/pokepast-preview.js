// PokePaste Preview add-on for Showdown ChatBot
// Install as an Add-on
// ----------------------
// Configuration constants:
// - Enabled_Rooms: List of room IDs where the feature is enabled. Empty = all rooms.
// - Cooldown_Ms: Anti-spam cooldown for the same PokePaste in the same room.
// - Cache_TTL_Ms: How long to cache fetched PokePaste responses.
// - Show_Notes: Whether to include notes in the preview.

'use strict';

const HTTPS = require('https');
const Text = Tools('text');

const Enabled_Rooms = [];
const Cooldown_Ms = 30 * 1000;
const Cache_TTL_Ms = 5 * 60 * 1000;
const Show_Notes = true;

const Max_Paste_Chars = 40 * 1000;
const Max_Title_Chars = 120;
const Max_Author_Chars = 80;
const Max_Notes_Chars = 400;
const Max_Plain_Text_Chars = 300;

const PokePaste_Link_Regex = /https:\/\/pokepast\.es\/([a-f0-9]{6,32})(?:\/(?:raw|json))?/ig;

function isEnabledRoom(room) {
	if (!Enabled_Rooms.length) return true;
	return Enabled_Rooms.includes(Text.toId(room));
}

function getTeamTools(App) {
	if (!App.modules || !App.modules.battle || !App.modules.battle.system) return null;
	if (!App.modules.battle.system.TeamBuilder || !App.modules.battle.system.TeamBuilder.tools) return null;
	return App.modules.battle.system.TeamBuilder.tools;
}

function getPokePasteId(message) {
	if (!message) return null;
	PokePaste_Link_Regex.lastIndex = 0;
	const match = PokePaste_Link_Regex.exec(message);
	if (!match) return null;
	return (match[1] + "").toLowerCase();
}

function toLimitedText(value, maxLength) {
	let text = value;
	if (typeof text !== 'string') text = '';
	if (text.length <= maxLength) return text;
	return text.substr(0, maxLength) + '...';
}

function requestText(url, callback) {
	HTTPS.get(url, response => {
		let data = '';
		response.on('data', chunk => {
			data += chunk;
			if (data.length > Max_Paste_Chars + 2000) {
				response.destroy(new Error("Response too large"));
			}
		});
		response.on('end', () => {
			if (response.statusCode !== 200) {
				if (response.statusCode === 404) {
					return callback(null, new Error("404 - Not found"));
				}
				return callback(null, new Error("" + response.statusCode));
			}
			if (data.length > Max_Paste_Chars) {
				return callback(null, new Error("Paste exceeds the maximum supported length"));
			}
			return callback(data);
		});
		response.on('error', err => {
			callback(null, err);
		});
	}).on('error', err => {
		callback(null, err);
	});
}

function fetchPokePasteJSON(id, callback) {
	requestText("https://pokepast.es/" + encodeURIComponent(id) + "/json", (data, err) => {
		if (err) return callback(null, err);
		let parsed;
		try {
			parsed = JSON.parse(data);
		} catch (ex) {
			return callback(null, new Error("Malformed JSON response"));
		}

		if (!parsed || typeof parsed !== 'object') {
			return callback(null, new Error("Malformed JSON response"));
		}

		if (typeof parsed.paste !== 'string' || !parsed.paste.trim()) {
			return callback(null, new Error("Missing team data in JSON response"));
		}

		return callback({
			paste: parsed.paste,
			title: toLimitedText(parsed.title || "", Max_Title_Chars),
			author: toLimitedText(parsed.author || "", Max_Author_Chars),
			notes: toLimitedText(parsed.notes || "", Max_Notes_Chars),
			link: "https://pokepast.es/" + id,
		});
	});
}

function fetchPokePasteRaw(id, callback) {
	requestText("https://pokepast.es/" + encodeURIComponent(id) + "/raw", (data, err) => {
		if (err) return callback(null, err);
		if (!data || !data.trim()) {
			return callback(null, new Error("Empty raw response"));
		}
		return callback({
			paste: data,
			title: '',
			author: '',
			notes: '',
			link: "https://pokepast.es/" + id,
		});
	});
}

function fetchPokePaste(id, callback) {
	fetchPokePasteJSON(id, (jsonData, jsonErr) => {
		if (!jsonErr && jsonData) {
			return callback(jsonData);
		}
		fetchPokePasteRaw(id, (rawData, rawErr) => {
			if (rawErr) {
				return callback(null, new Error("Failed to fetch Pokepaste: " + (jsonErr ? jsonErr.message : rawErr.message)));
			}
			return callback(rawData);
		});
	});
}

function buildTeamPreview(App, pasteText) {
	const Teams = getTeamTools(App);
	if (!Teams) return null;

	let packed = '';

	try {
		const jsonTeam = Teams.teamToJSON(pasteText);
		if (!Array.isArray(jsonTeam) || !jsonTeam.length) {
			return null;
		}
		packed = Teams.packTeam(jsonTeam);
	} catch (ex) {
		return null;
	}

	if (!packed) return null;

	let exported = '';
	let icons = '';
	try {
		exported = Teams.exportTeam(packed);
		icons = Teams.teamOverviewShowdownHTML(packed);
	} catch (ex) {
		return null;
	}

	if (!exported || !exported.trim() || !icons || !icons.trim()) {
		return null;
	}

	return {
		exportedTeam: exported,
		icons: icons,
	};
}

function getSafeTeamName(pasteData, teamPreview) {
	if (pasteData.title) return pasteData.title;
	if (!teamPreview || !teamPreview.exportedTeam) return "Pokepast Team";
	const firstLine = (teamPreview.exportedTeam.split('\n')[0] || '').trim();
	if (!firstLine) return "Pokepast Team";
	return toLimitedText(firstLine, Max_Title_Chars);
}

function buildHtml(byName, pasteData, teamPreview) {
	if (!teamPreview) return '';

	const safeBy = Text.escapeHTML(byName);
	const safeTitle = Text.escapeHTML(getSafeTeamName(pasteData, teamPreview));
	const safeAuthor = Text.escapeHTML(pasteData.author || "Unknown");
	const safeLink = Text.escapeHTML(pasteData.link);
	const escapedExport = Text.escapeHTML(teamPreview.exportedTeam).replace(/\n/g, "<br>");

	let html = '';
	html += '<div style="margin:4px 0;padding:8px 10px;background:#1e2b4f;border:1px solid #4f7bcf;border-radius:6px;">';
	html += '<p style="margin:0 0 6px 0;"><b>Team from ' + safeBy + '</b> (Author: ' + safeAuthor + ')</p>';
	html += '<p style="margin:0 0 6px 0;"><a href="' + safeLink + '" target="_blank"><b>' + safeTitle + '</b></a></p>';
	html += '<div style="padding:6px;border:1px solid #5f80c8;border-radius:4px;background:#23345e;">' + teamPreview.icons + '</div>';
	html += '<details style="margin-top:6px;"><summary>(Click to export)</summary><pre style="margin-top:4px;">' + escapedExport + '</pre></details>';
	if (Show_Notes && pasteData.notes) {
		html += '<p style="margin:6px 0 0 0;"><b>Notes:</b> ' + Text.escapeHTML(pasteData.notes) + '</p>';
	}
	html += '</div>';
	return html;
}

function buildPlainText(byName, pasteData) {
	const title = getSafeTeamName(pasteData, null);
	const author = pasteData.author || "Unknown";
	const txt = "PokePaste from " + byName + ": " + title + " (Author: " + author + ") - " + pasteData.link;
	return Text.stripCommands(toLimitedText(txt, Max_Plain_Text_Chars));
}

exports.setup = function (App) {
	const roomCooldowns = new Map();
	const cache = new Map();

	function getCached(id) {
		const entry = cache.get(id);
		if (!entry) return null;
		if (entry.expires < Date.now()) {
			cache.delete(id);
			return null;
		}
		return entry.data;
	}

	function setCache(id, data) {
		cache.set(id, {
			expires: Date.now() + Cache_TTL_Ms,
			data: data,
		});
	}

	function handleChat(room, time, by, message) {
		if (!isEnabledRoom(room)) return;

		const user = Text.parseUserIdent(by);
		if (Text.toId(user.name || "") === Text.toId(App.bot.getBotNick() || "")) return;

		const id = getPokePasteId(message);
		if (!id) return;

		const roomId = Text.toId(room);
		const cooldownKey = roomId + "|" + id;
		const now = Date.now();
		const prev = roomCooldowns.get(cooldownKey) || 0;
		if ((now - prev) < Cooldown_Ms) return;
		roomCooldowns.set(cooldownKey, now);

		const sendPreview = pasteData => {
			const teamPreview = buildTeamPreview(App, pasteData.paste);
			const plainText = buildPlainText(user.name, pasteData);
			const html = buildHtml(user.name, pasteData, teamPreview);
			if (!html) {
				return App.bot.sendTo(room, plainText);
			}
			App.bot.sendTo(room, "/addhtmlbox " + html);
		};

		const cached = getCached(id);
		if (cached) {
			return sendPreview(cached);
		}

		fetchPokePaste(id, (pasteData, err) => {
			if (err || !pasteData || !pasteData.paste || !pasteData.paste.trim()) {
				return;
			}
			setCache(id, pasteData);
			sendPreview(pasteData);
		});
	}

	App.bot.on('userchat', handleChat);

	exports.destroy = function () {
		App.bot.removeListener('userchat', handleChat);
	};
};
