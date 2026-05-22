'use strict';
const WebSocket = require('ws');
const http = require('http');

const PORT = 3100;

const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'Crown Defender MP', players: room.p.filter(Boolean).length }));
});

const wss = new WebSocket.Server({ server: httpServer });

// Single shared room: p[0] = host (P1), p[1] = client (P2)
let room = { p: [null, null] };

function safeSend(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(typeof data === 'string' ? data : JSON.stringify(data));
}

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;

    // Find an empty slot
    const slot = !room.p[0] ? 0 : (!room.p[1] ? 1 : -1);
    if (slot === -1) {
        safeSend(ws, { type: 'full' });
        ws.close();
        console.log(`[${ip}] Rejected — room full`);
        return;
    }

    room.p[slot] = ws;
    ws._slot = slot;
    const pid = slot + 1; // 1 or 2

    console.log(`[${new Date().toTimeString().slice(0,8)}] Player ${pid} connected from ${ip}`);
    safeSend(ws, { type: 'joined', pid });

    if (room.p[0] && room.p[1]) {
        console.log('Both players ready — starting countdown');
        safeSend(room.p[0], { type: 'start', countdown: 5 });
        safeSend(room.p[1], { type: 'start', countdown: 5 });
    }

    ws.on('message', (raw) => {
        // Pure relay — forward every message to the other player
        const other = room.p[1 - slot];
        safeSend(other, raw.toString());
    });

    ws.on('close', () => {
        console.log(`Player ${pid} disconnected`);
        room.p[slot] = null;
        safeSend(room.p[1 - slot], { type: 'leave', pid });
        if (!room.p[0] && !room.p[1]) {
            room = { p: [null, null] };
            console.log('Room reset');
        }
    });

    ws.on('error', (err) => console.error(`Player ${pid} error: ${err.message}`));
});

httpServer.listen(PORT, '0.0.0.0', () =>
    console.log(`Crown Defender MP server running on port ${PORT}`)
);
