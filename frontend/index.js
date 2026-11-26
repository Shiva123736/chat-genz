
/* =========================================
   CHANTGENZ v2.0
   Frontend JavaScript
========================================= */

// Change this when using GitHub Codespaces.
// Example: https://YOUR-BACKEND-CODESPACE-5000.app.github.dev
const API_BASE = "http://127.0.0.1:5000/api";

const TOKEN_KEY = "chantgenz_token";

let currentUser = null;
let currentChatUser = null;
let currentPage = "home";

// -----------------------------------------
// BASIC HELPERS
// -----------------------------------------

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function showToast(message) {
    const toast = $("#toast");

    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function setStatus(element, message, success = false) {
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("success", success);
}

async function apiRequest(endpoint, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    if (!(options.body instanceof FormData) && options.body) {
        headers["Content-Type"] = "application/json";
    }

    const token = getToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
        response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Cannot connect to the server. Check that the Flask backend is running and API_BASE is correct."
        );
    }

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            data.msg ||
            `Server error (${response.status})`
        );
    }

    return data;
}

function getArray(data, keys = []) {
    if (Array.isArray(data)) return data;

    for (const key of keys) {
        if (Array.isArray(data?.[key])) {
            return data[key];
        }
    }

    return [];
}

function getInitials(name = "User") {
    return name.trim().charAt(0).toUpperCase() || "U";
}

// -----------------------------------------
// SHOW / HIDE APPLICATION
// -----------------------------------------

function showAuth() {
    $("#authView")?.classList.remove("hidden");
    $("#appView")?.classList.add("hidden");

    if ($("#authView")) {
        $("#authView").style.display = "";
    }

    if ($("#appView")) {
        $("#appView").style.display = "none";
    }
}

function showApp() {
    $("#authView")?.classList.add("hidden");
    $("#appView")?.classList.remove("hidden");

    if ($("#authView")) {
        $("#authView").style.display = "none";
    }

    if ($("#appView")) {
        $("#appView").style.display = "";
    }

    updateUserInterface();
    navigateTo("home");
}

function updateUserInterface() {
    const name = currentUser?.name ||
                 currentUser?.username ||
                 "CHANTGENZ User";

    const username = currentUser?.username || "user";

    const nameElement = $("#sidebarUsername");
    const usernameElement = $("#sidebarHandle");

    if (nameElement) nameElement.textContent = name;
    if (usernameElement) usernameElement.textContent = `@${username}`;

    const userNameElements = $$("[data-current-username]");

    userNameElements.forEach(element => {
        element.textContent = username;
    });
}

// -----------------------------------------
// LOGIN
// -----------------------------------------

async function loginUser(event) {
    event.preventDefault();

    const identifier = $("#loginIdentifier")?.value.trim();
    const password = $("#loginPassword")?.value;

    const status = $("#loginStatus");

    if (!identifier || !password) {
        setStatus(status, "Enter your username/email and password.");
        return;
    }

    setStatus(status, "Signing in...");

    try {
        const data = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                identifier: identifier,
                username: identifier,
                email: identifier,
                password: password
            })
        });

        const token = data.access_token ||
                      data.token ||
                      data.accessToken;

        if (!token) {
            throw new Error("The server did not return a login token.");
        }

        saveToken(token);

        currentUser = data.user || data;

        setStatus(status, "Login successful!", true);

        await loadCurrentUser();
        showApp();
        showToast("Welcome back!");

    } catch (error) {
        setStatus(status, error.message);
    }
}

// -----------------------------------------
// REGISTER
// -----------------------------------------

async function registerUser(event) {
    event.preventDefault();

    const name = $("#regName")?.value.trim();
    const username = $("#regUsername")?.value.trim();
    const email = $("#regEmail")?.value.trim();
    const password = $("#regPassword")?.value;

    const status = $("#registerStatus");

    if (!name || !username || !email || !password) {
        setStatus(status, "Please complete all fields.");
        return;
    }

    if (password.length < 8) {
        setStatus(status, "Password must contain at least 8 characters.");
        return;
    }

    setStatus(status, "Creating your account...");

    try {
        const data = await apiRequest("/auth/register", {
            method: "POST",
            body: JSON.stringify({
                name,
                username,
                email,
                password
            })
        });

        const token = data.access_token ||
                      data.token ||
                      data.accessToken;

        if (token) {
            saveToken(token);
            currentUser = data.user || data;
            await loadCurrentUser();
            showApp();
            showToast("Your account has been created!");
        } else {
            setStatus(
                status,
                "Account created. Please sign in.",
                true
            );

            $("#loginIdentifier").value = email;

            $("#loginForm")?.scrollIntoView({
                behavior: "smooth"
            });
        }

    } catch (error) {
        setStatus(status, error.message);
    }
}

