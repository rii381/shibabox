const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// データの管理
let playlist = []; 
let currentSongIndex = 0;
let isPlaying = false;

io.on('connection', (socket) => {
    // 1. 接続時に今の状態を教える
    socket.emit('init_state', {
        playlist,
        currentSongIndex,
        isPlaying
    });

    // 2. 曲の追加
    socket.on('add_song', (videoId) => {
        playlist.push({ id: videoId });
        io.emit('update_playlist', playlist);
        // 最初の1曲目なら自動でセット
        if (playlist.length === 1) {
            currentSongIndex = 0;
            io.emit('change_song', { index: 0, videoId: videoId });
        }
    });

    // 3. 再生・一時停止・スキップ
    socket.on('control', (action) => {
        switch(action.type) {
            case 'play':
                isPlaying = true;
                io.emit('sync_action', { type: 'play' });
                break;
            case 'pause':
                isPlaying = false;
                io.emit('sync_action', { type: 'pause' });
                break;
            case 'next':
                if (currentSongIndex + 1 < playlist.length) {
                    current
