
/* ==================================
   MYVAULT - PERSONAL DOCUMENT MANAGER
   ================================== */

const DB_NAME = "MyVaultDatabase";
const STORE_NAME = "documents";

let db;
let documents = [];
let previewId = null;
let toastTimer;


/* 1. OPEN LOCAL DATABASE */

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = function(event) {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}


/* 2. DATABASE OPERATIONS */

function saveRecord(record) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");

        transaction.objectStore(STORE_NAME).put(record);

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
}

function deleteRecord(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");

        transaction.objectStore(STORE_NAME).delete(id);

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
}

function getAllRecords() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}


/* 3. INITIALIZE WEBSITE */

async function initialize() {
    try {
        db = await openDatabase();

        documents = await getAllRecords();

        const savedTheme = localStorage.getItem("myvaultTheme");

        if (savedTheme === "dark") {
            document.body.classList.add("dark");
        }

        updateThemeButtons();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast("Could not open document storage.");
    }
}


/* 4. HELPERS */

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function getIcon(type) {
    if (type === "application/pdf") return "📕";
    if (type.startsWith("image/")) return "🖼️";
    return "📄";
}

function getExpiryStatus(date) {
    if (!date) return "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(date + "T00:00:00");
    const difference = Math.ceil(
        (expiry - today) / (1000 * 60 * 60 * 24)
    );

    if (difference < 0) return "Expired";
    if (difference === 0) return "Expires today";
    if (difference <= 30) return `Expires in ${difference} days`;

    return "";
}

function formatDate(date) {
    if (!date) return "No expiry date";

    return new Date(date + "T00:00:00").toLocaleDateString();
}

function formatSize(size) {
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";

    return (size / (1024 * 1024)).toFixed(2) + " MB";
}


/* 5. UPLOAD MODAL */

const uploadModal = document.getElementById("uploadModal");

function openUpload() {
    uploadModal.classList.add("show");
}

function closeUpload() {
    uploadModal.classList.remove("show");
    document.getElementById("uploadForm").reset();
}

document.getElementById("mainUpload").onclick = openUpload;
document.getElementById("documentUpload").onclick = openUpload;
document.getElementById("closeUpload").onclick = closeUpload;


/* 6. UPLOAD DOCUMENT */

document.getElementById("uploadForm").addEventListener("submit",
    async function(event) {

        event.preventDefault();

        const name = document.getElementById("docName").value.trim();
        const category = document.getElementById("docCategory").value;
        const file = document.getElementById("docFile").files[0];
        const expiry = document.getElementById("docExpiry").value;
        const description = document.getElementById("docDescription").value.trim();

        if (!file) {
            showToast("Please select a file.");
            return;
        }

        const allowedTypes = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            showToast("Please select a PDF or supported image.");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast("File must be 5 MB or smaller in this prototype.");
            return;
        }

        const record = {
            id: crypto.randomUUID(),
            name,
            category,
            expiry,
            description,
            fileName: file.name,
            type: file.type,
            size: file.size,
            file: file,
            favorite: false,
            shared: false,
            createdAt: new Date().toISOString()
        };

        try {
            await saveRecord(record);

            documents = await getAllRecords();

            closeUpload();
            renderAll();

            showToast("Document uploaded successfully!");
        } catch (error) {
            console.error(error);
            showToast("Upload failed. Browser storage may be full.");
        }
});


/* 7. DOCUMENT CARD */

function createCard(doc) {

    const expiryStatus = getExpiryStatus(doc.expiry);

    return `
    <article class="document-card">

        <div class="doc-top">
            <div class="doc-icon">${getIcon(doc.type)}</div>

            <button class="small-button ${doc.favorite ? "favorite-active" : ""}"
                onclick="toggleFavorite('${doc.id}')">
                ${doc.favorite ? "★" : "☆"}
            </button>
        </div>

        <h3 class="doc-name">${escapeHTML(doc.name)}</h3>

        <p class="doc-meta">
            ${escapeHTML(doc.category)}<br>
            ${escapeHTML(doc.fileName)}<br>
            ${formatSize(doc.size)}
        </p>

        ${doc.expiry ? `
            <p class="doc-expiry">
                ${escapeHTML(expiryStatus || "Expiry: " + formatDate(doc.expiry))}
            </p>
        ` : ""}

        <div class="doc-actions">

            <button class="small-button"
                onclick="previewDocument('${doc.id}')">
                View
            </button>

            <button class="small-button"
                onclick="downloadDocument('${doc.id}')">
                Download
            </button>

            <button class="small-button"
                onclick="shareDocument('${doc.id}')">
                ${doc.shared ? "Shared ✓" : "Share"}
            </button>

            <button class="small-button"
                onclick="removeDocument('${doc.id}')">
                Delete
            </button>

        </div>

    </article>
    `;
}


