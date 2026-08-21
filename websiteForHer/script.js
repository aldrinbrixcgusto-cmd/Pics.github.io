/* File structure: script.js connects the gallery to Supabase Storage and controls the sign-in, cards, and lightbox. */

// These two values are safe to use in a browser when Supabase RLS policies are enabled.
const supabaseUrl = "https://hffdjnflcwgcrqawkbzu.supabase.co";
const supabaseKey = "sb_publishable_8dWnjF2zX_miC42iRbvJWg_FkPIdS_f";
const bucketName = "couple-photos";
const sessionKey = "our-vibe-session";

// Add these optional, public starter files to /images if you would like a few local examples.
const starterPhotos = [
  { src: "images/first-date.jpg", filename: "first-date.jpg", caption: "Our first date" },
  { src: "images/sunset-walk.jpg", filename: "sunset-walk.jpg", caption: "An evening walk" },
  { src: "images/coffee-morning.jpg", filename: "coffee-morning.jpg", caption: "Slow Sunday coffee" },
  { src: "images/anniversary-dinner.jpg", filename: "anniversary-dinner.jpg", caption: "A special dinner" }
];

const album = document.querySelector("#album");
const loginPanel = document.querySelector("#login-panel");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const setPasswordPanel = document.querySelector("#set-password-panel");
const setPasswordForm = document.querySelector("#set-password-form");
const setPasswordMessage = document.querySelector("#set-password-message");
const accountBar = document.querySelector("#account-bar");
const accountEmail = document.querySelector("#account-email");
const gallery = document.querySelector("#gallery");
const photoCount = document.querySelector("#photo-count");
const fileInput = document.querySelector("#photo-input");
const dropZone = document.querySelector("#drop-zone");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxCaption = document.querySelector("#lightbox-caption");

let sharedPhotos = [];
let currentPhotoIndex = 0;

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey));
  } catch {
    return null;
  }
}

function saveSession(session) {
  session.expires_at ||= Math.floor(Date.now() / 1000) + session.expires_in;
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(sessionKey);
}

function showLogin(message = "") {
  album.hidden = true;
  accountBar.hidden = true;
  setPasswordPanel.hidden = true;
  loginPanel.hidden = false;
  loginMessage.textContent = message;
}

function showAlbum(session) {
  loginPanel.hidden = true;
  setPasswordPanel.hidden = true;
  album.hidden = false;
  accountBar.hidden = false;
  accountEmail.textContent = session.user.email;
}

function showError(message) {
  loginMessage.textContent = message;
}

function showSetPassword() {
  loginPanel.hidden = true;
  album.hidden = true;
  accountBar.hidden = true;
  setPasswordPanel.hidden = false;
  setPasswordMessage.textContent = "";
}

async function errorMessage(response) {
  const data = await response.json().catch(() => ({}));
  return data.msg || data.message || data.error || "Something went wrong. Please try again.";
}

// Refreshes the short-lived sign-in token when necessary.
async function getAccessToken() {
  let session = readSession();
  if (!session) throw new Error("Please sign in first.");

  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return session.access_token;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });

  if (!response.ok) {
    clearSession();
    throw new Error("Your sign-in has expired. Please sign in again.");
  }

  session = await response.json();
  saveSession(session);
  return session.access_token;
}

// Adds the sign-in token to every request for the private album.
async function supabaseFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("apikey", supabaseKey);
  headers.set("Authorization", `Bearer ${await getAccessToken()}`);
  return fetch(`${supabaseUrl}${path}`, { ...options, headers });
}

// Supabase adds a short-lived session to an invitation link. Save it so the
// invited person can choose their password in this page.
async function useInvitationFromUrl() {
  const values = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = values.get("access_token");
  const refreshToken = values.get("refresh_token");
  if (!accessToken || !refreshToken) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error("This invitation link is no longer valid. Please send a new invitation.");

  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Number(values.get("expires_at")),
    expires_in: Number(values.get("expires_in")) || 3600,
    user: await response.json()
  };
  saveSession(session);
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}

