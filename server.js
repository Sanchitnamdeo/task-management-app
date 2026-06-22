const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize real-time WebSocket layer
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database('./task_app_final.db', (err) => {
    if (err) console.error("Database connection failure:", err.message);
    else console.log("Connected to Final SQLite Database.");
});

// Setup relational integrity columns schemas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        username TEXT NOT NULL
    )`);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- REAL-TIME WEBSOCKET DATA PIPELINES ---
io.on('connection', (socket) => {
    console.log(`Pipeline attached securely: ${socket.id}`);

    // Handle User Registrations
    socket.on('registerUser', async (data) => {
        const { username, email, password } = data;
        if (!username || !email || !password) return socket.emit('authError', "All fields are required.");

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, [username, email, hashedPassword], function(err) {
                if (err) {
                    if (err.message.includes("users.username") || err.message.includes("UNIQUE constraint failed")) {
                        return socket.emit('authError', "This username is already taken.");
                    }
                    if (err.message.includes("users.email")) {
                        return socket.emit('authError', "This email is already registered.");
                    }
                    return socket.emit('authError', "Database transaction failure.");
                }
                return socket.emit('authSuccess', { message: "Account created successfully!" });
            });
        } catch (e) {
            socket.emit('authError', "Server processing error.");
        }
    });

    // Handle Secure Authentication 
    socket.on('loginUser', (data) => {
        const { username, password } = data;
        if (!username || !password) return socket.emit('authError', "Credentials fields missing.");

        db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
            if (err) return socket.emit('authError', "Internal authorization error.");
            if (!user) return socket.emit('authError', "Username does not exist.");

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return socket.emit('authError', "Invalid password entered.");

            socket.join(user.username);
            return socket.emit('loginSuccess', { username: user.username });
        });
    });

    // Push Initialization Bundle
    socket.on('getInitialTasks', (username) => {
        if (!username) return;
        socket.join(username);
        pushSystemTasks(socket, username);
    });

    // Insert Tasks Operation
    socket.on('newTask', (data) => {
        console.log("📝 New Task Request:", data);
        if (!data.username || !data.text) {
            console.log("❌ Missing username or text");
            return;
        }
        db.run(`INSERT INTO tasks (text, username) VALUES (?, ?)`, [data.text, data.username], function(err) {
            if (err) {
                console.log("❌ Task Save Error:", err.message);
            } else {
                console.log("✅ Task saved successfully, ID:", this.lastID);
                broadcastSystemTasks(data.username);
            }
        });
    });

    // Toggle Status Switch
    socket.on('toggleTask', (data) => {
        console.log("🔄 Toggle Task:", data);
        db.run(`UPDATE tasks SET completed = 1 - completed WHERE id = ?`, [data.id], function(err) {
            if (err) {
                console.log("❌ Toggle Error:", err.message);
            } else {
                console.log("✅ Task toggled successfully");
                broadcastSystemTasks(data.username);
            }
        });
    });

    // Overwrite Text Body Updates
    socket.on('editTask', (data) => {
        console.log("✏️ Edit Task:", data);
        db.run(`UPDATE tasks SET text = ? WHERE id = ?`, [data.text, data.id], function(err) {
            if (err) {
                console.log("❌ Edit Error:", err.message);
            } else {
                console.log("✅ Task edited successfully");
                broadcastSystemTasks(data.username);
            }
        });
    });

    // Delete Tasks Operations
    socket.on('deleteTask', (data) => {
        console.log("🗑️ Delete Task:", data);
        db.run(`DELETE FROM tasks WHERE id = ?`, [data.id], function(err) {
            if (err) {
                console.log("❌ Delete Error:", err.message);
            } else {
                console.log("✅ Task deleted successfully");
                broadcastSystemTasks(data.username);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`Pipeline detached: ${socket.id}`);
    });
});

function pushSystemTasks(socket, username) {
    db.all(`SELECT * FROM tasks WHERE username = ?`, [username], (err, rows) => {
        if (!err) {
            const parsedDataset = rows.map(r => ({ id: r.id, text: r.text, completed: !!r.completed }));
            console.log(`📤 Sending ${parsedDataset.length} tasks to user: ${username}`);
            socket.emit('updateTasks', parsedDataset);
        } else {
            console.log("❌ Error fetching tasks:", err.message);
        }
    });
}

function broadcastSystemTasks(username) {
    db.all(`SELECT * FROM tasks WHERE username = ?`, [username], (err, rows) => {
        if (!err) {
            const parsedDataset = rows.map(r => ({ id: r.id, text: r.text, completed: !!r.completed }));
            console.log(`📡 Broadcasting ${parsedDataset.length} tasks to room: ${username}`);
            io.to(username).emit('updateTasks', parsedDataset);
        } else {
            console.log("❌ Error broadcasting tasks:", err.message);
        }
    });
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Task Management System running live via WebSockets on http://localhost:${PORT}`);
});