/* 8. RENDER DOCUMENT LIST */

function renderList(elementId, list) {
    const element = document.getElementById(elementId);

    if (!list.length) {
        element.innerHTML = `
            <div class="empty-state">
                <span>📂</span>
                <strong>No documents found</strong>
                <p>Upload your first document to get started.</p>
            </div>
        `;

        return;
    }

    element.innerHTML = list.map(createCard).join("");
}


/* 9. DASHBOARD STATISTICS */

function updateStatistics() {

    document.getElementById("totalCount").textContent =
        documents.length;

    document.getElementById("categoryCount").textContent =
        new Set(documents.map(doc => doc.category)).size;

    document.getElementById("favoriteCount").textContent =
        documents.filter(doc => doc.favorite).length;

    document.getElementById("expiringCount").textContent =
        documents.filter(doc => {
            const status = getExpiryStatus(doc.expiry);

            return status === "Expired" ||
                status === "Expires today" ||
                status.startsWith("Expires in");
        }).length;
}


/* 10. RENDER ALL PAGES */

function renderAll() {

    updateStatistics();

    const recent = [...documents]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6);

    renderList("recentDocuments", recent);
    renderList("allDocuments", documents);
    renderList("favoriteDocuments", documents.filter(d => d.favorite));
    renderList("sharedDocuments", documents.filter(d => d.shared));

    const reminders = documents.filter(doc => {
        const status = getExpiryStatus(doc.expiry);

        return status === "Expired" ||
            status === "Expires today" ||
            status.startsWith("Expires in");
    });

    renderList("reminderDocuments", reminders);
}


/* 11. CATEGORY FILTER */

function showCategory(category) {

    showPage("categories");

    const filtered = documents.filter(doc => doc.category === category);

    const area = document.getElementById("categoryDocuments");

    area.innerHTML = `
        <div class="section-heading">
            <h2>${escapeHTML(category)} Documents</h2>
            <span>${filtered.length} files</span>
        </div>
        <div class="document-grid" id="filteredCategory"></div>
    `;

    renderList("filteredCategory", filtered);
}

document.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
        showCategory(button.dataset.category);
    });
});


/* 12. SEARCH */

function searchDocuments(query, category = "all") {

    const filtered = documents.filter(doc => {

        const matchesName = (
            doc.name + " " +
            doc.fileName + " " +
            doc.category + " " +
            (doc.description || "")
        ).toLowerCase().includes(query.toLowerCase());

        const matchesCategory =
            category === "all" || doc.category === category;

        return matchesName && matchesCategory;
    });

    return filtered;
}

document.getElementById("searchInput").addEventListener("input",
    function() {

        showPage("documents");

        renderList("allDocuments", searchDocuments(
            this.value,
            document.getElementById("filterCategory").value
        ));
});

document.getElementById("filterCategory").addEventListener("change",
    function() {

        showPage("documents");

        renderList("allDocuments", searchDocuments(
            document.getElementById("searchInput").value,
            this.value
        ));
});

document.getElementById("documentSearch").addEventListener("input",
    function() {

        renderList("allDocuments", searchDocuments(this.value));
});


/* 13. FAVOURITES */

async function toggleFavorite(id) {

    const doc = documents.find(item => item.id === id);

    if (!doc) return;

    doc.favorite = !doc.favorite;

    await saveRecord(doc);

    documents = await getAllRecords();

    renderAll();

    showToast(doc.favorite
        ? "Added to favourites."
        : "Removed from favourites.");
}


/* 14. DELETE DOCUMENT */

async function removeDocument(id) {

    const confirmed = confirm(
        "Are you sure you want to delete this document?"
    );

    if (!confirmed) return;

    try {
        await deleteRecord(id);

        documents = await getAllRecords();

        renderAll();

        showToast("Document deleted.");
    } catch (error) {
        showToast("Could not delete document.");
    }
}


/* 15. PREVIEW DOCUMENT */

const previewModal = document.getElementById("previewModal");

async function previewDocument(id) {

    const doc = documents.find(item => item.id === id);

    if (!doc) return;

    previewId = id;

    document.getElementById("previewTitle").textContent = doc.name;

    document.getElementById("previewInfo").textContent =
        doc.fileName + " • " + formatSize(doc.size);

    const area = document.getElementById("previewArea");

    area.innerHTML = "";

    const url = URL.createObjectURL(doc.file);

    if (doc.type === "application/pdf") {

        const frame = document.createElement("iframe");
        frame.src = url;

        area.appendChild(frame);

    } else if (doc.type.startsWith("image/")) {

        const image = document.createElement("img");
        image.src = url;
        image.alt = doc.name;

        area.appendChild(image);

    } else {

        area.textContent = "Preview is not supported for this file.";
    }

    previewModal.classList.add("show");

    previewModal.dataset.objectUrl = url;
}

