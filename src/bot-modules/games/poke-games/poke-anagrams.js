/*
 * Poke-Anagrams
 */

'use strict';

const Wait_Time = 2000;
const Default_Answer_Time = 30 * 1000;

const Path = require('path');

const Text = Tools.get('text.js');
const Translator = Tools.get('translate.js');
const normalize = Tools.get('normalize.js');
const PokeRand = require(Path.resolve(__dirname, 'pokerand.js'));

const translator = new Translator(Path.resolve(__dirname, 'poke-anagrams.translations'));

function toWordId(str) {
	if (!str) return '';
	str = normalize(str);
	return str.toLowerCase().replace(/[^a-z0-9\u00f1]/g, '');
}

function getLanguage(room) {
	return App.config.language.rooms[room] || App.config.language['default'];
}

function parseWinners(winners, lang) {
	let res = {
		type: 'win',
		text: "**" + winners[0] + "**",
	};
	if (winners.length < 2) return res;
	res.type = 'tie';
	for (let i = 1; i < winners.length - 1; i++) {
		res.text += ", **" + winners[i] + "**";
	}
	res.text += " " + translator.get('and', lang) + " **" + winners[winners.length - 1] + "**";
	return res;
}

class PokeAnagrams {
	constructor(room, games, maxpoints, ansTime) {
		this.room = room;
		this.lang = getLanguage(this.room);
		this.games = games || 0;
		this.maxpoints = maxpoints || 0;
		this.ansTime = ansTime || Default_Answer_Time;

		this.status = 'new';
		this.word = '';
		this.wordId = '';
		this.randomizedChars = [];
		this.clue = '';

		this.ngame = 0;
		this.points = {};
		this.names = {};
		this.timer = null;
	}

	send(txt) {
		App.bot.sendTo(this.room, txt);
	}

	start() {
		let txt = translator.get(0, this.lang) + ". ";
		if (this.games) {
			txt += translator.get(1, this.lang) + " " + this.games + " " + translator.get(2, this.lang) + ". ";
		}
		if (this.maxpoints) {
			txt += translator.get(3, this.lang) + " " + this.maxpoints + " " + translator.get(4, this.lang) + ". ";
		}
		txt += translator.get(5, this.lang) + " " + Math.floor(this.ansTime / 1000) + " " + translator.get(6, this.lang) + ". ";
		txt += translator.get(7, this.lang) + " ``" + (App.config.parser.tokens[0] || "") +
			translator.get(8, this.lang) + "`` " + translator.get(9, this.lang) + ".";
		this.send(txt);
		this.status = 'start';
		this.wait();
	}

	wait() {
		this.status = 'wait';
		this.ngame++;
		this.timer = setTimeout(this.nextAnswer.bind(this), Wait_Time);
	}

	nextAnswer() {
		this.timer = null;
		if (this.games && this.ngame > this.games) {
			return this.end();
		}
		if (this.maxpoints) {
			for (let k in this.points) {
				if (this.points[k] >= this.maxpoints) {
					return this.end();
				}
			}
		}
		let question = PokeRand.random();
		this.clue = question.clue;
		this.word = question.word;
		this.wordId = toWordId(this.word);
		this.randomizedChars = [];
		for (let i = 0; i < this.wordId.length; i++) {
			this.randomizedChars.push(this.wordId.charAt(i).toUpperCase());
		}
		this.randomizedChars = this.randomizedChars.randomize();
		this.status = 'question';
		this.send("**Poke-Anagrams:** " + this.randomizedChars.join(', ') + ' | **' + this.clue + '**');
		this.timer = setTimeout(this.timeout.bind(this), this.ansTime);
	}

	timeout() {
		this.status = 'wait';
		this.timer = null;
		this.send(translator.get(10, this.lang) + ": __" + this.word + "__");
		this.wait();
	}

	guess(user, word) {
		let ident = Text.parseUserIdent(user);
		word = toWordId(word);
		if (this.status !== 'question') return;
		if (this.wordId === word) {
			this.status = 'wait';
			clearTimeout(this.timer);
			this.timer = null;
			if (!this.points[ident.id]) this.points[ident.id] = 0;
			this.points[ident.id]++;
			this.names[ident.id] = ident.name;
			this.send(translator.get(11, this.lang) + " **" + ident.name + "** " + translator.get(12, this.lang) + ": __" +
				this.word + "__. " + translator.get(13, this.lang) + ": " + this.points[ident.id]);
			this.wait();
		}
	}

	end() {
		this.status = 'end';
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		let winners = [], points = 0;
		for (let i in this.points) {
			if (this.points[i] === points) {
				winners.push(this.names[i]);
			} else if (this.points[i] > points) {
				points = this.points[i];
				winners = [];
				winners.push(this.names[i]);
			}
		}
		if (!points) {
			this.send(translator.get('lose', this.lang) + "!");
			App.modules.games.system.terminateGame(this.room);
			return;
		}
		let t = parseWinners(winners, this.lang);
		let txt = "**" + translator.get('end', this.lang) + "** ";
		switch (t.type) {
		case 'win':
			txt += translator.get('grats1', this.lang) + " " + t.text + " " + translator.get('grats2', this.lang) +
					" __" + points + " " + translator.get('points', this.lang) + "__!";
			break;
		case 'tie':
			txt += translator.get('tie1', this.lang) + " __" + points + " " + translator.get('points', this.lang) +
					"__ " + translator.get('tie2', this.lang) + " " + t.text;
			break;
		}

		this.send(txt);
		App.modules.games.system.terminateGame(this.room);
	}

	destroy() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}

module.exports = PokeAnagrams;
