#!/usr/bin/env node

const log = process.env.LOG_TIMESTAMPS != '1' ? console.log : (message) => {
	if (typeof message === 'string') {
		console.log(`[${new Date().toISOString()}] ${message}`);
	} else {
		console.log(message);
	}
};

var startupCmd = "";
const fs = require("fs");
const path = require("path");
fs.writeFile("latest.log", "", (err) => {
	if (err) log("Callback error in appendFile:" + err);
});

var args = process.argv.splice(process.execArgv.length + 2);
for (var i = 0; i < args.length; i++) {
	if (i === args.length - 1) {
		startupCmd += args[i];
	} else {
		startupCmd += args[i] + " ";
	}
}

if (startupCmd.length < 1) {
	log("Error: Please specify a startup command.");
	process.exit();
}

const seenPercentage = {};

// Spammy Unity warnings that are irrelevant for dedicated servers
const ignoredPatterns = [
	'ERROR: Shader',
	' is not supported on this GPU ',
	' - All subshaders removed',
	'Did you use #pragma only_renderers',
	'If subshaders removal was intentional',
	": fallback shader '",
	'was too large for graphics device maximum supported texture size',
	'Fallback handler could not load library ',
	"gpath.c:115: assertion 'filename != NULL' failed",
	'Renderer: Null Device',
	'Forcing GfxDevice: Null',
	'GfxDevice: creating device client;',
	'NullGfxDevice:',
	'Version:  NULL 1.0 [1.0]',
	'3D Noise requires higher shader capabilities',
	"Prefab '' does not have an associated asset scene.",
	'StringPool.GetString - no string for',
	'Could not find path for prefab ID',
	'BoxCollider does not support negative scale or size.',
	'The effective box size has been forced positive and is likely to give unexpected collision geometry.',
	'If you absolutely need to use negative scaling you can use the convex MeshCollider. Scene hierarchy path',
];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ignoredRegex = new RegExp(ignoredPatterns.map(escapeRegex).join('|'));

function filter(data) {
	const str = data.toString();
	if (str.startsWith("Loading Prefab Bundle ")) { // Rust seems to spam the same percentage, so filter out any duplicates.
		const percentage = str.substr("Loading Prefab Bundle ".length);
		if (seenPercentage[percentage]) return;

		seenPercentage[percentage] = true;
	}

	if (ignoredRegex.test(str)) return;

	log(str);
}

