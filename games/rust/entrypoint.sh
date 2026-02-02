#!/bin/bash
cd /home/container

# Custom logging function with color output
log() {
    echo -e "\u001b[34m[PhysgunEntry] \u001b[36m$1\u001b[0m"
}

export INTERNAL_IP=$(ip route get 1 | awk '{print $(NF-2);exit}')

# Handle auto-update logic
if [ -z "${AUTO_UPDATE}" ] || [ "${AUTO_UPDATE}" == "1" ]; then
    # Construct the beta branch argument if set and not 'none'
    if [ -n "${STEAMCMD_BRANCH}" ] && [ "${STEAMCMD_BRANCH}" != "none" ]; then
        BRANCH_ARG="-beta ${STEAMCMD_BRANCH}"
    else
        BRANCH_ARG="-beta public"
    fi

    ./steamcmd/steamcmd.sh +force_install_dir /home/container +login anonymous +app_update 258550 ${BRANCH_ARG} +quit
else
    log "Auto-update disabled. Starting Server without updating."
fi

# Process the startup command with dynamic variables
MODIFIED_STARTUP=$(eval echo $(echo "${STARTUP}" | sed -e 's/{{/${/g' -e 's/}}/}/g'))

log "Starting Physgun Rust Server with Command - ${MODIFIED_STARTUP}"

# Framework specific operations
if [[ "${FRAMEWORK}" == "carbon" ]]; then
    log "Updating Carbon..."
    curl -sSL "https://github.com/CarbonCommunity/Carbon.Core/releases/download/production_build/Carbon.Linux.Release.tar.gz" | tar zx
    log "Carbon update complete!"
    export DOORSTOP_ENABLED=1
    export DOORSTOP_TARGET_ASSEMBLY="$(pwd)/carbon/managed/Carbon.Preloader.dll"
elif [[ "${FRAMEWORK}" == "oxide" ]] || [[ "$OXIDE" == "1" ]]; then
    if [ -n "${STEAMCMD_BRANCH}" ] && [ "${STEAMCMD_BRANCH}" != "none" ]; then
    	log "Installing Oxide (staging branch)..."
    	OXIDE_URL="https://downloads.oxidemod.com/artifacts/Oxide.Rust/staging/Oxide.Rust-linux.zip"
	else
    	log "Installing Oxide..."
    	OXIDE_URL="https://github.com/OxideMod/Oxide.Rust/releases/latest/download/Oxide.Rust-linux.zip"
	fi
    curl -sSL $OXIDE_URL > umod.zip
    unzip -o -q umod.zip && rm umod.zip
    log "Oxide installation complete!"
fi

download_extension() {
    if [ "${!3}" == "1" ]; then
        curl -sSL -o "/home/container/RustDedicated_Data/Managed/$2" "$1"
        log "Updated $2"
    fi
}

# Download extensions if enabled
download_extension "https://umod.org/extensions/discord/download" "Oxide.Ext.Discord.dll" "DISCORD_EXT"
download_extension "https://github.com/k1lly0u/Oxide.Ext.RustEdit/raw/master/Oxide.Ext.RustEdit.dll" "Oxide.Ext.RustEdit.dll" "RUST_EDIT"
download_extension "https://chaoscode.io/oxide/Oxide.Ext.Chaos.dll" "Oxide.Ext.Chaos.dll" "CHAOS_EXT"
download_extension "https://chaoscode.io/oxide/Oxide.Ext.ChaosNPC.dll" "Oxide.Ext.ChaosNPC.dll" "CHAOS_NPC"

# Handle server owner configuration
if [ ! -z "${OWNERID}" ] && [ "${OWNERID}" != "null" ]; then
    mkdir -p /home/container/server/rust/cfg
    file_path="/home/container/server/rust/cfg/users.cfg"
    content="ownerid ${OWNERID} \"rustadmin\" \"rustadmin\""
    if ! grep -qF "$content" "$file_path"; then
        echo "$content" >> "$file_path"
        log "OwnerID set in users.cfg"
    fi
else
    log "OwnerID not set or null. Skipping users.cfg update."
fi

# Fix for Rust not starting due to missing library path
export LD_LIBRARY_PATH=$(pwd)/RustDedicated_Data/Plugins/x86_64:$(pwd)

# Execute the server startup command
node /wrapper.js "$MODIFIED_STARTUP"
