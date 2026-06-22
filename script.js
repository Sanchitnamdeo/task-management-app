// Server ke Socket IO dynamic integration node initialization
const socket = io(); 

// --- 1. DOM SELECTORS ---
const loginScreen = document.getElementById('loginForm');
const registerScreen = document.getElementById('registerForm');
const dashboardScreen = document.getElementById('dashboard');

const navRegister = document.getElementById('navRegister');
const navLogin = document.getElementById('navLogin');
const logoutBtn = document.getElementById('navLogout');

// Auth Form Nodes
const logFormNode = document.getElementById('logForm');
const regFormNode = document.getElementById('regForm');

// Input targets
const usernameInput = document.getElementById('logUsername');
const passwordInput = document.getElementById('logPassword');
const loginError = document.getElementById('logMessage');

const regUsernameInput = document.getElementById('regUsername');
const regEmailInput = document.getElementById('regEmail');
const regPasswordInput = document.getElementById('regPassword');
const regError = document.getElementById('regMessage');

const userGreeting = document.getElementById('welcomeTitle');

// CRUD Task Controls
const taskInput = document.getElementById('task-input');
const addBtn = document.getElementById('add-btn');
const taskList = document.getElementById('task-list');
const taskCount = document.getElementById('task-count');
const syncStatus = document.getElementById('sync-status');

let tasks = [];

// --- 2. LAYOUT VISIBILITY MANAGER ---
function showForm(type) {
    if (!loginScreen || !registerScreen || !dashboardScreen) return;

    loginScreen.classList.add('hidden');
    registerScreen.classList.add('hidden');
    dashboardScreen.classList.add('hidden');
    
    if(type === 'register') {
        registerScreen.classList.remove('hidden');
    } else if(type === 'login') {
        loginScreen.classList.remove('hidden');
    } else if(type === 'dashboard') {
        dashboardScreen.classList.remove('hidden');
    }
}

function showDashboard() {
    const user = sessionStorage.getItem('activeUser');
    if (!user) return showForm('login');

    if (userGreeting) userGreeting.innerText = `Workspace Overview: ${user}`;
    
    if (navRegister) navRegister.classList.add('hidden');
    if (navLogin) navLogin.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    
    showForm('dashboard');
    if (socket) socket.emit("getInitialTasks", user);
}

function logout() {
    sessionStorage.removeItem('activeUser');
    window.location.reload(); 
}

// --- 3. SOCKET WEBSOCKET EVENT HOOKS ---
if (socket) {
    socket.on("connect", () => {
        if(syncStatus) {
            syncStatus.innerText = "⚡ Real-time Connection Online";
            syncStatus.style.color = "#10b981";
        }
        console.log("✅ Socket connected");
    });

    socket.on("authError", (msg) => {
        if (!registerScreen.classList.contains('hidden')) {
            regError.innerText = "❌ " + msg;
            regError.className = "message error";
        } else {
            loginError.innerText = "❌ " + msg;
            loginError.className = "message error";
        }
        console.log("❌ Auth Error:", msg);
    });

    socket.on("authSuccess", (data) => {
        regError.innerText = "✅ " + data.message;
        regError.className = "message success";
        console.log("✅ Auth Success:", data.message);
        setTimeout(() => showForm('login'), 1500);
    });

    socket.on("loginSuccess", (user) => {
        sessionStorage.setItem('activeUser', user.username);
        console.log("✅ Login Success:", user.username);
        showDashboard(); 
    });

    socket.on("updateTasks", (serverTasks) => {
        console.log("📥 Received tasks:", serverTasks);
        tasks = serverTasks;
        renderTasks();
    });

    socket.on("disconnect", () => {
        if(syncStatus) {
            syncStatus.innerText = "❌ Pipeline Offline. Reconnecting...";
            syncStatus.style.color = "#ef4444";
        }
        console.log("❌ Socket disconnected");
    });
}

// --- 4. DATA ENGINE DISPATCHERS (CRUD OPERATIONS) ---
function sendAddTask() {
    const txt = taskInput.value.trim();
    const user = sessionStorage.getItem('activeUser');
    
    if (!txt || !user) {
        console.log("⚠️ Cannot add task: Missing text or user");
        return; 
    }
    
    console.log("📤 Sending new task:", { text: txt, username: user });
    if (socket) socket.emit("newTask", { text: txt, username: user }); 
    taskInput.value = '';
}

let toggleTimeout = null;

window.toggleTask = function(id) {
    if (toggleTimeout) {
        clearTimeout(toggleTimeout);
        toggleTimeout = null;
    }
    
    const user = sessionStorage.getItem('activeUser');
    console.log("🔄 Toggling task:", id);
    if (socket) socket.emit("toggleTask", { id: id, username: user });
};

window.deleteTask = function(id) {
    const user = sessionStorage.getItem('activeUser');
    console.log("🗑️ Deleting task:", id);
    if (socket) socket.emit("deleteTask", { id: id, username: user });
};

window.startEdit = function(id, currentText, element) {
    const user = sessionStorage.getItem('activeUser');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-edit-input';
    input.value = currentText;
    element.replaceWith(input);
    input.focus();

    function saveChange() {
        const newText = input.value.trim();
        if (newText && newText !== currentText) {
            console.log("✏️ Editing task:", { id, text: newText, username: user });
            if (socket) socket.emit("editTask", { id: id, text: newText, username: user });
        } else {
            renderTasks(); 
        }
    }
    input.addEventListener('blur', saveChange);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveChange(); });
};

function renderTasks() {
    if(!taskList) return;
    taskList.innerHTML = '';
    
    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = `task-item ${t.completed ? 'completed' : ''}`;
        li.innerHTML = `
            <span class="task-text">${t.text}</span>
            <button class="delete-btn" onclick="deleteTask(${t.id})">Delete</button>
        `;
        
        const taskTextNode = li.querySelector('.task-text');
        let clickCount = 0;
        let clickTimer = null;
        
        taskTextNode.addEventListener('click', (e) => {
            clickCount++;
            
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    toggleTask(t.id);
                    clickCount = 0;
                }, 300);
            } else if (clickCount >= 2) {
                clearTimeout(clickTimer);
                startEdit(t.id, t.text, taskTextNode);
                clickCount = 0;
            }
        });
        
        taskList.appendChild(li);
    });
    
    const remaining = tasks.filter(t => !t.completed).length;
    if(taskCount) taskCount.innerText = `${remaining} mission critical task${remaining !== 1 ? 's' : ''} pending`;
}

// --- 5. EVENT LISTENERS ---
if(logFormNode) {
    logFormNode.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        console.log("🔐 Login attempt:", username);
        if (socket) socket.emit("loginUser", { username, password });
    });
}

if(regFormNode) {
    regFormNode.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = regUsernameInput.value.trim();
        const email = regEmailInput.value.trim();
        const password = regPasswordInput.value.trim();
        console.log("📝 Register attempt:", username);
        if (socket) socket.emit("registerUser", { username, email, password });
    });
}

if(addBtn) addBtn.addEventListener('click', sendAddTask);
if(taskInput) taskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAddTask(); });

// Local system lifecycle trigger
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 App initialized");
    if (sessionStorage.getItem('activeUser')) showDashboard();
    else showForm('login');
});