function allPhotos() {
  return [...starterPhotos, ...sharedPhotos];
}

function photoAlt(photo) {
  return photo.caption || `Photo named ${photo.filename}`;
}

function encodedPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function signedImageUrl(path) {
  const response = await supabaseFetch(`/storage/v1/object/sign/${bucketName}/${encodedPath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 })
  });

  if (!response.ok) throw new Error(await errorMessage(response));
  const data = await response.json();
  const signedUrl = data.signedUrl || data.signedURL;
  if (!signedUrl) throw new Error("Supabase did not return a link for this photo.");
  return signedUrl.startsWith("http") ? signedUrl : `${supabaseUrl}/storage/v1${signedUrl}`;
}

async function loadSharedPhotos() {
  const response = await supabaseFetch("/rest/v1/photos?select=*&order=created_at.desc");
  if (!response.ok) throw new Error(await errorMessage(response));

  const rows = await response.json();
  sharedPhotos = await Promise.all(rows.map(async (row) => ({
    id: row.id,
    filename: row.filename,
    caption: row.caption || "",
    storagePath: row.storage_path,
    src: await signedImageUrl(row.storage_path),
    shared: true
  })));

  renderGallery();
}

function renderGallery() {
  const photos = allPhotos();
  gallery.innerHTML = "";
  photoCount.textContent = `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`;

  photos.forEach((photo, index) => {
    const card = document.createElement("article");
    card.className = "photo-card";

    const openButton = document.createElement("button");
    openButton.className = "photo-button";
    openButton.type = "button";
    openButton.setAttribute("aria-label", `Open ${photo.filename}`);
    openButton.addEventListener("click", () => openLightbox(index));

    const image = document.createElement("img");
    image.src = photo.src;
    image.alt = photoAlt(photo);
    image.loading = "lazy";
    image.addEventListener("error", () => showMissingImage(openButton, photo.filename), { once: true });
    openButton.append(image);

    const details = document.createElement("div");
    details.className = "photo-details";

    const fileName = document.createElement("span");
    fileName.className = "file-name";
    fileName.title = photo.filename;
    fileName.textContent = photo.filename;
    details.append(fileName);

    if (photo.shared) {
      const caption = document.createElement("input");
      caption.className = "caption-input";
      caption.type = "text";
      caption.value = photo.caption;
      caption.placeholder = "Add a caption...";
      caption.setAttribute("aria-label", `Caption for ${photo.filename}`);
      caption.addEventListener("change", () => updateCaption(photo, caption.value));

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete photo";
      deleteButton.addEventListener("click", () => deletePhoto(photo));
      details.append(caption, deleteButton);
    } else {
      const caption = document.createElement("span");
      caption.className = "static-caption";
      caption.textContent = photo.caption;
      details.append(caption);
    }

    card.append(openButton, details);
    gallery.append(card);
  });
}

function showMissingImage(button, filename) {
  button.replaceChildren();
  const placeholder = document.createElement("span");
  placeholder.className = "missing-image";
  placeholder.textContent = `Add ${filename} to the images folder`;
  button.append(placeholder);
}

async function updateCaption(photo, caption) {
  const response = await supabaseFetch(`/rest/v1/photos?id=eq.${encodeURIComponent(photo.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caption: caption.trim() })
  });

  if (!response.ok) {
    alert(await errorMessage(response));
    renderGallery();
    return;
  }

  photo.caption = caption.trim();
}

async function deletePhoto(photo) {
  if (!confirm(`Delete ${photo.filename}? This cannot be undone.`)) return;

  const fileResponse = await supabaseFetch(`/storage/v1/object/${bucketName}/${encodedPath(photo.storagePath)}`, {
    method: "DELETE"
  });
  if (!fileResponse.ok) return alert(await errorMessage(fileResponse));

  const rowResponse = await supabaseFetch(`/rest/v1/photos?id=eq.${encodeURIComponent(photo.id)}`, {
    method: "DELETE"
  });
  if (!rowResponse.ok) return alert(await errorMessage(rowResponse));

  sharedPhotos = sharedPhotos.filter((item) => item.id !== photo.id);
  renderGallery();
}

