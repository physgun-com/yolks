#!/usr/bin/env node

const fs = require("fs");
const { exec } = require("child_process");
const Rcon = require("rcon");

let startupCmd = process.argv.slice(process.execArgv.length + 2).join(" ");

if (!startupCmd) {
	console.error("Error: Please specify a startup command.");
	process.exit(1);
}

// Clear the log file
fs.writeFileSync("latest.log", "", "utf8");

function logToFile(message) {
	fs.appendFile("latest.log", `\n${message}`, (err) => {
		if (err) console.error("Error writing to log file:", err);
	});
}

function printOutput(data) {
	process.stdout.write(data.toString());
}

console.log("Starting Renown...");

let ldPreload = process.env.PHYSGUN_UTILS_PATH || process.env.LD_PRELOAD;
if (process.env.DOORSTOP_ENABLED === "1") {
	ldPreload = `${ldPreload ? ldPreload + " " : ""}/home/container/libdoorstop.so`;
}

let exited = false;
let rconConn = null;

const gameProcess = exec(startupCmd, {
	env: {
		...process.env,
		LD_PRELOAD: ldPreload,
	},
});

gameProcess.stdout.on("data", printOutput);
gameProcess.stderr.on("data", printOutput);

gameProcess.on("exit", (code) => {
	exited = true;
	if (code) {
		console.log(`Main game process exited with code ${code}`);
	}
});

function initialListener(data) {
	const command = data.toString().trim();
	if (command === "quit") {
		gameProcess.kill("SIGTERM");
	} else {
		console.log(`Unable to run "${command}" — RCON not connected yet.`);
	}
}

process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on("data", initialListener);

process.on("exit", () => {
	if (exited) return;

	console.log("Received request to stop the process, stopping the game...");

	if (rconConn) {
		rconConn.send("saveworld");
		rconConn.send("con quit");
		rconConn.end();
	} else {
		gameProcess.kill("SIGTERM");
	}
});

function connectRcon() {
	const host = process.env.RCON_IP || "localhost";
	const port = parseInt(process.env.RCON_PORT || "28016", 10);
	const password = process.env.RCON_PASS || "";

	const conn = new Rcon(host, port, password);

	conn.on("auth", () => {
		console.log("Connected to RCON!");
		rconConn = conn;

		process.stdin.removeListener("data", initialListener);

		process.stdin.on("data", (text) => {
			const command = text.trim();
			if (!command) return;

			if (command === "quit") {
				conn.send("saveworld");
				conn.send("con quit");
				conn.disconnect();
				rconConn = null;
			} else {
				conn.send(command);
			}
		});

		conn.send("help");
	});

	const handleMessage = (str) => {
		const message = `[RCON] ${str}`;
		console.log(message);
		logToFile(message);
	};

	conn.on("response", handleMessage);
	conn.on("server", handleMessage);

	conn.on("error", (err) => {
		if (!rconConn) {
			console.log("Waiting for RCON to connect...");
		} else {
			console.error("RCON error:", err);
		}
		setTimeout(connectRcon, 5000);
	});

	conn.on("end", () => {
		if (!exited) {
			console.log("RCON connection closed.");
			process.exit();
		}
	});

	conn.connect();
}

connectRcon();
