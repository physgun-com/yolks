#!/bin/bash
cd /home/container

# Custom logging function with color output
log() {
    echo -e "\u001b[34m[PhysgunEntry] \u001b[36m$1\u001b[0m"
}

export INTERNAL_IP=$(ip route get 1 | awk '{print $(NF-2);exit}')

if [[ "${STEAM_USER}" == "" ]] || [[ "${STEAM_PASS}" == "" ]]; then
    echo -e "Steam credentials are required to download Renown server files.\n"
    exit 1
fi

# Handle auto-update logic
if [ -z "${AUTO_UPDATE}" ] || [ "${AUTO_UPDATE}" == "1" ]; then
#print cwd
    log "Updating Physgun Renown Server..."
    log "Current Directory: $(pwd)"
    ./steamcmd/steamcmd.sh +force_install_dir /home/container +login ${STEAM_USER} ${STEAM_PASS} +app_update 1512690 +quit
else
    log "Auto-update disabled. Starting Server without updating."
fi

# Process the startup command with dynamic variables
MODIFIED_STARTUP=`eval echo $(echo ${STARTUP} | sed -e 's/{{/${/g' -e 's/}}/}/g')`

log "Starting Physgun Renown Server with Command - ${MODIFIED_STARTUP}"

# Execute the server startup command
/wrapper/wrapper.js "${MODIFIED_STARTUP}"
