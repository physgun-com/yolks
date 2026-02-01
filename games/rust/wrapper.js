#!/usr/bin/env node

var startupCmd = "";
const fs = require("fs");
fs.writeFile("latest.log", "", (err) => {
	if (err) console.log("Callback error in appendFile:" + err);
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
	console.log("Error: Please specify a startup command.");
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
	'Fallback handler could not load library /home/container/RustDedicated_Data/MonoBleedingEdge/x86_64/data-',
	"gpath.c:115: assertion 'filename != NULL' failed",
	'Renderer: Null Device',
	'Forcing GfxDevice: Null',
	'GfxDevice: creating device client;',
	'NullGfxDevice:',
	'Version:  NULL 1.0 [1.0]',
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

	console.log(str);
}

var exec = require("child_process").exec;
console.log("Starting Rust...");


var ldPreload = process.env.PHYSGUN_UTILS_PATH ? process.env.PHYSGUN_UTILS_PATH : process.env.LD_PRELOAD;
if (process.env.DOORSTOP_ENABLED == 1) ldPreload = (ldPreload ? ldPreload : "") + " " + "/home/container/libdoorstop.so";

var exited = false;
const gameProcess = exec(startupCmd, {
	env: {
		...process.env,
		LD_PRELOAD: ldPreload
	}
})
gameProcess.stdout.on('data', filter);
gameProcess.stderr.on('data', filter);
gameProcess.on('exit', function (code, signal) {
	exited = true;

	if (code) {
		console.log("Main game process exited with code " + code);
		// process.exit(code);
	}
});

function initialListener(data) {
	const command = data.toString().trim();
	if (command === 'quit') {
		gameProcess.kill('SIGTERM');
	} else {
		console.log('Unable to run "' + command + '" due to RCON not being connected yet.');
	}
}
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on('data', initialListener);

process.on('exit', function (code) {
	if (exited) return;

	console.log("Received request to stop the process, stopping the game...");
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
		console.log("Connected to RCON. Generating the map now. Please wait until the server status switches to \"Running\", It might take a long time!");
		waiting = false;

		// Hack to fix broken console output
		ws.send(createPacket('status'));

		process.stdin.removeListener('data', initialListener);
		gameProcess.stdout.removeListener('data', filter);
		gameProcess.stderr.removeListener('data', filter);
		process.stdin.on('data', function (text) {
			ws.send(createPacket(text));
		});
	});

	ws.on("message", function (data, flags) {
		try {
			var json = JSON.parse(data);
			if (json !== undefined) {
				if (json.Message !== undefined && json.Message.length > 0) {
					console.log(json.Message);
					const fs = require("fs");
					fs.appendFile("latest.log", "\n" + json.Message, (err) => {
						if (err) console.log("Callback error in appendFile:" + err);
					});
				}
			} else {
				console.log("Error: Invalid JSON received");
			}
		} catch (e) {
			if (e) {
				console.log(e);
			}
		}
	});

	ws.on("error", function (err) {
		waiting = true;
		console.log("Waiting for RCON to come up...");
		setTimeout(poll, 5000);
	});

	ws.on("close", function () {
		if (!waiting) {
			console.log("Connection to server closed.");

			exited = true;
			process.exit();
		}
	});
}
poll();