// -----------------------------------------
// LOAD CURRENT USER
// -----------------------------------------

async function loadCurrentUser() {
    try {
        const data = await apiRequest("/me");

        currentUser = data.user || data;

        updateUserInterface();

    } catch (error) {
        console.error("Could not load profile:", error);
        throw error;
    }
}

// -----------------------------------------
// LOGOUT
// -----------------------------------------

function logoutUser() {
    clearToken();
    currentUser = null;
    currentChatUser = null;

    showAuth();
    showToast("You have signed out.");
}

// -----------------------------------------
// NAVIGATION
// -----------------------------------------

function navigateTo(page) {
    currentPage = page;

    $$(".nav-link").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === page
        );
    });

    $$(".page-view").forEach(view => {
        view.classList.remove("active");
    });

    // Supports common page ID naming styles.
    const possibleIds = [
        `${page}View`,
        `${page}Page`,
        page
    ];

    let target = null;

    for (const id of possibleIds) {
        target = document.getElementById(id);
        if (target) break;
    }

    if (target) {
        target.classList.add("active");
    }

    const title = $("#pageTitle");

    if (title) {
        const titles = {
            home: "Home",
            explore: "Explore",
            reels: "Reels",
            messages: "Messages",
            notifications: "Notifications",
            profile: "My Profile",
            settings: "Settings"
        };

        title.textContent = titles[page] || page;
    }

    if (page === "home") loadFeed();
    if (page === "explore") loadExplore();
    if (page === "messages") loadMessagePeople();
    if (page === "profile") loadProfile();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// -----------------------------------------
// FEED / POSTS
// -----------------------------------------

