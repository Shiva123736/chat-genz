
/* =====================================================
   CHANTGENZ v2.0
   Complete Frontend JavaScript
   Compatible with existing Flask backend
===================================================== */

/* =====================================================
   1. API CONFIGURATION
===================================================== */

const BACKEND_ORIGIN = (() => {
    const hostname = window.location.hostname;

    // GitHub Codespaces
    if (hostname.endsWith(".app.github.dev")) {
        const backendHost = hostname.replace(
            /-\d+(?=\.app\.github\.dev$)/,
            "-5000"
        );

        return `${window.location.protocol}//${backendHost}`;
    }

    // Local development
    if (
        hostname === "localhost" ||
        hostname === "127.0.0.1"
    ) {
        return "http://127.0.0.1:5000";
    }

    return window.location.origin;
})();

const API_BASE = `${BACKEND_ORIGIN}/api`;

const TOKEN_KEY = "chantgenz_token";

let currentUser = null;
let currentChatUser = null;
let currentPage = "home";

let searchTimer = null;
let messageSearchTimer = null;


/* =====================================================
   2. HELPER FUNCTIONS
===================================================== */

const $ = selector => document.querySelector(selector);

const $$ = selector => [
    ...document.querySelectorAll(selector)
];

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

function getImageURL(path) {
    if (!path) return "";

    if (/^(https?:|data:)/i.test(path)) {
        return path;
    }

    return BACKEND_ORIGIN +
        (path.startsWith("/") ? path : "/" + path);
}

function getInitials(name = "User") {
    return name.trim().charAt(0).toUpperCase() || "U";
}

function getArray(data, key) {
    if (Array.isArray(data)) return data;

    if (Array.isArray(data?.[key])) {
        return data[key];
    }

    return [];
}

function showToast(message) {
    const toast = $("#toast");

    if (!toast) {
        console.log(message);
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


/* =====================================================
   3. API CONNECTION
===================================================== */

async function apiRequest(endpoint, options = {}) {

    const headers = {
        ...(options.headers || {})
    };

    const token = getToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const isFormData = options.body instanceof FormData;

    if (options.body && !isFormData) {
        headers["Content-Type"] = "application/json";
    }

    const cleanEndpoint = endpoint.startsWith("/")
        ? endpoint
        : `/${endpoint}`;

    let response;

    try {
        response = await fetch(
            `${API_BASE}${cleanEndpoint}`,
            {
                ...options,
                headers
            }
        );

    } catch (error) {
        console.error("API connection error:", error);

        throw new Error(
            "Cannot connect to CHANTGENZ server. Check Flask and port 5000."
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
            data.error ||
            data.message ||
            `Server error: ${response.status}`
        );
    }

    return data;
}


/* =====================================================
   4. AUTHENTICATION VIEW
===================================================== */

function showAuth() {

    const auth = $("#authView");
    const app = $("#appView");

    if (auth) {
        auth.classList.remove("hidden");
        auth.style.display = "";
    }

    if (app) {
        app.classList.add("hidden");
        app.style.display = "none";
    }
}

function showApp() {

    const auth = $("#authView");
    const app = $("#appView");

    if (auth) {
        auth.classList.add("hidden");
        auth.style.display = "none";
    }

    if (app) {
        app.classList.remove("hidden");
        app.style.display = "";
    }

    updateUserInterface();

    navigateTo("home");
}

function updateUserInterface() {

    if (!currentUser) return;

    const name =
        currentUser.name ||
        currentUser.username ||
        "User";

    const username =
        currentUser.username ||
        "user";

    const nameElement = $("#sidebarUsername");
    const handleElement = $("#sidebarHandle");

    if (nameElement) {
        nameElement.textContent = name;
    }

    if (handleElement) {
        handleElement.textContent = "@" + username;
    }

    $$("[data-current-username]").forEach(element => {
        element.textContent = username;
    });
}


/* =====================================================
   5. REGISTER
===================================================== */

async function registerUser(event) {

    event.preventDefault();

    const name = $("#regName")?.value.trim();
    const username = $("#regUsername")?.value.trim().toLowerCase();
    const email = $("#regEmail")?.value.trim().toLowerCase();
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

        if (data.token) {

            saveToken(data.token);

            currentUser = data.user || {};

            await loadCurrentUser();

            showApp();

            showToast("Welcome to CHANTGENZ!");

        } else {

            setStatus(
                status,
                "Account created. Please sign in.",
                true
            );

            const loginInput = $("#loginIdentifier");

            if (loginInput) {
                loginInput.value = email;
            }
        }

    } catch (error) {
        setStatus(status, error.message);
    }
}


/* =====================================================
   6. LOGIN
===================================================== */

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
                identifier,
                password
            })
        });

        if (!data.token) {
            throw new Error("Login token was not returned.");
        }

        saveToken(data.token);

        currentUser = data.user || {};

        await loadCurrentUser();

        showApp();

        showToast("Login successful!");

    } catch (error) {
        setStatus(status, error.message);
    }
}


