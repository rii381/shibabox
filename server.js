const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 静的ファイル（CSSやJS）はpublicフォルダから探す
app.use(express.static(path.join(__dirname, 'public')));

// ★重要: どんなURL（例: /drive, /party）でアクセスしても index.html を返す設定
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 部屋ごとのデータを管理する箱
// 例: rooms['drive'] = { playlist: [], ... }
const rooms = {};

io.on('connection', (socket) => {
    
    // ★ 部屋に参加する処理
    socket.on('join_room', (roomId) => {
        // IDがない場合は何もしない
        if (!roomId) return;

        socket.join(roomId); // Socket.ioの機能でグループ分け
        socket.data.roomId = roomId; // この通信がどの部屋か覚えておく

        // まだ部屋がなければ作る（初期化）
        if (!rooms[roomId]) {
            rooms[roomId] = {
                playlist: [],
                currentSongIndex: 0,
                isPlaying: false,
                isLoop: false,
                isShuffle: false
            };
        }

        // その部屋の今の状態を、参加した人にだけ教える
        socket.emit('init_state', rooms[roomId]);
    });

    // --- 以下、操作はすべて「その部屋（roomId）」に対して行う ---

    socket.on('add_song', (data) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room) return;

        room.playlist.push(data);
        io.to(roomId).emit('update_playlist', room.playlist);

        if (room.playlist.length === 1) {
            room.currentSongIndex = 0;
            io.to(roomId).emit('change_song', { index: 0, videoId: room.playlist[0].id });
        }
    });

    socket.on('toggle_mode', (mode) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room) return;

        if (mode === 'loop') room.isLoop = !room.isLoop;
        if (mode === 'shuffle') room.isShuffle = !room.isShuffle;
        io.to(roomId).emit('mode_update', { isLoop: room.isLoop, isShuffle: room.isShuffle });
    });

    socket.on('control', (action) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room) return;

        switch(action.type) {
            case 'play':
                room.isPlaying = true;
                io.to(roomId).emit('sync_action', { type: 'play' });
                break;
            case 'pause':
                room.isPlaying = false;
                io.to(roomId).emit('sync_action', { type: 'pause' });
                break;
            case 'next':
                playNextSong(roomId);
                break;
            case 'prev':
                if (room.currentSongIndex > 0) {
                    room.currentSongIndex--;
                    room.isPlaying = true;
                    io.to(roomId).emit('change_song', { index: room.currentSongIndex, videoId: room.playlist[room.currentSongIndex].id });
                }
                break;
        }
    });

    socket.on('seek', (time) => {
        const roomId = socket.data.roomId;
        if(roomId) io.to(roomId).emit('sync_seek', time);
    });

    socket.on('play_specific', (index) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room) return;

        if (index >= 0 && index < room.playlist.length) {
            room.currentSongIndex = index;
            room.isPlaying = true;
            io.to(roomId).emit('change_song', { index: room.currentSongIndex, videoId: room.playlist[room.currentSongIndex].id });
        }
    });

    socket.on('edit_list', (data) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        if (!room) return;

        const { action, index } = data;
        if (action === 'delete') {
            room.playlist.splice(index, 1);
            if (index < room.currentSongIndex) room.currentSongIndex--;
            if (index === room.currentSongIndex) {
                room.isPlaying = false;
                io.to(roomId).emit('sync_action', { type: 'stop' });
            }
        } else if (action === 'up' && index > 0) {
            [room.playlist[index], room.playlist[index-1]] = [room.playlist[index-1], room.playlist[index]];
            if (room.currentSongIndex === index) room.currentSongIndex--;
            else if (room.currentSongIndex === index - 1) room.currentSongIndex++;
        } else if (action === 'down' && index < room.playlist.length - 1) {
            [room.playlist[index], room.playlist[index+1]] = [room.playlist[index+1], room.playlist[index]];
            if (room.currentSongIndex === index) room.currentSongIndex++;
            else if (room.currentSongIndex === index + 1) room.currentSongIndex--;
        }
        io.to(roomId).emit('update_playlist', room.playlist);
        io.to(roomId).emit('update_index', room.currentSongIndex);
    });

    socket.on('song_ended', () => {
        const roomId = socket.data.roomId;
        if(roomId) playNextSong(roomId);
    });
});

// 次の曲ロジック（部屋ごとのデータを参照するように変更）
function playNextSong(roomId) {
    const room = rooms[roomId];
    if (!room || room.playlist.length === 0) return;

    if (room.isShuffle) {
        let nextIndex;
        if (room.playlist.length > 1) {
            do {
                nextIndex = Math.floor(Math.random() * room.playlist.length);
            } while (nextIndex === room.currentSongIndex);
        } else {
            nextIndex = 0;
        }
        room.currentSongIndex = nextIndex;
        room.isPlaying = true;
        io.to(roomId).emit('change_song', { index: room.currentSongIndex, videoId: room.playlist[room.currentSongIndex].id });
    } else {
        if (room.currentSongIndex + 1 < room.playlist.length) {
            room.currentSongIndex++;
            room.isPlaying = true;
            io.to(roomId).emit('change_song', { index: room.currentSongIndex, videoId: room.playlist[room.currentSongIndex].id });
        } else {
            if (room.isLoop) {
                room.currentSongIndex = 0;
                room.isPlaying = true;
                io.to(roomId).emit('change_song', { index: room.currentSongIndex, videoId: room.playlist[room.currentSongIndex].id });
            } else {
                room.isPlaying = false;
                io.to(roomId).emit('sync_action', { type: 'stop' });
            }
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
