const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let playlist = []; 
let currentSongIndex = 0;
let isPlaying = false;
let startTime = 0;

io.on('connection', (socket) => {
    socket.emit('init_state', {
        playlist,
        currentSongIndex,
        isPlaying,
        elapsedTime: isPlaying ? (Date.now() - startTime) / 1000 : 0
    });

    socket.on('add_song', (videoId) => {
        const song = { id: videoId };
        playlist.push(song);
        io.emit('update_playlist', playlist);
        if (playlist.length === 1 && !isPlaying) {
            playSong(0);
        }
    });

    socket.on('song_ended', () => {
        if (currentSongIndex + 1 < playlist.length) {
            playSong(currentSongIndex + 1);
        } else {
            isPlaying = false;
            io.emit('stop_player');
        }
    });
});

function playSong(index) {
    currentSongIndex = index;
    isPlaying = true;
    startTime = Date.now();
    io.emit('play_song', { videoId: playlist[index].id, index: index });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Start! http://localhost:${PORT}`);
});
