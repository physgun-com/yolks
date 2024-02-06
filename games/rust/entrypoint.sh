#!/bin/bash
cd /home/container

export INTERNAL_IP=`ip route get 1 | awk '{print $(NF-2);exit}'`

if [ -z ${AUTO_UPDATE} ] || [ "${AUTO_UPDATE}" == "1" ]; then
	./steamcmd/steamcmd.sh +force_install_dir /home/container +login anonymous +app_update 258550 +quit
else
    echo -e "Not updating game server as auto update was set to 0. Starting Server"
fi

MODIFIED_STARTUP=`eval echo $(echo ${STARTUP} | sed -e 's/{{/${/g' -e 's/}}/}/g')`
echo "Starting Physgun Rust Server\nStartup Command - ${MODIFIED_STARTUP}"

if [[ "${FRAMEWORK}" == "carbon" ]]; then
    echo "Updating Carbon..."
    curl -sSL "https://github.com/CarbonCommunity/Carbon.Core/releases/download/production_build/Carbon.Linux.Release.tar.gz" | tar zx
    echo "Done updating Carbon!"

    export DOORSTOP_ENABLED=1
    export DOORSTOP_TARGET_ASSEMBLY="$(pwd)/carbon/managed/Carbon.Preloader.dll"
    MODIFIED_STARTUP="LD_PRELOAD=$(pwd)/libdoorstop.so ${MODIFIED_STARTUP}"

elif [[ "$OXIDE" == "1" ]] || [[ "${FRAMEWORK}" == "oxide" ]]; then
    echo "Installing Oxide..."
    curl -sSL "https://github.com/OxideMod/Oxide.Rust/releases/latest/download/Oxide.Rust-linux.zip" > umod.zip
    unzip -o -q umod.zip
    rm umod.zip
    echo "Done Installing Oxide!"
fi

OLD_DIR=$(pwd)
cd /tmp

download_extension() {
	local url=$1
	local file=$2
	local name=$3
	if [ "${!name}" == "1" ]; then
		curl -SSL -o "${file}" "${url}"
		mv "${file}" /home/container/server/RustDedicated_Data/Managed
		echo -e "Updated ${file}\n"
	fi
}

if [ "${DISCORD_EXT}" == "1" ]; then
	download_extension "https://umod.org/extensions/discord/download" "Oxide.Ext.Discord.dll" "Discord DLL"
fi

if [ "${RUST_EDIT}" == "1" ]; then
	download_extension "https://umod.org/extensions/rustedit/download" "Oxide.Ext.RustEdit.dll" "RustEdit DLL"
fi

if [ "${CHAOS_EXT}" == "1" ]; then
	download_extension "https://chaoscode.io/oxide/Oxide.Ext.Chaos.dll" "Oxide.Ext.Chaos.dll" "Chaos DLL"
fi

if [ "${CHAOS_NPC}" == "1" ]; then
	download_extension "https://chaoscode.io/oxide/Oxide.Ext.ChaosNPC.dll" "Oxide.Ext.ChaosNPC.dll" "ChaosNPC DLL"
fi

cd "$OLD_DIR"

if [ -z ${OWNERID} ] || [ "${OWNERID}" == "null" ]; then
	echo "OwnerID not set - Not writing to users.cfg"
else
	mkdir -p /home/container/server/rust/cfg
	file_path="/home/container/server/rust/cfg/users.cfg"
	content="ownerid ${OWNERID} \"rustadmin\" \"rustadmin\""

	if [ ! -f "$file_path" ]; then
		echo "$content" > "$file_path"
	else
		if ! grep -qF "$content" "$file_path"; then
			echo "$content" >> "$file_path"
		fi
	fi
fi

# Fix for Rust not starting
export LD_LIBRARY_PATH=$(pwd)/RustDedicated_Data/Plugins/x86_64:$(pwd)

# Run the Server
node /wrapper.js "${MODIFIED_STARTUP}"
