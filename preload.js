const { contextBridge, ipcRenderer } = require("electron");

function splitTopLevelTables(input) {
    const blocks = [];
    let depth = 0;
    let inString = false;
    let quote = "";
    let start = -1;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const prev = input[i - 1];

        if (inString) {
            if (ch === quote && prev !== "\\") {
                inString = false;
                quote = "";
            }
            continue;
        }

        if (ch === "'" || ch === '"') {
            inString = true;
            quote = ch;
            continue;
        }

        if (ch === "{") {
            depth++;
            if (depth === 1) start = i;
        } else if (ch === "}") {
            if (depth === 1 && start !== -1) {
                blocks.push(input.slice(start, i + 1));
                start = -1;
            }
            depth--;
        }
    }

    return blocks;
}

function extractMainTable(luaText) {
    const match = luaText.match(/beacons\s*=\s*\{([\s\S]*)\}\s*$/);
    if (!match) {
        throw new Error("Konnte 'beacons = { ... }' nicht finden.");
    }
    return match[1];
}

function parseStringField(block, field) {
    const translated = block.match(new RegExp(`${field}\\s*=\\s*_\\('([^']*)'\\)`));
    if (translated) return translated[1];

    const direct = block.match(new RegExp(`${field}\\s*=\\s*'([^']*)'`));
    if (direct) return direct[1];

    return "";
}

function parseNumberField(block, field) {
    const match = block.match(new RegExp(`${field}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
    return match ? Number(match[1]) : null;
}

function parseIdentifierField(block, field) {
    const match = block.match(new RegExp(`${field}\\s*=\\s*([A-Z0-9_]+)`));
    return match ? match[1] : "";
}

function parsePosition(block) {
    const match = block.match(
        /position\s*=\s*\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}/
    );

    if (!match) return { x: null, y: null, z: null };

    return {
        x: Number(match[1]),
        y: Number(match[2]),
        z: Number(match[3])
    };
}

function parsePositionGeo(block) {
    const match = block.match(
        /positionGeo\s*=\s*\{\s*latitude\s*=\s*(-?\d+(?:\.\d+)?)\s*,\s*longitude\s*=\s*(-?\d+(?:\.\d+)?)\s*\}/
    );

    if (!match) return { latitude: null, longitude: null };

    return {
        latitude: Number(match[1]),
        longitude: Number(match[2])
    };
}

function parseSceneObjects(block) {
    const match = block.match(/sceneObjects\s*=\s*\{([^}]*)\}/);
    if (!match) return [];

    return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

function parseBeaconBlock(block) {
    const position = parsePosition(block);
    const geo = parsePositionGeo(block);

    return {
        beaconId: parseStringField(block, "beaconId"),
        display_name: parseStringField(block, "display_name"),
        type: parseIdentifierField(block, "type"),
        callsign: parseStringField(block, "callsign"),
        frequency: parseNumberField(block, "frequency"),
        channel: parseNumberField(block, "channel"),
        direction: parseNumberField(block, "direction"),
        latitude: geo.latitude,
        longitude: geo.longitude,
        position_x: position.x,
        position_y: position.y,
        position_z: position.z,
        chartOffsetX: parseNumberField(block, "chartOffsetX"),
        sceneObjects: parseSceneObjects(block).join(", ")
    };
}

function parseBeacons(luaText) {
    const mainTable = extractMainTable(luaText);
    const blocks = splitTopLevelTables(mainTable);
    return blocks.map(parseBeaconBlock);
}

contextBridge.exposeInMainWorld("beaconsApi", {
    async openBeaconFile() {
        const result = await ipcRenderer.invoke("dialog:openBeaconFile");

        if (result.canceled) {
            return result;
        }

        return {
            canceled: false,
            filePath: result.filePath,
            beacons: parseBeacons(result.content)
        };
    },

    openMapWindow(latitude, longitude) {
        return ipcRenderer.invoke("maps:openWindow", latitude, longitude);
    },

    onMenuOpenFile(callback) {
        ipcRenderer.on("menu:open-file", callback);
    }
});
