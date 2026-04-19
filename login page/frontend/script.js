const authCard = document.querySelector(".auth-card");
const statusMessage = document.getElementById("status-message");
const sessionMessage = document.getElementById("session-message");
const sceneNote = document.getElementById("scene-note");
const form = document.getElementById("auth-form");
const eyePupils = document.querySelectorAll(".bean-eye span");
const requestOtpButton = document.getElementById("request-otp-button");
const API_BASE = `${window.location.origin}/api`;
const sceneMessages = [
  "Customers go straight to the menu. Admin watches the desk here.",
  "Orders move to admin after payment confirmation.",
  "Control room access stays protected.",
];
let sceneIndex = 0;

function showSession(user) {
  sessionMessage.textContent = `Authenticated as ${user.name} (${user.email}).`;
}

function trackBeanEyes(event) {
  eyePupils.forEach((pupil) => {
    const rect = pupil.parentElement.getBoundingClientRect();
    const dx = Math.max(-4, Math.min(4, (event.clientX - (rect.left + rect.width / 2)) / 14));
    const dy = Math.max(-4, Math.min(4, (event.clientY - (rect.top + rect.height / 2)) / 14));
    pupil.style.transform = `translate(${dx}px, ${dy}px)`;
  });
}

function rotateSceneNote() {
  sceneIndex = (sceneIndex + 1) % sceneMessages.length;
  sceneNote.textContent = sceneMessages[sceneIndex];
}

function hydrateSessionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  if (error) {
    statusMessage.textContent = error;
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function redirectIfAuthenticated() {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, { credentials: "same-origin" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (payload?.user?.role === "admin") {
      showSession(payload.user);
      window.location.href = `${window.location.origin}/admin`;
    }
  } catch {
    // Ignore auth probe failures on login page.
  }
}

document.addEventListener("pointermove", trackBeanEyes);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const adminPhone = String(formData.get("adminPhone") || "").trim();
  const adminOtp = String(formData.get("adminOtp") || "").trim();
  const endpoint = adminOtp ? "admin/verify-otp" : "admin/signin";
  const body = adminOtp ? { phone: adminPhone, otp: adminOtp } : { email, phone: adminPhone, password };

  statusMessage.textContent = "";
  sessionMessage.textContent = "";

  if (!adminPhone) {
    statusMessage.textContent = "Enter admin phone number.";
    return;
  }

  if (!adminOtp && (!email || !password)) {
    statusMessage.textContent = "Enter admin email and password, or use OTP.";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      statusMessage.textContent = "Too many requests. Please try again later.";
      return;
    }

    const payload = await response.json();

    if (!response.ok) {
      statusMessage.textContent = payload.message || "Authentication failed.";
      return;
    }

    authCard.classList.add("admin-mode");
    sceneNote.textContent = "Admin access confirmed. Opening control room.";
    window.location.href = `${window.location.origin}/admin`;
  } catch {
    statusMessage.textContent = "Backend is not reachable. Start the server and try again.";
  }
});

requestOtpButton.addEventListener("click", async () => {
  const formData = new FormData(form);
  const phone = String(formData.get("adminPhone") || "").trim();

  statusMessage.textContent = "";
  if (!phone) {
    statusMessage.textContent = "Enter admin phone number first.";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/request-otp`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (response.status === 429) {
      statusMessage.textContent = "Too many requests. Please try again later.";
      return;
    }

    const payload = await response.json();

    if (!response.ok) {
      statusMessage.textContent = payload.message || "Unable to send OTP.";
      return;
    }

    statusMessage.textContent = payload.devOtp
      ? `${payload.message} Demo OTP: ${payload.devOtp}`
      : payload.message;
  } catch {
    statusMessage.textContent = "Backend is not reachable. Start the server and try again.";
  }
});

hydrateSessionFromUrl();
redirectIfAuthenticated();
window.setInterval(rotateSceneNote, 2800);