/* =====================================================
   7. CURRENT USER PROFILE
===================================================== */

async function loadCurrentUser() {

    const data = await apiRequest("/me");

    currentUser = {
        ...(data.user || {}),
        email: data.email || data.user?.email || ""
    };

    updateUserInterface();

    return currentUser;
}


/* =====================================================
   8. LOGOUT
===================================================== */

function logoutUser() {

    clearToken();

    currentUser = null;
    currentChatUser = null;

    showAuth();

    showToast("You have signed out.");
}


/* =====================================================
   9. PAGE NAVIGATION
===================================================== */

const pageTitles = {
    home: "Home",
    explore: "Explore",
    reels: "Reels",
    messages: "Messages",
    notifications: "Notifications",
    profile: "My Profile",
    settings: "Settings"
};

function findPageElement(page) {

    const possibleIds = [
        page + "View",
        page + "Page",
        page
    ];

    for (const id of possibleIds) {

        const element = document.getElementById(id);

        if (element) return element;
    }

    return null;
}

function navigateTo(page) {

    const target = findPageElement(page);

    if (!target) {
        console.error("Page not found:", page);
        showToast("This page is not available.");
        return;
    }

    currentPage = page;

    $$(".nav-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === page
        );
    });

    $$(".page-view").forEach(view => {
        view.classList.remove("active");
        view.classList.add("hidden");
    });

    target.classList.remove("hidden");
    target.classList.add("active");

    const title = $("#pageTitle");

    if (title) {
        title.textContent = pageTitles[page] || page;
    }

    switch (page) {

        case "home":
            loadFeed();
            break;

        case "explore":
            loadExplore();
            break;

        case "messages":
            loadMessagePeople();
            break;

        case "profile":
            loadProfile();
            break;
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =====================================================
   10. LOAD FEED
===================================================== */

async function loadFeed() {

    const feed = $("#feedList");

    if (!feed) return;

    feed.innerHTML = `
        <div class="empty-state">
            <strong>Loading posts...</strong>
            Please wait.
        </div>
    `;

    try {

        const data = await apiRequest("/posts");

        const posts = getArray(data, "posts");

        if (!posts.length) {

            feed.innerHTML = `
                <div class="empty-state">
                    <strong>No posts yet</strong>
                    Be the first to share a moment!
                </div>
            `;

            return;
        }

        feed.innerHTML = posts
            .map(createPostHTML)
            .join("");

    } catch (error) {

        feed.innerHTML = `
            <div class="empty-state">
                <strong>Unable to load feed</strong>
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}


/* =====================================================
   11. CREATE POST HTML
===================================================== */

function createPostHTML(post) {

    const user = post.user || {};

    const name =
        user.name ||
        user.username ||
        "User";

    const username = user.username || "user";

    const caption = post.caption || "";

    const image = getImageURL(post.image_url);

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
                    <small>
                        @${escapeHTML(username)}
                        ${date ? " · " + escapeHTML(date) : ""}
                    </small>
                </div>

            </div>

            ${
                image
                ? `
                    <img
                        class="post-image"
                        src="${escapeHTML(image)}"
                        alt="Post image"
                        loading="lazy"
                        onerror="this.style.display='none'"
                    >
                `
                : ""
            }

            <div class="post-caption">
                ${escapeHTML(caption)}
            </div>

            <div class="post-actions">

                <button type="button" title="Like" disabled>
                    ♡
                </button>

                <button type="button" title="Comment" disabled>
                    ▢
                </button>

                <button
                    type="button"
                    title="Share"
                    data-share-post
                >
                    ↗
                </button>

            </div>

        </article>
    `;
}


/* =====================================================
   12. CREATE POST
===================================================== */

function openPostDialog() {

    const dialog = $("#postDialog");

    if (dialog?.showModal) {
        dialog.showModal();
    } else {
        showToast("Post dialog is unavailable.");
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

    const file = imageInput?.files?.[0];

    const caption = captionInput?.value.trim() || "";

    if (!file) {
        setStatus(status, "Please select an image.");
        return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        setStatus(status, "Choose a PNG, JPG or WEBP image.");
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        setStatus(status, "Image must be smaller than 5 MB.");
        return;
    }

    setStatus(status, "Uploading your post...");

    try {

        const formData = new FormData();

        formData.append("image", file);
        formData.append("caption", caption);

        await apiRequest("/posts", {
            method: "POST",
            body: formData
        });

        $("#postForm")?.reset();

        closePostDialog();

        setStatus(status, "");

        showToast("Post published successfully!");

        navigateTo("home");

    } catch (error) {
        setStatus(status, error.message);
    }
}


/* =====================================================
   13. EXPLORE AND SEARCH USERS
===================================================== */

async function searchUsers() {

    const input = $("#exploreSearch");
    const results = $("#exploreResults");

    if (!input || !results) return;

    const query = input.value.trim();

    if (!query) {
        results.innerHTML = `
            <div class="empty-state">
                <strong>Discover people</strong>
                Search for usernames or names.
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

        const users = getArray(data, "users");

        if (!users.length) {
            results.innerHTML = `
                <div class="empty-state">
                    <strong>No users found</strong>
                    Try another search.
                </div>
            `;
            return;
        }

        results.innerHTML = users.map(user => {

            const name = user.name || user.username || "User";

            const avatar = user.avatar_url
                ? `
                    <img
                        src="${escapeHTML(getImageURL(user.avatar_url))}"
                        alt=""
                    >
                `
                : escapeHTML(getInitials(name));

            return `
                <div class="explore-card">

                    <div class="avatar">
                        ${avatar}
                    </div>

                    <h3>${escapeHTML(name)}</h3>

                    <p>@${escapeHTML(user.username || "")}</p>

                    <p>${escapeHTML(user.bio || "")}</p>

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
                Find people and discover new connections.
            </div>
        `;
    }
}


/* =====================================================
   14. MESSAGE USER SEARCH
===================================================== */

async function loadMessagePeople() {

    const input = $("#messageSearch");
    const people = $("#messagePeople");

    if (!people) return;

    const query = input?.value.trim() || "";

    if (!query) {

        people.innerHTML = `
            <div class="empty-state">
                <strong>Find someone to chat with</strong>
                Enter a username or name to search.
            </div>
        `;

        return;
    }

    people.innerHTML = `
        <div class="empty-state">
            Searching users...
        </div>
    `;

    try {

        const data = await apiRequest(
            `/users/search?q=${encodeURIComponent(query)}`
        );

        const users = getArray(data, "users").filter(user => {
            return String(user.id) !== String(currentUser?.id);
        });

        if (!users.length) {

            people.innerHTML = `
                <div class="empty-state">
                    <strong>No users found</strong>
                    Try another username.
                </div>
            `;

            return;
        }

        people.innerHTML = users.map(user => {

            const name = user.name || user.username || "User";

            const avatar = user.avatar_url
                ? `
                    <img
                        src="${escapeHTML(getImageURL(user.avatar_url))}"
                        alt=""
                    >
                `
                : escapeHTML(getInitials(name));

            return `
                <div
                    class="message-person"
                    data-user-id="${escapeHTML(user.id)}"
                    data-username="${escapeHTML(user.username || "")}"
                    data-name="${escapeHTML(name)}"
                >

                    <div class="avatar">
                        ${avatar}
                    </div>

                    <div>
                        <strong>${escapeHTML(name)}</strong>
                        <small>@${escapeHTML(user.username || "")}</small>
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


/* =====================================================
   15. OPEN CONVERSATION
===================================================== */

async function openChat(user) {

    if (!user?.username) {
        showToast("Invalid user.");
        return;
    }

    currentChatUser = user;

    const header = $("#chatHeader");
    const messages = $("#chatMessages");

    if (header) {
        header.textContent =
            user.name || user.username || "Conversation";
    }

    if (!messages) return;

    messages.innerHTML = `
        <div class="empty-state">Loading messages...</div>
    `;

    try {

        const data = await apiRequest(
            `/messages/${encodeURIComponent(user.username)}`
        );

        const items = getArray(data, "messages");

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

            const mine =
                message.sender === currentUser?.username;

            return `
                <div class="message-bubble ${mine ? "mine" : ""}">
                    ${escapeHTML(message.body || "")}
                </div>
            `;

        }).join("");

        messages.scrollTop = messages.scrollHeight;

    } catch (error) {

        messages.innerHTML = `
            <div class="empty-state">
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}


/* =====================================================
   16. SEND PRIVATE MESSAGE
===================================================== */

async function sendMessage(event) {

    event.preventDefault();

    const input = $("#messageInput");

    const body = input?.value.trim();

    if (!body) return;

    if (!currentChatUser?.username) {
        showToast("Select a person first.");
        return;
    }

    try {

        await apiRequest("/messages", {
            method: "POST",

            body: JSON.stringify({
                recipient_username: currentChatUser.username,
                body
            })
        });

        input.value = "";

        await openChat(currentChatUser);

    } catch (error) {
        showToast(error.message);
    }
}


/* =====================================================
   17. PROFILE
===================================================== */

async function loadProfile() {

    const profile = $("#profileContent");

    if (!profile || !currentUser) return;

    const name =
        currentUser.name ||
        currentUser.username ||
        "User";

    const username = currentUser.username || "user";

    const avatar = currentUser.avatar_url
        ? `
            <img
                src="${escapeHTML(getImageURL(currentUser.avatar_url))}"
                alt=""
            >
        `
        : escapeHTML(getInitials(name));

    profile.innerHTML = `
        <div class="profile-header">

            <div class="avatar large">
                ${avatar}
            </div>

            <div class="profile-info">

                <h2>${escapeHTML(name)}</h2>

                <p>@${escapeHTML(username)}</p>

                <p>
                    ${escapeHTML(
                        currentUser.bio ||
                        "Welcome to my CHANTGENZ profile."
                    )}
                </p>

                <div class="profile-stats">

                    <div>
                        <strong id="profilePostCount">0</strong>
                        <small>Posts</small>
                    </div>

                    <div>
                        <strong>—</strong>
                        <small>Followers</small>
                    </div>

                    <div>
                        <strong>—</strong>
                        <small>Following</small>
                    </div>

                </div>

                <button
                    type="button"
                    class="secondary-btn"
                    id="profileEditButton"
                >
                    Edit Profile
                </button>

            </div>

        </div>

        <div class="section-heading">
            <h2>Your Posts</h2>
        </div>

        <div id="profilePosts" class="feed-list">
            <div class="empty-state">
                Loading your posts...
            </div>
        </div>
    `;

    $("#profileEditButton")?.addEventListener(
        "click",
        editProfile
    );

    await loadUserPosts(username);
}


async function loadUserPosts(username) {

    const postsContainer = $("#profilePosts");

    if (!postsContainer) return;

    try {

        const data = await apiRequest(
            `/posts/user/${encodeURIComponent(username)}`
        );

        const posts = getArray(data, "posts");

        const count = $("#profilePostCount");

        if (count) {
            count.textContent = posts.length;
        }

        if (!posts.length) {

            postsContainer.innerHTML = `
                <div class="empty-state">
                    <strong>No posts yet</strong>
                    Your posts will appear here.
                </div>
            `;

            return;
        }

        postsContainer.innerHTML = posts
            .map(createPostHTML)
            .join("");

    } catch (error) {

        postsContainer.innerHTML = `
            <div class="empty-state">
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}


/* =====================================================
   18. EDIT PROFILE
===================================================== */

async function editProfile() {

    if (!currentUser) return;

    const name = prompt(
        "Enter your display name:",
        currentUser.name || ""
    );

    if (name === null) return;

    const bio = prompt(
        "Enter your profile bio:",
        currentUser.bio || ""
    );

    if (bio === null) return;

    try {

        const data = await apiRequest("/me", {
            method: "PATCH",

            body: JSON.stringify({
                name: name.trim(),
                bio: bio.trim()
            })
        });

        currentUser = data.user || currentUser;

        updateUserInterface();

        await loadProfile();

        showToast("Profile updated!");

    } catch (error) {
        showToast(error.message);
    }
}


/* =====================================================
   19. SETTINGS
===================================================== */

function privacySettings() {

    showToast(
        "Advanced privacy controls are not available in your current backend."
    );
}

function securitySettings() {

    showToast(
        "Two-factor authentication is not available in your current backend."
    );
}

function toggleTheme() {

    document.body.classList.toggle("light-theme");

    const light =
        document.body.classList.contains("light-theme");

    localStorage.setItem(
        "chantgenz_theme",
        light ? "light" : "dark"
    );

    showToast(
        light ? "Light theme selected." : "Dark theme selected."
    );
}

function loadTheme() {

    const theme = localStorage.getItem("chantgenz_theme");

    document.body.classList.toggle(
        "light-theme",
        theme === "light"
    );
}


/* =====================================================
   20. SHARE POST
===================================================== */

async function sharePost(event) {

    const button = event.target.closest("[data-share-post]");

    if (!button) return;

    const post = button.closest(".post-card");

    if (!post) return;

    const text = post.querySelector(".post-caption")?.textContent || "";

    try {

        if (navigator.share) {

            await navigator.share({
                title: "CHANTGENZ",
                text
            });

        } else if (navigator.clipboard) {

            await navigator.clipboard.writeText(text);

            showToast("Post caption copied!");

        } else {

            showToast("Sharing is not supported in this browser.");

        }

    } catch (error) {

        if (error.name !== "AbortError") {
            showToast("Unable to share this post.");
        }
    }
}


/* =====================================================
   21. EVENT LISTENERS
===================================================== */

function setupEventListeners() {

    // Login
    $("#loginForm")?.addEventListener(
        "submit",
        loginUser
    );

    // Registration
    $("#registerForm")?.addEventListener(
        "submit",
        registerUser
    );

    // Navigation
    $$(".nav-btn").forEach(button => {

        button.addEventListener("click", () => {

            const page = button.dataset.view;

            if (page) {
                navigateTo(page);
            }

        });

    });

    // Logout
    $("#logoutBtn")?.addEventListener(
        "click",
        logoutUser
    );

    // Create post
    $("#createPostBtn")?.addEventListener(
        "click",
        openPostDialog
    );

    $("#closePost")?.addEventListener(
        "click",
        closePostDialog
    );

    $("#postForm")?.addEventListener(
        "submit",
        createPost
    );

    // Explore search
    $("#exploreSearch")?.addEventListener("input", () => {

        clearTimeout(searchTimer);

        searchTimer = setTimeout(
            searchUsers,
            400
        );

    });

    // Message search
    $("#messageSearch")?.addEventListener("input", () => {

        clearTimeout(messageSearchTimer);

        messageSearchTimer = setTimeout(
            loadMessagePeople,
            400
        );

    });

    // Select message user
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
    $("#messageForm")?.addEventListener(
        "submit",
        sendMessage
    );

    // Share posts
    $("#feedList")?.addEventListener(
        "click",
        sharePost
    );

    $("#profileContent")?.addEventListener(
        "click",
        sharePost
    );

    // Settings
    $("#privacyBtn")?.addEventListener(
        "click",
        privacySettings
    );

    $("#securityBtn")?.addEventListener(
        "click",
        securitySettings
    );

    $("#themeBtn")?.addEventListener(
        "click",
        toggleTheme
    );
}


/* =====================================================
   22. START APPLICATION
===================================================== */

async function startApp() {

    setupEventListeners();

    loadTheme();

    console.log("CHANTGENZ frontend started.");
    console.log("API endpoint:", API_BASE);

    if (!getToken()) {

        showAuth();

        return;
    }

    try {

        await loadCurrentUser();

        showApp();

    } catch (error) {

        console.error("Session error:", error);

        clearToken();

        showAuth();

        showToast(
            "Your session expired. Please sign in again."
        );
    }
}


/* =====================================================
   23. APPLICATION INITIALIZATION
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    startApp
);
