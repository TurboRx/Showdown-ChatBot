/**
 * Encrypted JSON Database
 */

'use strict';

const Crypto = require('crypto');
const FileSystem = require('fs');
const EventsManager = require('./events.js');

function encrypt(text, algorithm, password) {
	let cipher = Crypto.createCipher(algorithm, password);
	let crypted = cipher.update(text, 'utf8', 'hex');
	crypted += cipher.final('hex');
	return crypted;
}

function decrypt(text, algorithm, password) {
	let decipher = Crypto.createDecipher(algorithm, password);
	let data = decipher.update(text, 'hex', 'utf8');
	data += decipher.final('utf8');
	return data;
}

class JSONDataBase {
	constructor(file, password, algo) {
		this.algo = algo || "aes-256-ctr";
		this.password = password;
		this.data = {};
		this.file = file;
		this.writePending = false;
		this.writing = false;
		this.events = new EventsManager();
		this.load();
	}

	write() {
		let data = JSON.stringify(this.data);
		data = encrypt(data, this.algo, this.password);
		let finishWriting = function () {
			this.writing = false;
			this.events.emit('write');
			if (this.writePending) {
				this.writePending = false;
				this.write();
			}
		}.bind(this);
		if (this.writing) {
			this.writePending = true;
			return;
		}
		this.writing = true;
		FileSystem.writeFile(this.file + '.0', data, function () {
			// rename is atomic on POSIX, but will throw an error on Windows
			FileSystem.rename(this.file + '.0', this.file, function (err) {
				if (err) {
					// This should only happen on Windows.
					FileSystem.writeFile(this.file, data, finishWriting);
					return;
				}
				finishWriting();
			}.bind(this));
		}.bind(this));
	}

	on(event, handler) {
		this.events.on(event, handler);
	}

	removeListener(event, handler) {
		this.events.removeListener(event, handler);
	}

	load() {
		if (FileSystem.existsSync(this.file)) {
			let data = FileSystem.readFileSync(this.file).toString();
			data = decrypt(data, this.algo, this.password);
			try {
				this.data = JSON.parse(data);
				this.events.emit('load');
			} catch (err) {
				this.events.emit('error', err);
			}
		}
	}

	get() {
		return this.data;
	}

	set(data) {
		this.data = data;
	}

	destroy() {
		if (FileSystem.existsSync(this.file)) {
			try {
				FileSystem.unlinkSync(this.file);
			} catch (e) {}
			this.events.emit('destroy');
		}
	}
}

module.exports = JSONDataBase;
