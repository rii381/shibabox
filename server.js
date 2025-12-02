const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// データ管理
let playlist = []; 
let currentSongIndex = 0;
let isPlaying = false;
// ★追加: モード管理
let isLoop = false;
let isShuffle = false;

io.on('connection', (socket) => {
    // 接続時に現在の状態を送信（モード情報も追加）
    socket.emit('init_state', {
        playlist,
        currentSongIndex,
        isPlaying,
        isLoop,
        isShuffle
    });

    // 曲の追加
    socket.on('add_song', (data) => {
        playlist.push(data);
        io.emit('update_playlist', playlist);
        if (playlist.length === 1) {
            currentSongIndex = 0;
            io.emit('change_song', { index: 0, videoId: playlist[0].id });
        }
    });

    // ★追加: モード切替
    socket.on('toggle_mode', (mode) => {
        if (mode === 'loop') isLoop = !isLoop;
        if (mode === 'shuffle') isShuffle = !isShuffle;
        // 全員に新しい状態を通知
        io.emit('mode_update', { isLoop, isShuffle });
    });

    // 再生・停止・スキップ操作
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
                playNextSong(); // ★ロジックを共通関数化
                break;
            case 'prev':
                if (currentSongIndex > 0) {
                    currentSongIndex--;
                    isPlaying = true;
                    io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
                }
                break;
        }
    });

    socket.on('seek', (time) => {
        io.emit('sync_seek', time);
    });

    socket.on('play_specific', (index) => {
        if (index >= 0 && index < playlist.length) {
            currentSongIndex = index;
            isPlaying = true;
            io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
        }
    });

    socket.on('edit_list', (data) => {
        const { action, index } = data;
        if (action === 'delete') {
            playlist.splice(index, 1);
            if (index < currentSongIndex) currentSongIndex--;
            if (index === currentSongIndex) {
                isPlaying = false;
                io.emit('sync_action', { type: 'stop' });
            }
        } else if (action === 'up' && index > 0) {
            [playlist[index], playlist[index-1]] = [playlist[index-1], playlist[index]];
            if (currentSongIndex === index) currentSongIndex--;
            else if (currentSongIndex === index - 1) currentSongIndex++;
        } else if (action === 'down' && index < playlist.length - 1) {
            [playlist[index], playlist[index+1]] = [playlist[index+1], playlist[index]];
            if (currentSongIndex === index) currentSongIndex++;
            else if (currentSongIndex === index + 1) currentSongIndex--;
        }
        io.emit('update_playlist', playlist);
        io.emit('update_index', currentSongIndex);
    });

    socket.on('song_ended', () => {
        playNextSong(); // ★ロジックを共通関数化
    });
});

// ★追加: 次の曲を決めるロジック（シャッフル・ループ対応）
function playNextSong() {
    if (playlist.length === 0) return;

    if (isShuffle) {
        // シャッフルON: ランダムな曲を選ぶ（なるべく今の曲以外）
        let nextIndex;
        if (playlist.length > 1) {
            do {
                nextIndex = Math.floor(Math.random() * playlist.length);
            } while (nextIndex === currentSongIndex);
        } else {
            nextIndex = 0;
        }
        currentSongIndex = nextIndex;
        isPlaying = true;
        io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
    } else {
        // 通常モード
        if (currentSongIndex + 1 < playlist.length) {
            // 次の曲へ
            currentSongIndex++;
            isPlaying = true;
            io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
        } else {
            // 最後の曲が終わった時
            if (isLoop) {
                // ループON: 最初に戻る
                currentSongIndex = 0;
                isPlaying = true;
                io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
            } else {
                // ループOFF: 停止
                isPlaying = false;
                io.emit('sync_action', { type: 'stop' });
            }
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