async function loadFeed() {
    const feed = $("#feedList");

    if (!feed) return;

    feed.innerHTML = `
        <div class="empty-state">
            <strong>Loading your feed...</strong>
            Please wait.
        </div>
    `;

    try {
        const data = await apiRequest("/posts");

        const posts = getArray(data, ["posts", "items", "data"]);

        if (!posts.length) {
            feed.innerHTML = `
                <div class="empty-state">
                    <strong>Your feed is ready!</strong>
                    No posts yet. Create the first post.
                </div>
            `;
            return;
        }

        feed.innerHTML = posts.map(createPostHTML).join("");

    } catch (error) {
        feed.innerHTML = `
            <div class="empty-state">
                <strong>Unable to load posts</strong>
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}

function createPostHTML(post) {
    const user = post.user || post.author || {};

    const name = user.name ||
                 user.username ||
                 post.username ||
                 "CHANTGENZ User";

    const username = user.username ||
                     post.username ||
                     "user";

    const caption = post.caption ||
                    post.content ||
                    "";

    const image = post.image_url ||
                  post.image ||
                  post.media_url ||
                  "";

    const date = post.created_at
        ? new Date(post.created_at).toLocaleString()
        : "";

    return `
        <article class="post-card">
            <div class="post-header">
                <div class="avatar">
                    ${escapeHTML(getInitials(name))}
                </div>

                <div>
                    <strong>${escapeHTML(name)}</strong>
                    <small>@${escapeHTML(username)} ${date ? "· " + escapeHTML(date) : ""}</small>
                </div>
            </div>

            ${
                image
                ? `<img class="post-image"
                        src="${escapeHTML(image)}"
                        alt="Post image"
                        loading="lazy"
                        onerror="this.style.display='none'">`
                : ""
            }

            <div class="post-caption">
                ${escapeHTML(caption)}
            </div>

            <div class="post-actions">
                <button type="button" title="Like" aria-label="Like">♡</button>
                <button type="button" title="Comment" aria-label="Comment">▢</button>
                <button type="button" title="Share" aria-label="Share">↗</button>
            </div>
        </article>
    `;
}

// -----------------------------------------
// CREATE POST
// -----------------------------------------

function openPostDialog() {
    const dialog = $("#postDialog");

    if (dialog?.showModal) {
        dialog.showModal();
    } else {
        showToast("Post dialog is not available.");
    }
}

function closePostDialog() {
    $("#postDialog")?.close();
}

async function createPost(event) {
    event.preventDefault();

    const imageInput = $("#postImage");
    const captionInput = $("#postCaption");
    const status = $("#postStatus");

    const caption = captionInput?.value.trim() || "";
    const file = imageInput?.files?.[0];

    if (!caption && !file) {
        setStatus(status, "Add a caption or choose an image.");
        return;
    }

    setStatus(status, "Publishing post...");

    try {
        const formData = new FormData();

        formData.append("caption", caption);

        if (file) {
            formData.append("image", file);
        }

        await apiRequest("/posts", {
            method: "POST",
            body: formData
        });

        closePostDialog();

        $("#postForm")?.reset();

        setStatus(status, "", true);

        showToast("Your post was published!");

        navigateTo("home");

    } catch (error) {
        setStatus(status, error.message);
    }
}

// -----------------------------------------
// EXPLORE / USER SEARCH
// -----------------------------------------

async function searchUsers() {
    const input = $("#exploreSearch");
    const results = $("#exploreResults");

    if (!input || !results) return;

    const query = input.value.trim();

    if (!query) {
        results.innerHTML = `
            <div class="empty-state">
                <strong>Discover people</strong>
                Enter a username to search.
            </div>
        `;
        return;
    }

    results.innerHTML = `
        <div class="empty-state">Searching...</div>
    `;

    try {
        const data = await apiRequest(
            `/users/search?q=${encodeURIComponent(query)}`
        );

        const users = getArray(data, ["users", "results", "data"]);

        if (!users.length) {
            results.innerHTML = `
                <div class="empty-state">
                    <strong>No users found</strong>
                    Try another username.
                </div>
            `;
            return;
        }

        results.innerHTML = users.map(user => {
            const name = user.name || user.username || "User";
            const username = user.username || "user";

            return `
                <div class="explore-card">
                    <div class="avatar">
                        ${escapeHTML(getInitials(name))}
                    </div>
                    <h3>${escapeHTML(name)}</h3>
                    <p>@${escapeHTML(username)}</p>
                </div>
            `;
        }).join("");

    } catch (error) {
        results.innerHTML = `
            <div class="empty-state">
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}

function loadExplore() {
    const results = $("#exploreResults");

    if (results && !results.innerHTML.trim()) {
        results.innerHTML = `
            <div class="empty-state">
                <strong>Explore CHANTGENZ</strong>
                Search for people and discover new connections.
            </div>
        `;
    }
}

// -----------------------------------------
// MESSAGES
// -----------------------------------------

async function loadMessagePeople() {
    const people = $("#messagePeople");

    if (!people) return;

    people.innerHTML = `
        <div class="empty-state">Loading people...</div>
    `;

    try {
        const data = await apiRequest("/users/search?q=");

        const users = getArray(data, ["users", "results", "data"]);

        if (!users.length) {
            people.innerHTML = `
                <div class="empty-state">
                    No users available yet.
                </div>
            `;
            return;
        }

        people.innerHTML = users.map(user => {
            const name = user.name || user.username || "User";
            const username = user.username || "user";
            const id = user.id;

            return `
                <div class="message-person"
                     data-user-id="${escapeHTML(id)}"
                     data-username="${escapeHTML(username)}"
                     data-name="${escapeHTML(name)}">
                    <div class="avatar">
                        ${escapeHTML(getInitials(name))}
                    </div>
                    <div>
                        <strong>${escapeHTML(name)}</strong>
                        <small>@${escapeHTML(username)}</small>
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {
        people.innerHTML = `
            <div class="empty-state">
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}

async function openChat(user) {
    currentChatUser = user;

    const header = $("#chatHeader");
    const messages = $("#chatMessages");

    if (header) {
        header.textContent = user.name || user.username || "Chat";
    }

    if (messages) {
        messages.innerHTML = `
            <div class="empty-state">Loading conversation...</div>
        `;
    }

    try {
        const data = await apiRequest(
            `/messages/${encodeURIComponent(user.id)}`
        );

        const items = getArray(data, ["messages", "items", "data"]);

        if (!messages) return;

        if (!items.length) {
            messages.innerHTML = `
                <div class="empty-state">
                    <strong>Start a conversation</strong>
                    Send your first message.
                </div>
            `;
            return;
        }

        messages.innerHTML = items.map(message => {
            const senderId = message.sender_id ??
                             message.sender?.id;

            const mine = String(senderId) === String(currentUser?.id);

            return `
                <div class="message-bubble ${mine ? "mine" : ""}">
                    ${escapeHTML(message.content || message.message || "")}
                </div>
            `;
        }).join("");

        messages.scrollTop = messages.scrollHeight;

    } catch (error) {
        if (messages) {
            messages.innerHTML = `
                <div class="empty-state">
                    ${escapeHTML(error.message)}
                </div>
            `;
        }
    }
}

async function sendMessage(event) {
    event.preventDefault();

    const input = $("#messageInput");
    const content = input?.value.trim();

    if (!content) return;

    if (!currentChatUser?.id) {
        showToast("Choose a person before sending a message.");
        return;
    }

    try {
        await apiRequest("/messages", {
            method: "POST",
            body: JSON.stringify({
                receiver_id: currentChatUser.id,
                content: content
            })
        });

        input.value = "";

        await openChat(currentChatUser);

    } catch (error) {
        showToast(error.message);
    }
}

// -----------------------------------------
// PROFILE
// -----------------------------------------

async function loadProfile() {
    const profile = $("#profileContent");

    if (!profile) return;

    if (!currentUser) {
        profile.innerHTML = `
            <div class="empty-state">Profile information unavailable.</div>
        `;
        return;
    }

    const name = currentUser.name ||
                 currentUser.username ||
                 "CHANTGENZ User";

    const username = currentUser.username || "user";

    profile.innerHTML = `
        <div class="profile-header">
            <div class="avatar large">
                ${escapeHTML(getInitials(name))}
            </div>

            <div class="profile-info">
                <h2>${escapeHTML(name)}</h2>
                <p>@${escapeHTML(username)}</p>
                <p>${escapeHTML(currentUser.bio || "Welcome to my CHANTGENZ profile.")}</p>

                <div class="profile-stats">
                    <div>
                        <strong>${Number(currentUser.posts_count || 0)}</strong>
                        <small>Posts</small>
                    </div>
                    <div>
                        <strong>${Number(currentUser.followers_count || 0)}</strong>
                        <small>Followers</small>
                    </div>
                    <div>
                        <strong>${Number(currentUser.following_count || 0)}</strong>
                        <small>Following</small>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// -----------------------------------------
// SETTINGS
// -----------------------------------------

function editProfile() {
    showToast("Profile editing will be connected in the next development stage.");
}

function privacySettings() {
    showToast("Privacy settings are planned for the next stage.");
}

function securitySettings() {
    showToast("Security settings are planned for the next stage.");
}

function toggleTheme() {
    document.body.classList.toggle("light-theme");

    const enabled = document.body.classList.contains("light-theme");

    localStorage.setItem("chantgenz_theme", enabled ? "light" : "dark");

    showToast(enabled ? "Light theme selected." : "Dark theme selected.");
}

function loadTheme() {
    const theme = localStorage.getItem("chantgenz_theme");

    if (theme === "light") {
        document.body.classList.add("light-theme");
    }
}

// -----------------------------------------
// EVENT LISTENERS
// -----------------------------------------

function setupEventListeners() {

    // Authentication
    $("#loginForm")?.addEventListener("submit", loginUser);
    $("#registerForm")?.addEventListener("submit", registerUser);

    // Navigation
    $$(".nav-link").forEach(button => {
        button.addEventListener("click", () => {
            navigateTo(button.dataset.view);
        });
    });

    // Logout
    $("#logoutBtn")?.addEventListener("click", logoutUser);

    // Create post
    $("#createPostBtn")?.addEventListener("click", openPostDialog);
    $("#closePost")?.addEventListener("click", closePostDialog);
    $("#postForm")?.addEventListener("submit", createPost);

    // Explore search
    $("#exploreSearch")?.addEventListener("input", () => {
        clearTimeout(searchUsers.timer);
        searchUsers.timer = setTimeout(searchUsers, 400);
    });

    // Message search
    $("#messageSearch")?.addEventListener("input", () => {
        const query = $("#messageSearch").value.toLowerCase();

        $$("#messagePeople .message-person").forEach(person => {
            person.style.display =
                person.textContent.toLowerCase().includes(query)
                ? "flex"
                : "none";
        });
    });

    // Select a person for messaging
    $("#messagePeople")?.addEventListener("click", event => {
        const person = event.target.closest(".message-person");

        if (!person) return;

        openChat({
            id: person.dataset.userId,
            name: person.dataset.name,
            username: person.dataset.username
        });
    });

    // Send message
    $("#messageForm")?.addEventListener("submit", sendMessage);

    // Settings
    $("#editProfileBtn")?.addEventListener("click", editProfile);
    $("#privacyBtn")?.addEventListener("click", privacySettings);
    $("#securityBtn")?.addEventListener("click", securitySettings);
    $("#themeBtn")?.addEventListener("click", toggleTheme);
}

// -----------------------------------------
// START APPLICATION
// -----------------------------------------

async function startApp() {
    setupEventListeners();
    loadTheme();

    if (!getToken()) {
        showAuth();
        return;
    }

    try {
        await loadCurrentUser();
        showApp();
    } catch (error) {
        console.error(error);
        clearToken();
        showAuth();
        showToast("Please sign in again.");
    }
}

document.addEventListener("DOMContentLoaded", startApp);