function closePreview() {

    const url = previewModal.dataset.objectUrl;

    if (url) URL.revokeObjectURL(url);

    previewModal.classList.remove("show");

    previewModal.dataset.objectUrl = "";
}

document.getElementById("closePreview").onclick = closePreview;


/* 16. DOWNLOAD DOCUMENT */

function downloadDocument(id) {

    const doc = documents.find(item => item.id === id);

    if (!doc) return;

    const url = URL.createObjectURL(doc.file);

    const link = document.createElement("a");

    link.href = url;
    link.download = doc.fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById("downloadPreview").onclick = function() {

    if (previewId) downloadDocument(previewId);
};


/* 17. SHARE DOCUMENT */

async function shareDocument(id) {

    const doc = documents.find(item => item.id === id);

    if (!doc) return;

    const confirmed = confirm(
        "Mark this document as shared in your prototype?"
    );

    if (!confirmed) return;

    doc.shared = !doc.shared;

    await saveRecord(doc);

    documents = await getAllRecords();

    renderAll();

    showToast(doc.shared
        ? "Marked as shared. No family link has been created yet."
        : "Sharing mark removed.");
}


/* 18. PAGE NAVIGATION */

function showPage(page) {

    document.querySelectorAll(".page").forEach(section => {
        section.classList.remove("active");
    });

    const selected = document.getElementById(page);

    if (!selected) return;

    selected.classList.add("active");

    document.querySelectorAll(".nav-link").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    document.getElementById("pageTitle").textContent =
        page.charAt(0).toUpperCase() + page.slice(1);

    document.getElementById("sidebar").classList.remove("open");
}

document.querySelectorAll(".nav-link[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.go);
    });
});


/* 19. MOBILE SIDEBAR */

document.getElementById("menuToggle").onclick = function() {

    document.getElementById("sidebar").classList.toggle("open");
};


/* 20. DARK MODE */

function toggleTheme() {

    document.body.classList.toggle("dark");

    const theme = document.body.classList.contains("dark")
        ? "dark"
        : "light";

    localStorage.setItem("myvaultTheme", theme);

    updateThemeButtons();
}

function updateThemeButtons() {

    const dark = document.body.classList.contains("dark");

    document.getElementById("themeButton").innerHTML =
        dark ? "☀ <span>Light Mode</span>" : "☾ <span>Dark Mode</span>";

    document.getElementById("topThemeButton").textContent =
        dark ? "☀" : "☾";
}

document.getElementById("themeButton").onclick = toggleTheme;
document.getElementById("topThemeButton").onclick = toggleTheme;


/* 21. BACKUP DOCUMENTS */

function fileToBase64(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result.split(",")[1]);
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

async function backupDocuments() {

    try {

        const backup = [];

        for (const doc of documents) {

            backup.push({
                ...doc,
                file: await fileToBase64(doc.file)
            });
        }

        const data = {
            app: "MyVault",
            version: 1,
            createdAt: new Date().toISOString(),
            documents: backup
        };

        const blob = new Blob(
            [JSON.stringify(data)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = "MyVault-Backup.json";

        link.click();

        URL.revokeObjectURL(url);

        showToast("Backup downloaded.");

    } catch (error) {

        console.error(error);
        showToast("Backup failed.");
    }
}

document.getElementById("backupButton").onclick = backupDocuments;


/* 22. RESTORE BACKUP */

document.getElementById("restoreButton").onclick = function() {

    document.getElementById("restoreInput").click();
};

document.getElementById("restoreInput").addEventListener("change",
    async function(event) {

        const file = event.target.files[0];

        if (!file) return;

        try {

            if (file.size > 25 * 1024 * 1024) {
                throw new Error("Backup file is too large.");
            }

            const data = JSON.parse(await file.text());

            if (data.app !== "MyVault" ||
                !Array.isArray(data.documents)) {
                throw new Error("Invalid backup file.");
            }

            const confirmed = confirm(
                "Restore these documents? Existing documents with matching IDs will be replaced."
            );

            if (!confirmed) return;

            for (const item of data.documents) {

                const binary = atob(item.file);

                const bytes = Uint8Array.from(
                    binary,
                    character => character.charCodeAt(0)
                );

                const blob = new Blob(
                    [bytes],
                    { type: item.type }
                );

                const restored = {
                    ...item,
                    file: blob
                };

                await saveRecord(restored);
            }

            documents = await getAllRecords();

            renderAll();

            showToast("Backup restored successfully.");

        } catch (error) {

            console.error(error);
            showToast("Could not restore backup.");
        }

        event.target.value = "";
});


/* 23. START WEBSITE */

initialize();