function openLightbox(index) {
  currentPhotoIndex = index;
  updateLightbox();
  lightbox.showModal();
}

function updateLightbox() {
  const photo = allPhotos()[currentPhotoIndex];
  if (!photo) return;
  lightboxImage.src = photo.src;
  lightboxImage.alt = photoAlt(photo);
  lightboxCaption.textContent = photo.caption || photo.filename;
}

function moveLightbox(step) {
  const photos = allPhotos();
  currentPhotoIndex = (currentPhotoIndex + step + photos.length) % photos.length;
  updateLightbox();
}

async function uploadFile(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const uniqueName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;

  const fileResponse = await supabaseFetch(`/storage/v1/object/${bucketName}/${encodedPath(uniqueName)}`, {
    method: "POST",
    headers: { "Content-Type": file.type, "x-upsert": "false" },
    body: file
  });
  if (!fileResponse.ok) throw new Error(await errorMessage(fileResponse));

  const rowResponse = await supabaseFetch("/rest/v1/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ filename: file.name, caption: "", storage_path: uniqueName })
  });

  if (!rowResponse.ok) {
    await supabaseFetch(`/storage/v1/object/${bucketName}/${encodedPath(uniqueName)}`, { method: "DELETE" });
    throw new Error(await errorMessage(rowResponse));
  }

  const [row] = await rowResponse.json();
  sharedPhotos.unshift({
    id: row.id,
    filename: row.filename,
    caption: row.caption || "",
    storagePath: row.storage_path,
    src: await signedImageUrl(row.storage_path),
    shared: true
  });
}

async function addFiles(files) {
  const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) return;

  try {
    await Promise.all(imageFiles.map(uploadFile));
    renderGallery();
  } catch (error) {
    alert(error.message || "Your photo could not be uploaded.");
  }
}

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const session = await response.json();
  saveSession(session);
  showAlbum(session);
  await loadSharedPhotos();
}

async function setPassword(password) {
  const response = await supabaseFetch("/auth/v1/user", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const session = readSession();
  session.user = await response.json();
  saveSession(session);
  showAlbum(session);
  await loadSharedPhotos();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("Signing in...");

  try {
    await signIn(document.querySelector("#email-input").value, document.querySelector("#password-input").value);
    loginForm.reset();
  } catch (error) {
    showError(error.message || "Unable to sign in.");
  }
});

setPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#new-password-input").value;
  const confirmation = document.querySelector("#confirm-password-input").value;
  if (password !== confirmation) {
    setPasswordMessage.textContent = "The passwords do not match.";
    return;
  }

  setPasswordMessage.textContent = "Saving your password...";
  try {
    await setPassword(password);
    setPasswordForm.reset();
  } catch (error) {
    setPasswordMessage.textContent = error.message || "Unable to save your password.";
  }
});

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

document.querySelector("#sign-out-button").addEventListener("click", () => {
  clearSession();
  sharedPhotos = [];
  if (lightbox.open) lightbox.close();
  showLogin("You have signed out.");
});
document.querySelector("#close-lightbox").addEventListener("click", () => lightbox.close());
document.querySelector("#previous-photo").addEventListener("click", () => moveLightbox(-1));
document.querySelector("#next-photo").addEventListener("click", () => moveLightbox(1));
document.addEventListener("keydown", (event) => {
  if (!lightbox.open) return;
  if (event.key === "ArrowLeft") moveLightbox(-1);
  if (event.key === "ArrowRight") moveLightbox(1);
});

// Restore a saved sign-in when the page reloads.
(async function startSite() {
  try {
    if (await useInvitationFromUrl()) return showSetPassword();

    const session = readSession();
    if (!session) return showLogin();
    await getAccessToken();
    showAlbum(readSession());
    await loadSharedPhotos();
  } catch (error) {
    clearSession();
    showLogin(error.message || "Please sign in again.");
  }
})();