// Parse the -logfile argument from the startup command to find the log path.
function parseLogfilePath(cmd) {
	// Matches -logfile "path" or -logfile 'path' or -logfile path
	const match = cmd.match(/-logfile\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
	if (!match) return null;
	return match[1] || match[2] || match[3];
}

let logTailActive = false;
let logWatcher = null;
let logTailTimeout = null;
let logPollInterval = null;

function startLogTail(filePath) {
	let fileOffset = 0;
	let lineBuf = '';
	let reading = false;
	let pendingRead = false;
	logTailActive = true;

	function readNewData() {
		if (!logTailActive) return;

		// If a read is already in-flight, just flag that we need to re-read when it finishes.
		if (reading) {
			pendingRead = true;
			return;
		}
		reading = true;
		pendingRead = false;

		fs.stat(filePath, (err, stats) => {
			if (err || !stats || stats.size <= fileOffset) {
				reading = false;
				if (pendingRead) readNewData();
				return;
			}

			const readStart = fileOffset;
			const readEnd = stats.size - 1;
			const chunks = [];

			const stream = fs.createReadStream(filePath, {
				start: readStart,
				end: readEnd,
				encoding: 'utf8',
			});

			stream.on('data', (chunk) => {
				chunks.push(chunk);
			});

			stream.on('end', () => {
				const full = chunks.join('');
				fileOffset = readStart + Buffer.byteLength(full, 'utf8');
				lineBuf += full;

				const lines = lineBuf.split('\n');
				// Keep the last element as the incomplete line buffer
				lineBuf = lines.pop();

				for (const line of lines) {
					const trimmed = line.replace(/\r$/, '');
					if (trimmed.length > 0) {
						filter(trimmed);
					}
				}

				reading = false;
				// If new data arrived while we were reading, go again immediately.
				if (pendingRead) readNewData();
			});

			stream.on('error', () => {
				reading = false;
				if (pendingRead) readNewData();
			});
		});
	}

	// Use fs.watch for instant notification, with a polling fallback
	try {
		logWatcher = fs.watch(filePath, () => readNewData());
	} catch (_) {
		// Fallback: poll every 500ms if fs.watch isn't available
	}

	// Poll as a fallback/supplement — fs.watch can be unreliable on some platforms
	logPollInterval = setInterval(() => {
		if (!logTailActive) {
			clearInterval(logPollInterval);
			return;
		}
		readNewData();
	}, 500);

	readNewData();
}

function stopLogTail() {
	if (!logTailActive) return;
	logTailActive = false;

	if (logWatcher) {
		logWatcher.close();
		logWatcher = null;
	}
	if (logTailTimeout) {
		clearTimeout(logTailTimeout);
		logTailTimeout = null;
	}
	if (logPollInterval) {
		clearInterval(logPollInterval);
		logPollInterval = null;
	}
}

function waitForLogfile(filePath) {
	function check() {
		fs.access(filePath, fs.constants.F_OK, (err) => {
			if (!err) {
				startLogTail(filePath);
			} else {
				logTailTimeout = setTimeout(check, 1000);
			}
		});
	}
	check();
}

// Kick off logfile tailing if ENABLE_LOGGING=1
const logfilePath = process.env.ENABLE_LOGGING === '1' ? parseLogfilePath(startupCmd) : null;
if (logfilePath) {
	waitForLogfile(logfilePath);
}

var exec = require("child_process").exec;
log("Starting Rust...");


var ldPreload = process.env.PHYSGUN_UTILS_PATH ? process.env.PHYSGUN_UTILS_PATH : process.env.LD_PRELOAD;
if (process.env.DOORSTOP_ENABLED == 1) ldPreload = (ldPreload ? ldPreload : "") + " " + "/home/container/libdoorstop.so";

var exited = false;
const gameProcess = exec(startupCmd, {
	env: {
		...process.env,
		LD_PRELOAD: ldPreload
	}
})
const earlyData = (data) => {
	if (logTailActive) return; // Don't log early output if we're tailing the logfile, to avoid duplicates
	filter(data);
};
gameProcess.stdout.on('data', earlyData);
gameProcess.stderr.on('data', earlyData);
gameProcess.on('exit', function (code, signal) {
	exited = true;

	if (code) {
		log("Main game process exited with code " + code);
		process.exit(code);
	}
});

function initialListener(data) {
	const command = data.toString().trim();
	if (command === 'quit') {
		gameProcess.kill('SIGTERM');
	} else {
		log('Unable to run "' + command + '" due to RCON not being connected yet.');
	}
}
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on('data', initialListener);

process.on('exit', function (code) {
	if (exited) return;

	log("Received request to stop the process, stopping the game...");
	gameProcess.kill('SIGTERM');
});

var waiting = true;
var poll = function () {
	function createPacket(command) {
		var packet = {
			Identifier: -1,
			Message: command,
			Name: "WebRcon"
		};
		return JSON.stringify(packet);
	}

	var serverHostname = process.env.RCON_IP ? process.env.RCON_IP : "localhost";
	var serverPort = process.env.RCON_PORT;
	var serverPassword = process.env.RCON_PASS;
	var WebSocket = require("ws");
	var ws = new WebSocket("ws://" + serverHostname + ":" + serverPort + "/" + serverPassword);

	ws.on("open", function open() {
		log("Connected to RCON. Generating the map now. Please wait until the server status switches to \"Running\", It might take a long time!");
		waiting = false;

		// Stop tailing the logfile now that RCON is connected
		stopLogTail();

		// Hack to fix broken console output
		ws.send(createPacket('status'));

		process.stdin.removeListener('data', initialListener);
		gameProcess.stdout.removeListener('data', earlyData);
		gameProcess.stderr.removeListener('data', earlyData);
		process.stdin.on('data', function (text) {
			ws.send(createPacket(text));
		});
	});

	ws.on("message", function (data, flags) {
		try {
			var json = JSON.parse(data);
			if (json !== undefined) {
				if (json.Message !== undefined && json.Message.length > 0) {
					filter(json.Message);
					const fs = require("fs");
					fs.appendFile("latest.log", "\n" + json.Message, (err) => {
						if (err) log("Callback error in appendFile:" + err);
					});
				}
			} else {
				log("Error: Invalid JSON received");
			}
		} catch (e) {
			if (e) {
				log(e);
			}
		}
	});

	ws.on("error", function (err) {
		waiting = true;
		log("Waiting for RCON to come up...");
		setTimeout(poll, 5000);
	});

	ws.on("close", function () {
		if (!waiting) {
			log("Connection to server closed.");

			exited = true;
			process.exit();
		}
	});
}
poll();
