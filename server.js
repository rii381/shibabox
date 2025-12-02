const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// データ管理（曲リスト）
let playlist = []; 
let currentSongIndex = 0;
let isPlaying = false;

io.on('connection', (socket) => {
    // 接続時に現在の状態を送信
    socket.emit('init_state', {
        playlist,
        currentSongIndex,
        isPlaying
    });

    // 曲の追加（曲名・ユーザー名も一緒に保存）
    socket.on('add_song', (data) => {
        // dataの中身: { id: '...', title: '曲名', user: 'ユーザー名' }
        playlist.push(data);
        io.emit('update_playlist', playlist);
        
        // もしリストが空だったなら、追加された曲をセット
        if (playlist.length === 1) {
            currentSongIndex = 0;
            io.emit('change_song', { index: 0, videoId: playlist[0].id });
        }
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
                if (currentSongIndex + 1 < playlist.length) {
                    currentSongIndex++;
                    isPlaying = true;
                    io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
                }
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

    // リストの曲をタップして再生
    socket.on('play_specific', (index) => {
        if (index >= 0 && index < playlist.length) {
            currentSongIndex = index;
            isPlaying = true;
            io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
        }
    });

    // リスト編集（並べ替え・削除）
    socket.on('edit_list', (data) => {
        const { action, index } = data;
        
        if (action === 'delete') {
            playlist.splice(index, 1);
            // 再生中の曲より前を消したらインデックスをずらす
            if (index < currentSongIndex) currentSongIndex--;
            // 再生中の曲そのものを消したら止める
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

    // 曲が終わったとき
    socket.on('song_ended', () => {
        if (currentSongIndex + 1 < playlist.length) {
            currentSongIndex++;
            isPlaying = true;
            io.emit('change_song', { index: currentSongIndex, videoId: playlist[currentSongIndex].id });
        } else {
            isPlaying = false;
            io.emit('sync_action', { type: 'stop' });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
