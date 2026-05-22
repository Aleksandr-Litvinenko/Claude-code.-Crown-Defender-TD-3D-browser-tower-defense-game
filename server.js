'use strict';
const WebSocket = require('ws');
const http = require('http');

const PORT = 3100;
const MAX_ROOMS = 3;

// rooms[i] = { id, p: [P1_ws|null, P2_ws|null], state: 'empty'|'waiting'|'active' }
const rooms = Array.from({ length: MAX_ROOMS }, (_, i) =>
    ({ id: i, p: [null, null], state: 'empty' })
);

function roomInfo(r) {
    return { id: r.id, players: r.p.filter(Boolean).length, state: r.state };
}

const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'Crown Defender MP', rooms: rooms.map(roomInfo) }));
});

const wss = new WebSocket.Server({ server: httpServer });

function safeSend(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(typeof data === 'string' ? data : JSON.stringify(data));
}

function broadcastRooms() {
    // Refresh room list for all connected clients who are still in room-select (no room yet)
    wss.clients.forEach(c => {
        if (c._slot === -1) safeSend(c, { type: 'rooms', list: rooms.map(roomInfo) });
    });
}

wss.on('connection', (ws) => {
    ws._room = null;
    ws._slot = -1;

    // Send room list so client can pick a room
    safeSend(ws, { type: 'rooms', list: rooms.map(roomInfo) });

    ws.on('message', (raw) => {
        const str = raw.toString();
        let msg;
        try { msg = JSON.parse(str); } catch (e) { return; }

        // ── JOIN a specific room ──────────────────────────────────────────
        if (msg.type === 'join') {
            if (ws._slot !== -1) return; // already in a room
            const rid = msg.room;
            if (rid < 0 || rid >= MAX_ROOMS) { safeSend(ws, { type: 'err', text: 'Неверная комната' }); return; }
            const room = rooms[rid];

            const slot = !room.p[0] ? 0 : (!room.p[1] ? 1 : -1);
            if (slot === -1) { safeSend(ws, { type: 'full', room: rid }); return; }
            if (room.state === 'active') { safeSend(ws, { type: 'full', room: rid }); return; }

            room.p[slot] = ws;
            ws._room = room;
            ws._slot = slot;
            room.state = 'waiting';
            const pid = slot + 1;

            console.log(`[${new Date().toTimeString().slice(0, 8)}] P${pid} joined room ${rid}`);
            safeSend(ws, { type: 'joined', pid, room: rid });

            if (slot === 1) {
                // Tell P1 that their opponent arrived
                safeSend(room.p[0], { type: 'p2joined' });
            }

            broadcastRooms(); // refresh room list for anyone still in lobby
            return;
        }

        const room = ws._room;
        const slot = ws._slot;
        if (!room || slot === -1) return;

        // ── HOST requests game start ──────────────────────────────────────
        if (msg.type === 'startReq' && slot === 0) {
            if (!room.p[1]) {
                safeSend(ws, { type: 'err', text: 'Ждём второго игрока' });
                return;
            }
            room.state = 'active';
            console.log(`[${new Date().toTimeString().slice(0, 8)}] Room ${room.id} — game starting`);
            safeSend(room.p[0], { type: 'start', countdown: 5 });
            safeSend(room.p[1], { type: 'start', countdown: 5 });
            broadcastRooms();
            return;
        }

        // ── Relay everything else to the other player ─────────────────────
        safeSend(room.p[1 - slot], str);
    });

    ws.on('close', () => {
        const room = ws._room;
        const slot = ws._slot;
        if (!room || slot === -1) return;

        const pid = slot + 1;
        console.log(`[${new Date().toTimeString().slice(0, 8)}] P${pid} left room ${room.id}`);
        room.p[slot] = null;
        safeSend(room.p[1 - slot], { type: 'leave', pid });

        if (!room.p[0] && !room.p[1]) {
            room.state = 'empty';
        } else {
            room.state = 'waiting'; // partner still there, waiting again
        }
        broadcastRooms();
    });

    ws.on('error', (err) => console.error(`WS error: ${err.message}`));
});

httpServer.listen(PORT, '0.0.0.0', () =>
    console.log(`Crown Defender MP — ${MAX_ROOMS} rooms on :${PORT}`)
);
