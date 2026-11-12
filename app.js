import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDIH7_hmnWw3EbNWiT86Ttda-V86P2Yves",
  authDomain: "project-patner-finder.firebaseapp.com",
  projectId: "project-patner-finder",
  storageBucket: "project-patner-finder.firebasestorage.app",
  messagingSenderId: "80084049814",
  appId: "1:80084049814:web:f7a22c1fc45d3daaf207b7",
  measurementId: "G-29GR54P272"
};

const configured = Boolean(
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes("YOUR_") &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

let auth = null;
let db = null;

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const $ = id => document.getElementById(id);

const setText = (id, value) => {
  const el = $(id);
  if (el) el.textContent = value;
};

const setValue = (id, value) => {
  const el = $(id);
  if (el) el.value = value;
};

const getValue = id => {
  const el = $(id);
  return el ? el.value.trim() : "";
};

const BRANCHES = [
  "BTech CSC",
  "BTech CSC AML",
  "BTech CSC Data Science",
  "BTech CSC Cyber Security",
  "BTech CSC Electronics and Commnication",
  "Other"
];

const normalizeBranch = value =>
  typeof value === "string" ? value.trim().replace(/^BTech CSE\b/i, "BTech CSC") : "";

const branchName = value => (value === "Other" ? "Others" : value);

let currentUser = null;
let currentProfile = null;
let allStudents = [];
let sentRequests = new Map();
let sentUnsubscribe = null;
let incomingRequests = [];
let outgoingRequests = [];
let requestsUnsubscribe = null;
let savedProfileSnapshot = null;
let pendingSignup = false;

const PROFILE_FIELDS = [
  "profileName",
  "profileUsn",
  "profileEmail",
  "profileDepartment",
  "profileBranch",
  "profileYear",
  "profileAvailable",
  "profileGithub",
  "profileLinkedin",
  "profileSkills",
  "profileAbout"
];

function snapshotProfileData() {
  savedProfileSnapshot = Object.fromEntries(
    PROFILE_FIELDS.map(id => [id, getValue(id)])
  );
}

function hasProfileChanged() {
  if (!savedProfileSnapshot) return true;
  return PROFILE_FIELDS.some(id => getValue(id) !== savedProfileSnapshot[id]);
}

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 3500);
}

function setAuthError(message = "") {
  setText("authError", message);
}

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists with this email.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account was found for this email.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/api-key-not-valid": "Firebase API key is invalid. Check your Firebase project configuration.",
    "auth/requires-recent-login": "Please sign out, log in again and then retry.",
    "auth/operation-not-allowed": "Operation not allowed. Check your Firebase Authentication settings.",
    "permission-denied": "You do not have permission to perform this action."
  };

  return messages[error?.code] || error?.message || "Something went wrong. Please try again.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character];
  });
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

function normalizeGithub(value) {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?github\.com\//i.test(v)) return `https://${v}`;
  return `https://github.com/${v.replace(/^@/, "")}`;
}

function switchAuth(mode) {
  const login = mode === "login";

  $("loginForm").classList.toggle("hidden", !login);
  $("signupForm").classList.toggle("hidden", login);

  $("loginTab").classList.toggle("active", login);
  $("signupTab").classList.toggle("active", !login);

  setText("authTitle", login ? "Welcome back" : "Create your account");
  setText(
    "authSubtitle",
    login
      ? "Sign in to continue to your student workspace."
      : "Join the RV University student project community."
  );

  setAuthError("");
}

$("loginTab").addEventListener("click", () => switchAuth("login"));
$("signupTab").addEventListener("click", () => switchAuth("signup"));

setText("yearNow", new Date().getFullYear());

function setProfileEditMode(mode) {
  const form = $("profileForm");
  const submitBtn = $("profileSubmitBtn");
  if (!form || !submitBtn) return;

  const inputs = form.querySelectorAll("input, select, textarea");

  if (mode === "view") {
    inputs.forEach(input => { input.disabled = true; });
    submitBtn.classList.remove("hidden");
    submitBtn.type = "button";
    submitBtn.innerHTML = 'Edit <span>✎</span>';
    submitBtn.dataset.mode = "edit";
  } else if (mode === "editing") {
    inputs.forEach(input => { input.disabled = false; });
    submitBtn.classList.add("hidden");
    submitBtn.dataset.mode = "editing";
  } else if (mode === "dirty") {
    inputs.forEach(input => { input.disabled = false; });
    submitBtn.classList.remove("hidden");
    submitBtn.type = "submit";
    submitBtn.innerHTML = 'Save my profile <span>→</span>';
    submitBtn.dataset.mode = "save";
  }
}

$("profileSubmitBtn").addEventListener("click", () => {
  const btn = $("profileSubmitBtn");
  if (btn.dataset.mode === "edit") {
    snapshotProfileData();
    setProfileEditMode("editing");
    $("profileName").focus();
  }
});

$("deleteAccountBtn").addEventListener("click", async () => {
  if (!currentUser || !db || !auth) return;

  const confirmed = window.confirm(
    "Are you sure you want to permanently delete your account? All your profile information and requests will be removed. This cannot be undone."
  );
  if (!confirmed) return;

  try {
    const uid = currentUser.uid;

    const sentSnap = await getDocs(query(collection(db, "requests"), where("fromUid", "==", uid)));
    const recvSnap = await getDocs(query(collection(db, "requests"), where("toUid", "==", uid)));

    const deletePromises = [
      ...sentSnap.docs.map(d => deleteDoc(d.ref)),
      ...recvSnap.docs.map(d => deleteDoc(d.ref)),
      deleteDoc(doc(db, "users", uid))
    ];

    await Promise.all(deletePromises);
    await deleteUser(currentUser);

    toast("Your account has been deleted.");
    showAuth();
  } catch (error) {
    console.error("Account deletion error:", error);
    if (error?.code === "auth/requires-recent-login") {
      toast("Security check: Please sign out and log in again before deleting your account.");
    } else {
      toast(friendlyError(error));
    }
  }
});

function handleProfileAlteration() {
  const btn = $("profileSubmitBtn");
  if (btn.dataset.mode === "edit") return;
  setProfileEditMode(hasProfileChanged() ? "dirty" : "editing");
}

$("profileForm").addEventListener("input", handleProfileAlteration);
$("profileForm").addEventListener("change", handleProfileAlteration);

$("profileEmail").addEventListener("input", () => {
  const typed = getValue("profileEmail").toLowerCase();
  const current = ((currentUser && currentUser.email) || "").toLowerCase();
  $("emailPasswordRow").classList.toggle("hidden", typed === current);
});

function updateIdentity(name) {
  const initial = name.charAt(0).toUpperCase();
  setText("sideName", name);
  setText("welcomeName", `Welcome, ${name}`);
  setText("profileHeading", name);
  ["sideAvatar", "topAvatar", "profileAvatar"].forEach(id => setText(id, initial));
}

function setBadges(count) {
  ["requestBadge", "notifBadge"].forEach(id => {
    const badge = $(id);
    if (!badge) return;
    badge.textContent = count > 99 ? "99+" : count;
    badge.classList.toggle("hidden", count === 0);
  });
}

function showApp(user, profile) {
  currentUser = user;
  currentProfile = profile || {};

  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  const name =
    currentProfile.name ||
    user.displayName ||
    (user.email ? user.email.split("@")[0] : "RVU Student");

  updateIdentity(name);
  setText("sideEmail", user.email || "");

  setValue("profileName", currentProfile.name || name);
  setValue("profileUsn", currentProfile.usn || "");
  setValue("profileEmail", user.email || "");
  setValue("profileCurrentPassword", "");
  $("emailPasswordRow").classList.add("hidden");

  setValue(
    "profileDepartment",
    currentProfile.department === "School of Engineering" ? "School of Engineering" : "Other"
  );

  const savedBranch = normalizeBranch(currentProfile.branch);
  setValue("profileBranch", BRANCHES.includes(savedBranch) ? savedBranch : "");
  setValue("profileYear", currentProfile.year || "1st Year");
  setValue("profileAvailable", currentProfile.available || "open");
  setValue("profileGithub", currentProfile.github || "");
  setValue("profileLinkedin", currentProfile.linkedin || "");

  const skillsArr = Array.isArray(currentProfile.skills) ? currentProfile.skills : [];
  setValue("profileSkills", skillsArr.join(", "));
  setValue("profileAbout", currentProfile.about || "");

  listenToSentRequests();
  loadStudents();
  listenToIncomingRequests();
  snapshotProfileData();

  if (profile && (profile.name || profile.usn)) {
    setProfileEditMode("view");
  } else {
    setProfileEditMode("dirty");
  }
}

function showAuth() {
  if (requestsUnsubscribe) {
    requestsUnsubscribe();
    requestsUnsubscribe = null;
  }

  if (sentUnsubscribe) {
    sentUnsubscribe();
    sentUnsubscribe = null;
  }

  incomingRequests = [];
  outgoingRequests = [];
  currentUser = null;
  currentProfile = null;
  allStudents = [];
  sentRequests.clear();
  setBadges(0);

  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
}

async function loadProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}

async function handleSignedIn(user) {
  try {
    let profile = await loadProfile(user);

    if (profile && user.email && profile.email !== user.email) {
      profile.email = user.email;
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { email: user.email, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (syncError) {
        console.error("Email sync error:", syncError);
      }
    }

    if (profile && !profile.name && user.displayName) {
      profile.name = user.displayName;
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { name: user.displayName, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (nameError) {
        console.error("Name sync error:", nameError);
      }
    }

    if (!profile) {
      profile = {
        uid: user.uid,
        name: user.displayName || "RVU Student",
        email: user.email,
        department: "Other",
        branch: "",
        year: "1st Year",
        available: "open",
        skills: [],
        about: ""
      };

      await setDoc(
        doc(db, "users", user.uid),
        {
          ...profile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }

    showApp(user, profile);
  } catch (error) {
    console.error("Auth state handling error:", error);
    showAuth();
    setAuthError("Could not load your profile. Check Firestore setup and security rules.");
  }
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  setAuthError("");

  if (!configured || !auth) {
    return setAuthError("Firebase configuration is missing or invalid.");
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      getValue("loginEmail"),
      $("loginPassword").value
    );
    toast("Login successful.");
  } catch (error) {
    console.error("Login error:", error);
    setAuthError(friendlyError(error));
  }
});

$("signupForm").addEventListener("submit", async event => {
  event.preventDefault();
  setAuthError("");

  if (!configured || !auth || !db) {
    return setAuthError("Firebase configuration is missing or invalid.");
  }

  const name = getValue("signupName");
  const usn = getValue("signupUsn");
  const email = getValue("signupEmail");
  const department = $("signupDepartment").value;
  const year = $("signupYear").value;
  const password = $("signupPassword").value;

  if (!name || !usn || !email || !department || !year || !password) {
    return setAuthError("Please fill in all required fields.");
  }

  pendingSignup = true;
  let credential = null;

  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });

    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      name,
      usn,
      email,
      department,
      branch: "",
      year,
      available: "open",
      github: "",
      linkedin: "",
      skills: [],
      about: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    pendingSignup = false;
    await handleSignedIn(credential.user);
    toast("Your account has been created.");
  } catch (error) {
    pendingSignup = false;
    console.error("Registration error:", error);

    if (credential && credential.user) {
      await handleSignedIn(credential.user);
      toast(friendlyError(error));
    } else {
      setAuthError(friendlyError(error));
    }
  }
});

$("forgotPassword").addEventListener("click", async () => {
  if (!configured || !auth) {
    return setAuthError("Configure Firebase first to enable password recovery.");
  }

  const email = getValue("loginEmail");
  if (!email) {
    return setAuthError("Enter your email address first.");
  }

  try {
    await sendPasswordResetEmail(auth, email);
    toast("Password reset email sent. Check your inbox.");
  } catch (error) {
    setAuthError(friendlyError(error));
  }
});

$("logoutBtn").addEventListener("click", async () => {
  if (!auth) return;

  try {
    await signOut(auth);
    toast("You have been logged out.");
  } catch (error) {
    toast(friendlyError(error));
  }
});

$("menuBtn").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

function navigate(page) {
  document.querySelectorAll(".page").forEach(element => {
    element.classList.toggle("active", element.id === `page-${page}`);
  });

  document.querySelectorAll(".nav-link[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => navigate(button.dataset.go));
});

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser || !db) return;

  const message = $("profileMessage");
  message.textContent = "Saving...";

  const name = getValue("profileName");
  if (!name) {
    message.textContent = "Please enter your name.";
    return;
  }

  const fields = {
    name,
    usn: getValue("profileUsn"),
    department: $("profileDepartment").value,
    branch: $("profileBranch").value,
    year: $("profileYear").value,
    available: $("profileAvailable").value,
    github: normalizeGithub(getValue("profileGithub")),
    linkedin: getValue("profileLinkedin"),
    skills: getValue("profileSkills")
      .split(",")
      .map(skill => skill.trim())
      .filter(Boolean)
      .slice(0, 20),
    about: getValue("profileAbout")
  };

  const newEmail = getValue("profileEmail");
  const oldEmail = currentUser.email || "";
  const emailChanged = newEmail && newEmail.toLowerCase() !== oldEmail.toLowerCase();
  const currentPassword = $("profileCurrentPassword").value;

  if (emailChanged && !currentPassword) {
    message.textContent = "Enter your current password to change your email.";
    return;
  }

  try {
    if (emailChanged) {
      const credential = EmailAuthProvider.credential(oldEmail, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await verifyBeforeUpdateEmail(currentUser, newEmail);
    }

    await setDoc(
      doc(db, "users", currentUser.uid),
      { ...fields, updatedAt: serverTimestamp() },
      { merge: true }
    );

    await updateProfile(currentUser, { displayName: name });

    currentProfile = { ...currentProfile, ...fields };

    updateIdentity(name);
    setValue("profileGithub", fields.github);
    setValue("profileEmail", oldEmail);
    setValue("profileCurrentPassword", "");
    $("emailPasswordRow").classList.add("hidden");

    if (emailChanged) {
      message.textContent = `Profile saved. We sent a verification link to ${newEmail}. Click it to finish changing your email.`;
      toast("Verification link sent to your new email.");
    } else {
      message.textContent = "Your profile has been saved.";
      toast("Profile updated.");
    }

    snapshotProfileData();
    setProfileEditMode("view");
    loadStudents();
  } catch (error) {
    console.error("Profile update error:", error);
    message.textContent = friendlyError(error);
  }
});

function listenToSentRequests() {
  if (!currentUser || !db) return;

  if (sentUnsubscribe) {
    sentUnsubscribe();
  }

  const q = query(collection(db, "requests"), where("fromUid", "==", currentUser.uid));
  let firstSnapshot = true;

  sentUnsubscribe = onSnapshot(q, snapshot => {
    outgoingRequests = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    sentRequests = new Map();
    outgoingRequests.forEach(r => sentRequests.set(r.toUid, r.status || "pending"));

    if (!firstSnapshot) {
      snapshot.docChanges().forEach(change => {
        if (change.type !== "modified") return;
        const data = change.doc.data();
        const who = data.toName || "The student";
        if (data.status === "accepted") {
          toast(`🎉 ${who} accepted your partner request!`);
        } else if (data.status === "declined") {
          toast(`${who} declined your partner request.`);
        }
      });
    }
    firstSnapshot = false;

    if (allStudents.length) renderStudents();
    renderSentRequests();
    renderPartners();
  }, error => {
    console.error("Sent requests listener error:", error);
  });
}

function renderSentRequests() {
  const container = $("sentRequestsList");
  if (!container) return;

  if (!outgoingRequests.length) {
    container.innerHTML = '<div class="empty-state">You have not sent any partner requests yet.</div>';
    return;
  }

  container.innerHTML = outgoingRequests.map(req => {
    const student = allStudents.find(s => s.uid === req.toUid) || {};
    const name = student.name || req.toName || "RVU Student";
    const initial = name.charAt(0).toUpperCase();

    let statusHtml;
    if (req.status === "accepted") {
      statusHtml = `
        <div class="accepted-partner-row">
          <div class="accepted-label">
            ✓ Accepted your request${student.email ? ` · Contact: <a href="mailto:${escapeHtml(student.email)}" style="color:var(--gold2)">${escapeHtml(student.email)}</a>` : ""}
          </div>
          <button class="remove-partner-btn" type="button" data-request-id="${escapeHtml(req.id)}" data-partner-name="${escapeHtml(name)}">
            Remove Partner
          </button>
        </div>`;
    } else if (req.status === "declined") {
      statusHtml = '<span class="sent-status declined">✕ Declined</span>';
    } else {
      statusHtml = `
        <div class="sent-pending-row">
          <span class="sent-status pending">⏳ Pending · waiting for response</span>
          <button class="unrequest-action-btn" type="button" data-unrequest-id="${escapeHtml(req.id)}" data-unrequest-name="${escapeHtml(name)}">
            Unrequest
          </button>
        </div>`;
    }

    return `
      <article class="request-card">
        <div class="request-card-head">
          <div class="large-avatar">${escapeHtml(initial)}</div>
          <div>
            <h3>${escapeHtml(name)}</h3>
            <p>${escapeHtml(student.department || "RV University")} · ${escapeHtml(student.year || "Student")}</p>
          </div>
        </div>
        ${statusHtml}
      </article>
    `;
  }).join("");
}

$("sentRequestsList").addEventListener("click", async event => {
  const removeBtn = event.target.closest(".remove-partner-btn");
  if (removeBtn) {
    const partnerName = removeBtn.dataset.partnerName || "student";
    const confirmed = window.confirm(`Are you sure you want to end your partnership with ${partnerName}? Both of you will be able to partner with other students again.`);
    if (!confirmed) return;
    await removePartner(removeBtn.dataset.requestId, partnerName);
    return;
  }

  const btn = event.target.closest("[data-unrequest-id]");
  if (!btn) return;
  await unrequestPartner(btn.dataset.unrequestId, btn.dataset.unrequestName);
});

function renderPartners() {
  const container = $("partnersList");
  if (!container) return;

  const partners = new Map();

  incomingRequests
    .filter(r => r.status === "accepted")
    .forEach(r => {
      const s = allStudents.find(x => x.uid === r.fromUid) || {};
      partners.set(r.fromUid, {
        requestId: r.id,
        name: s.name || r.fromName,
        department: s.department || r.fromDepartment,
        year: s.year || r.fromYear,
        email: s.email || r.fromEmail,
        github: s.github,
        linkedin: s.linkedin
      });
    });

  outgoingRequests
    .filter(r => r.status === "accepted")
    .forEach(r => {
      const s = allStudents.find(x => x.uid === r.toUid) || {};
      partners.set(r.toUid, {
        requestId: r.id,
        name: s.name || r.toName,
        department: s.department,
        year: s.year,
        email: s.email,
        github: s.github,
        linkedin: s.linkedin
      });
    });

  if (!partners.size) {
    container.innerHTML = '<div class="empty-state">No partners yet. Send a request from Find Students.</div>';
    return;
  }

  container.innerHTML = Array.from(partners.values()).map(p => {
    const name = p.name || "RVU Student";
    const github = safeUrl(p.github);
    const linkedin = safeUrl(p.linkedin);

    const links = [
      p.email ? `<a class="social-link" href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>` : "",
      github ? `<a class="social-link" href="${escapeHtml(github)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : "",
      linkedin ? `<a class="social-link" href="${escapeHtml(linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ""
    ].join("");

    return `
      <article class="request-card">
        <div class="request-card-head">
          <div class="large-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>
          <div>
            <h3>${escapeHtml(name)}</h3>
            <p>${escapeHtml(p.department || "RV University")} · ${escapeHtml(p.year || "Student")}</p>
          </div>
        </div>
        <div class="partner-links">${links}</div>
        <div class="partner-card-actions">
          <button class="remove-partner-btn" type="button" data-request-id="${escapeHtml(p.requestId)}" data-partner-name="${escapeHtml(name)}">
            Remove Partner
          </button>
        </div>
      </article>
    `;
  }).join("");
}

$("partnersList").addEventListener("click", async event => {
  const btn = event.target.closest(".remove-partner-btn");
  if (!btn) return;

  const partnerName = btn.dataset.partnerName || "student";
  const confirmed = window.confirm(`Are you sure you want to end your partnership with ${partnerName}? Both of you will be able to partner with other students again.`);
  if (!confirmed) return;

  await removePartner(btn.dataset.requestId, partnerName);
});

async function sendPartnerRequest(targetStudent) {
  if (!currentUser || !db) return;

  if (sentRequests.has(targetStudent.uid)) {
    toast("You already have an active request with this student.");
    return;
  }

  try {
    await addDoc(collection(db, "requests"), {
      fromUid: currentUser.uid,
      fromName: currentProfile.name || currentUser.displayName || "RVU Student",
      fromEmail: currentUser.email || "",
      fromDepartment: currentProfile.department || "RV University",
      fromYear: currentProfile.year || "Student",
      toUid: targetStudent.uid,
      toName: targetStudent.name || "Student",
      status: "pending",
      createdAt: serverTimestamp()
    });

    sentRequests.set(targetStudent.uid, "pending");
    toast(`Partner request sent to ${targetStudent.name || "student"}.`);
    renderStudents();
  } catch (error) {
    console.error("Error sending request:", error);
    if (error && error.code === "permission-denied") {
      toast("Request blocked by Firestore rules. Publish the latest rules in Firebase.");
    } else {
      toast(friendlyError(error));
    }
  }
}

async function unrequestPartner(requestId, studentName) {
  if (!currentUser || !db || !requestId) return;

  try {
    await deleteDoc(doc(db, "requests", requestId));
    toast(`Partner request to ${studentName || "student"} cancelled.`);
    renderStudents();
  } catch (error) {
    console.error("Error cancelling request:", error);
    toast(friendlyError(error));
  }
}

async function removePartner(requestId, partnerName) {
  if (!currentUser || !db || !requestId) return;

  try {
    await deleteDoc(doc(db, "requests", requestId));
    toast(`Partnership with ${partnerName || "student"} ended.`);
    renderStudents();
    renderPartners();
    renderSentRequests();
  } catch (error) {
    console.error("Error removing partner:", error);
    toast(friendlyError(error));
  }
}

function listenToIncomingRequests() {
  if (!currentUser || !db) return;

  if (requestsUnsubscribe) {
    requestsUnsubscribe();
  }

  const q = query(
    collection(db, "requests"),
    where("toUid", "==", currentUser.uid)
  );

  let firstSnapshot = true;

  requestsUnsubscribe = onSnapshot(q, snapshot => {
    const requests = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    if (!firstSnapshot) {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added" && change.doc.data().status === "pending") {
          toast(`New partner request from ${change.doc.data().fromName || "a student"}.`);
        }
      });
    }
    firstSnapshot = false;

    incomingRequests = requests;
    setBadges(requests.filter(r => r.status === "pending").length);
    renderRequestsList(requests);
    renderPartners();
    renderStudents();
  }, error => {
    console.error("Incoming requests listener error:", error);
    if (error && error.code === "permission-denied") {
      toast("Notifications blocked by Firestore rules. Publish the latest rules in Firebase.");
    }
  });
}

function renderRequestsList(requests) {
  const container = $("requestsList");

  if (!requests.length) {
    container.innerHTML = '<div class="empty-state">No partner requests yet.</div>';
    return;
  }

  container.innerHTML = requests.map(req => {
    const initial = (req.fromName || "S").charAt(0).toUpperCase();

    let actionContent;
    if (req.status === "pending") {
      actionContent = `
        <div class="request-actions">
          <button class="accept-btn" data-action="accept" data-id="${escapeHtml(req.id)}">Accept</button>
          <button class="decline-btn" data-action="decline" data-id="${escapeHtml(req.id)}">Decline</button>
        </div>
      `;
    } else if (req.status === "accepted") {
      actionContent = `
        <div class="accepted-partner-row">
          <div class="accepted-label">
            ✓ Accepted · Contact: <a href="mailto:${escapeHtml(req.fromEmail)}" style="color:var(--gold2)">${escapeHtml(req.fromEmail)}</a>
          </div>
          <button class="remove-partner-btn" type="button" data-request-id="${escapeHtml(req.id)}" data-partner-name="${escapeHtml(req.fromName || "Student")}">
            Remove Partner
          </button>
        </div>
      `;
    } else {
      actionContent = '<span class="muted">Declined</span>';
    }

    return `
      <article class="request-card">
        <div class="request-card-head">
          <div class="large-avatar">${escapeHtml(initial)}</div>
          <div>
            <h3>${escapeHtml(req.fromName || "RVU Student")}</h3>
            <p>${escapeHtml(req.fromDepartment || "RV University")} · ${escapeHtml(req.fromYear || "Student")}</p>
          </div>
        </div>
        <p>Would like to partner with you on projects.</p>
        ${actionContent}
      </article>
    `;
  }).join("");
}

$("requestsList").addEventListener("click", async event => {
  const removeBtn = event.target.closest(".remove-partner-btn");
  if (removeBtn) {
    const partnerName = removeBtn.dataset.partnerName || "student";
    const confirmed = window.confirm(`Are you sure you want to end your partnership with ${partnerName}? Both of you will be able to partner with other students again.`);
    if (!confirmed) return;
    await removePartner(removeBtn.dataset.requestId, partnerName);
    return;
  }

  const btn = event.target.closest("[data-action]");
  if (!btn || !db) return;

  const status = btn.dataset.action === "accept" ? "accepted" : "declined";

  try {
    await updateDoc(doc(db, "requests", btn.dataset.id), {
      status,
      respondedAt: serverTimestamp()
    });
    toast(status === "accepted" ? "Request accepted!" : "Request declined.");
  } catch (error) {
    console.error("Status update error:", error);
    toast("Failed to update request.");
  }
});

async function loadStudents() {
  const grid = $("studentGrid");
  if (!currentUser || !db) return;

  grid.innerHTML = '<div class="empty-state">Loading student community…</div>';

  try {
    const snapshot = await getDocs(collection(db, "users"));

    if (!currentUser) return;

    allStudents = snapshot.docs
      .map(document => document.data())
      .filter(student => student.uid && student.uid !== currentUser.uid);

    renderStudents();
    renderCommunity();
    renderSentRequests();
    renderPartners();
  } catch (error) {
    grid.innerHTML = '<div class="empty-state">Unable to load profiles. Check your Firestore rules and internet connection.</div>';
    console.error("Student directory error:", error);
  }
}

function renderStudents() {
  const term = getValue("studentSearch").toLowerCase();
  const department = getValue("filterDepartment");
  const branch = getValue("filterBranch");
  const year = getValue("filterYear");
  const availability = getValue("filterAvailability");

  const filtered = allStudents.filter(student => {
    const studentBranch = normalizeBranch(student.branch);

    const matchesTerm = [
      student.name,
      student.department,
      branchName(studentBranch),
      student.about,
      ...(student.skills || [])
    ]
      .join(" ")
      .toLowerCase()
      .includes(term);

    return (
      matchesTerm &&
      (!department || student.department === department) &&
      (!branch || studentBranch === branch) &&
      (!year || student.year === year) &&
      (!availability || (student.available || "open") === availability)
    );
  });

  setText("studentCount", `${filtered.length} student${filtered.length === 1 ? "" : "s"}`);

  const grid = $("studentGrid");

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state">No matching student profiles found yet.</div>';
    return;
  }

  grid.innerHTML = filtered.map(student => {
    const initial = (student.name || "S").charAt(0).toUpperCase();

    const skills = (student.skills || [])
      .slice(0, 5)
      .map(skill => `<span class="skill-chip" data-skill="${escapeHtml(skill)}">${escapeHtml(skill)}</span>`)
      .join("");

    const status = (student.available || "open") === "open"
      ? '<span class="status-badge open">🟢 Looking for team</span>'
      : '<span class="status-badge full">⚪ Team full</span>';

    const github = safeUrl(student.github);
    const linkedin = safeUrl(student.linkedin);

    const links = [
      github ? `<a class="social-link" href="${escapeHtml(github)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : "",
      linkedin ? `<a class="social-link" href="${escapeHtml(linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ""
    ].join("");

    const outgoingReq = outgoingRequests.find(r => r.toUid === student.uid);
    const incomingAccepted = incomingRequests.find(r => r.fromUid === student.uid && r.status === "accepted");
    const acceptedReq = (outgoingReq && outgoingReq.status === "accepted") ? outgoingReq : incomingAccepted;

    let btnLabel = "Request Partner +";
    let btnClass = "request-btn";
    let btnMode = "request";
    let reqId = "";
    let disabledAttr = "";

    if (acceptedReq) {
      btnLabel = "Remove Partner";
      btnClass = "request-btn remove-partner";
      btnMode = "remove-partner";
      reqId = acceptedReq.id;
    } else if (outgoingReq && outgoingReq.status === "pending") {
      btnLabel = "Unrequest";
      btnClass = "request-btn unrequest";
      btnMode = "unrequest";
      reqId = outgoingReq.id;
    } else if (outgoingReq && outgoingReq.status === "declined") {
      btnLabel = "Declined ✕";
      btnClass = "request-btn declined";
      disabledAttr = "disabled";
    }

    const studentBranch = normalizeBranch(student.branch);
    const branchLine = studentBranch
      ? `<p class="branch-line">${escapeHtml(branchName(studentBranch))}</p>`
      : "";

    return `
      <article class="student-card">
        <div class="student-card-head">
          <div class="large-avatar">${escapeHtml(initial)}</div>
          <div>
            <h3>${escapeHtml(student.name || "RVU Student")}</h3>
            <p>${escapeHtml(student.department || "RV University")} · ${escapeHtml(student.year || "Student")}</p>
            ${branchLine}
            ${status}
          </div>
        </div>
        <p class="about">
          ${escapeHtml(student.about || "This student has not added an introduction yet.")}
        </p>
        <div class="skill-list">
          ${skills || '<span class="muted">No skills added yet</span>'}
        </div>
        <div class="card-actions">
          <div class="social-links">${links}</div>
          <button class="${btnClass}" data-request-uid="${escapeHtml(student.uid)}" data-mode="${btnMode}" data-req-id="${escapeHtml(reqId)}" ${disabledAttr}>
            ${btnLabel}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderCommunity() {
  const grid = $("branchGrid");
  if (!grid) return;

  const everyone = currentProfile ? [currentProfile, ...allStudents] : [...allStudents];
  const isOpen = student => (student.available || "open") === "open";
  const openCount = everyone.filter(isOpen).length;

  setText("statTotal", everyone.length);
  setText("statOpen", openCount);
  setText("statFull", everyone.length - openCount);

  const groups = BRANCHES.map(value => ({
    name: branchName(value),
    value,
    list: everyone.filter(student => normalizeBranch(student.branch) === value)
  }));

  const unset = everyone.filter(student => !BRANCHES.includes(normalizeBranch(student.branch)));
  if (unset.length) {
    groups.push({ name: "Branch not set", value: "", list: unset });
  }

  grid.innerHTML = groups.map(group => {
    const looking = group.list.filter(isOpen).length;
    const count = group.list.length;

    const inner = `
      <h3>${escapeHtml(group.name)}</h3>
      <strong>${count}</strong>
      <span>${count === 1 ? "student" : "students"} · ${looking} looking for a team</span>
      ${group.value ? '<span class="view-link">View students →</span>' : ""}
    `;

    return group.value
      ? `<button class="branch-card" type="button" data-branch="${escapeHtml(group.value)}">${inner}</button>`
      : `<div class="branch-card static">${inner}</div>`;
  }).join("");
}

$("branchGrid").addEventListener("click", event => {
  const card = event.target.closest("[data-branch]");
  if (!card) return;

  setValue("studentSearch", "");
  setValue("filterDepartment", "");
  setValue("filterYear", "");
  setValue("filterAvailability", "");
  setValue("filterBranch", card.dataset.branch);
  renderStudents();
  navigate("students");
});

$("studentGrid").addEventListener("click", async event => {
  const requestBtn = event.target.closest(".request-btn");
  if (requestBtn && !requestBtn.disabled) {
    const targetUid = requestBtn.dataset.requestUid;
    const targetStudent = allStudents.find(s => s.uid === targetUid);
    const mode = requestBtn.dataset.mode;
    const studentName = targetStudent ? targetStudent.name : "student";

    if (mode === "remove-partner") {
      const requestId = requestBtn.dataset.reqId;
      const confirmed = window.confirm(`Are you sure you want to end your partnership with ${studentName}? Both of you will be able to partner with other students again.`);
      if (!confirmed) return;
      await removePartner(requestId, studentName);
    } else if (mode === "unrequest") {
      const requestId = requestBtn.dataset.reqId;
      await unrequestPartner(requestId, studentName);
    } else if (mode === "request" && targetStudent) {
      await sendPartnerRequest(targetStudent);
    }
    return;
  }

  const chip = event.target.closest(".skill-chip");
  if (chip) {
    setValue("studentSearch", chip.dataset.skill);
    renderStudents();
  }
});

["studentSearch", "filterDepartment", "filterBranch", "filterYear", "filterAvailability"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener(id === "studentSearch" ? "input" : "change", renderStudents);
});

if (!configured || !auth || !db) {
  setAuthError("Firebase configuration is missing. Check your Firebase web app settings.");
} else {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      showAuth();
      return;
    }

    if (pendingSignup) return;

    await handleSignedIn(user);
  });
}

(function initFloatingBackground() {
  const canvas = document.getElementById("gradHatCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = reduceMotion ? 0.25 : 1;

  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);

  const pointer = {
    x: width / 2,
    y: height / 2,
    sx: width / 2,
    sy: height / 2,
    glow: 0,
    active: false
  };

  window.addEventListener("pointermove", event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  });

  document.documentElement.addEventListener("mouseleave", () => {
    pointer.active = false;
  });

  window.addEventListener("blur", () => {
    pointer.active = false;
  });

  const hatColors = [
    { top: "#233342", dark: "#101921", highlight: "#44596b", tassel: "#efc875" },
    { top: "#1a2530", dark: "#0c1218", highlight: "#314252", tassel: "#ffd56b" },
    { top: "#263545", dark: "#121b23", highlight: "#475d73", tassel: "#dfb253" },
    { top: "#2c3e50", dark: "#15202b", highlight: "#4c6882", tassel: "#f6cd6b" }
  ];

  const ribbonColors = ["#b91c1c", "#d7ad5a", "#1d4ed8"];
  const orbColors = ["215,173,90", "85,215,160", "100,160,255", "6,110,120", "215,173,90"];

  class Orb {
    constructor(index) {
      this.color = orbColors[index % orbColors.length];
      this.radius = Math.random() * 160 + 240;
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = (Math.random() - 0.5) * 0.2;
      this.phase = Math.random() * Math.PI * 2;
      this.pulse = Math.random() * 0.004 + 0.002;
    }

    update(dt) {
      this.x += this.vx * dt * motion;
      this.y += this.vy * dt * motion;
      this.phase += this.pulse * dt * motion;

      const m = this.radius;
      if (this.x < -m) this.x = width + m;
      if (this.x > width + m) this.x = -m;
      if (this.y < -m) this.y = height + m;
      if (this.y > height + m) this.y = -m;
    }

    draw() {
      const alpha = 0.07 + 0.04 * Math.sin(this.phase);
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
      gradient.addColorStop(0, `rgba(${this.color},${alpha})`);
      gradient.addColorStop(1, `rgba(${this.color},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
    }
  }

  class Spark {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : height + 10;
      this.r = Math.random() * 1.4 + 0.5;
      this.vy = Math.random() * 0.18 + 0.05;
      this.drift = (Math.random() - 0.5) * 0.08;
      this.phase = Math.random() * Math.PI * 2;
      this.twinkle = Math.random() * 0.04 + 0.015;
    }

    update(dt) {
      this.y -= this.vy * dt * motion;
      this.x += this.drift * dt * motion;
      this.phase += this.twinkle * dt * motion;

      if (this.y < -10) this.reset(false);
    }

    draw() {
      const alpha = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(this.phase));

      ctx.fillStyle = `rgba(239,200,117,${alpha})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();

      if (this.r > 1.3) {
        const l = this.r * 3.2;
        ctx.strokeStyle = `rgba(255,236,170,${alpha * 0.7})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(this.x - l, this.y);
        ctx.lineTo(this.x + l, this.y);
        ctx.moveTo(this.x, this.y - l);
        ctx.lineTo(this.x, this.y + l);
        ctx.stroke();
      }
    }
  }

  class Floater {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.kind = Math.random() < 0.22 ? "scroll" : "hat";
      this.depth = 0.35 + Math.random() * 0.65;
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : height + 60;
      this.size = (Math.random() * 14 + 20) * (0.6 + 0.7 * this.depth);
      this.speedY = (Math.random() * 0.5 + 0.3) * (0.5 + this.depth);
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.rotation = (Math.random() - 0.5) * 0.45;
      this.rotationSpeed = (Math.random() - 0.5) * 0.008;
      this.swayAngle = Math.random() * Math.PI * 2;
      this.swaySpeed = Math.random() * 0.015 + 0.008;
      this.flip = Math.random() * Math.PI * 2;
      this.flipSpeed = Math.random() * 0.015 + 0.008;
      this.opacity = 0.25 + this.depth * 0.45 + Math.random() * 0.1;
      this.ex = 0;
      this.ey = 0;
      this.hat = hatColors[Math.floor(Math.random() * hatColors.length)];
      this.ribbon = ribbonColors[Math.floor(Math.random() * ribbonColors.length)];
    }

    update(dt) {
      const step = dt * motion;

      this.y -= this.speedY * step;
      this.swayAngle += this.swaySpeed * step;
      this.x += (Math.sin(this.swayAngle) * 0.45 + this.speedX) * step;
      this.rotation += this.rotationSpeed * step;
      this.flip += this.flipSpeed * step;

      if (pointer.active && !reduceMotion) {
        const dx = this.x - pointer.sx;
        const dy = this.y - pointer.sy;
        const d = Math.hypot(dx, dy);

        if (d > 1 && d < 160) {
          const force = (1 - d / 160) * 0.5;
          this.ex += (dx / d) * force * dt;
          this.ey += (dy / d) * force * dt;
        }
      }

      this.ex = Math.max(-4, Math.min(4, this.ex));
      this.ey = Math.max(-4, Math.min(4, this.ey));

      this.x += this.ex * dt;
      this.y += this.ey * dt;

      const decay = Math.pow(0.93, dt);
      this.ex *= decay;
      this.ey *= decay;

      if (this.y < -80 || this.x < -90 || this.x > width + 90) {
        this.reset(false);
      }
    }

    drawHat(s) {
      ctx.save();

      ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;

      const skullGrad = ctx.createLinearGradient(0, s * 0.02, 0, s * 0.42);
      skullGrad.addColorStop(0, this.hat.top);
      skullGrad.addColorStop(1, this.hat.dark);

      ctx.fillStyle = skullGrad;
      ctx.beginPath();
      ctx.moveTo(-s * 0.44, s * 0.04);
      ctx.bezierCurveTo(-s * 0.46, s * 0.36, s * 0.46, s * 0.36, s * 0.44, s * 0.04);
      ctx.closePath();
      ctx.fill();

      ctx.shadowColor = "transparent";

      const rimGrad = ctx.createLinearGradient(0, s * 0.25, 0, s * 0.36);
      rimGrad.addColorStop(0, "rgba(255, 255, 255, 0.16)");
      rimGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 1;
      ctx.stroke();

      const edgeGrad = ctx.createLinearGradient(0, -s * 0.08, 0, s * 0.36);
      edgeGrad.addColorStop(0, this.hat.dark);
      edgeGrad.addColorStop(1, "#070c10");
      ctx.fillStyle = edgeGrad;

      ctx.beginPath();
      ctx.moveTo(-s * 0.92, -s * 0.04);
      ctx.lineTo(0, s * 0.34);
      ctx.lineTo(s * 0.92, -s * 0.04);
      ctx.lineTo(s * 0.92, s * 0.02);
      ctx.lineTo(0, s * 0.40);
      ctx.lineTo(-s * 0.92, s * 0.02);
      ctx.closePath();
      ctx.fill();

      const topGrad = ctx.createLinearGradient(-s * 0.6, -s * 0.45, s * 0.6, s * 0.35);
      topGrad.addColorStop(0, this.hat.highlight);
      topGrad.addColorStop(0.5, this.hat.top);
      topGrad.addColorStop(1, this.hat.dark);

      ctx.fillStyle = topGrad;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.42);
      ctx.lineTo(s * 0.92, -s * 0.04);
      ctx.lineTo(0, s * 0.34);
      ctx.lineTo(-s * 0.92, -s * 0.04);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      const cordGrad = ctx.createLinearGradient(0, -s * 0.04, s * 0.66, s * 0.62);
      cordGrad.addColorStop(0, "#ffeaa0");
      cordGrad.addColorStop(0.6, this.hat.tassel);
      cordGrad.addColorStop(1, "#996f05");

      ctx.strokeStyle = cordGrad;
      ctx.lineWidth = Math.max(1.8, s * 0.055);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.04);
      ctx.bezierCurveTo(s * 0.36, -s * 0.02, s * 0.7, s * 0.18, s * 0.66, s * 0.52);
      ctx.stroke();

      const buttonGrad = ctx.createRadialGradient(-s * 0.02, -s * 0.06, 1, 0, -s * 0.04, s * 0.09);
      buttonGrad.addColorStop(0, "#fff5cc");
      buttonGrad.addColorStop(0.5, this.hat.tassel);
      buttonGrad.addColorStop(1, "#8a6605");

      ctx.fillStyle = buttonGrad;
      ctx.beginPath();
      ctx.arc(0, -s * 0.04, s * 0.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#8a6605";
      ctx.beginPath();
      ctx.ellipse(s * 0.66, s * 0.53, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();

      const tasselGrad = ctx.createLinearGradient(s * 0.58, s * 0.54, s * 0.74, s * 0.86);
      tasselGrad.addColorStop(0, "#ffeaa0");
      tasselGrad.addColorStop(0.5, this.hat.tassel);
      tasselGrad.addColorStop(1, "#8f6904");

      ctx.fillStyle = tasselGrad;
      ctx.beginPath();
      ctx.moveTo(s * 0.61, s * 0.54);
      ctx.lineTo(s * 0.71, s * 0.54);
      ctx.lineTo(s * 0.77, s * 0.88);
      ctx.lineTo(s * 0.55, s * 0.88);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
      ctx.lineWidth = 0.75;
      for (let t = -0.06; t <= 0.06; t += 0.03) {
        ctx.beginPath();
        ctx.moveTo(s * 0.66 + s * t, s * 0.56);
        ctx.lineTo(s * 0.66 + s * t * 1.5, s * 0.88);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawScroll(s) {
      const half = s * 0.75;
      const r = s * 0.18;

      ctx.fillStyle = "#f3e9c8";
      ctx.fillRect(-half, -r, half * 2, r * 2);

      ctx.fillStyle = "#e2d3a6";
      ctx.beginPath();
      ctx.ellipse(-half, 0, r * 0.55, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 95, 40, 0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(-half, 0, r * 0.25, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#f8f0d6";
      ctx.beginPath();
      ctx.ellipse(half, 0, r * 0.55, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 95, 40, 0.55)";
      ctx.stroke();

      ctx.strokeStyle = "rgba(120, 95, 40, 0.35)";
      ctx.beginPath();
      ctx.moveTo(-half, -r);
      ctx.lineTo(half, -r);
      ctx.moveTo(-half, r);
      ctx.lineTo(half, r);
      ctx.stroke();

      ctx.fillStyle = this.ribbon;
      ctx.fillRect(-s * 0.09, -r - 1, s * 0.18, r * 2 + 2);

      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(-s * 0.14, r + s * 0.28);
      ctx.lineTo(-s * 0.04, r + s * 0.2);
      ctx.lineTo(0, r + s * 0.3);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(s * 0.14, r + s * 0.28);
      ctx.lineTo(s * 0.04, r + s * 0.2);
      ctx.lineTo(0, r + s * 0.3);
      ctx.closePath();
      ctx.fill();
    }

    draw() {
      const fadeIn = Math.min(1, Math.max(0, (height + 60 - this.y) / 120));
      const fadeOut = Math.min(1, Math.max(0, (this.y + 70) / 160));
      const alpha = this.opacity * Math.min(fadeIn, fadeOut);

      if (alpha <= 0.01) return;

      const offsetX = (pointer.sx - width / 2) * -0.025 * this.depth;
      const offsetY = (pointer.sy - height / 2) * -0.025 * this.depth;
      const tilt = 0.65 + 0.35 * Math.cos(this.flip);

      ctx.save();
      ctx.translate(this.x + offsetX, this.y + offsetY);
      ctx.rotate(this.rotation);
      ctx.scale(1, tilt);
      ctx.globalAlpha = alpha;

      if (this.kind === "hat") {
        this.drawHat(this.size);
      } else {
        this.drawScroll(this.size);
      }

      ctx.restore();
    }
  }

  const orbs = [];
  const sparks = [];
  const items = [];

  const ORB_COUNT = 5;
  const SPARK_COUNT = Math.round(Math.min(90, Math.max(35, width / 18)));
  const ITEM_COUNT = Math.round(Math.min(36, Math.max(16, width / 45)));

  for (let i = 0; i < ORB_COUNT; i++) orbs.push(new Orb(i));
  for (let i = 0; i < SPARK_COUNT; i++) sparks.push(new Spark());
  for (let i = 0; i < ITEM_COUNT; i++) items.push(new Floater());

  items.sort((a, b) => a.depth - b.depth);

  let last = performance.now();

  function animate(now) {
    const dt = Math.min(3, (now - last) / 16.667);
    last = now;

    ctx.clearRect(0, 0, width, height);

    const targetX = pointer.active ? pointer.x : width / 2;
    const targetY = pointer.active ? pointer.y : height / 2;
    const ease = Math.min(1, 0.06 * dt);

    pointer.sx += (targetX - pointer.sx) * ease;
    pointer.sy += (targetY - pointer.sy) * ease;
    pointer.glow += ((pointer.active ? 1 : 0) - pointer.glow) * Math.min(1, 0.08 * dt);

    for (let i = 0; i < orbs.length; i++) {
      orbs[i].update(dt);
      orbs[i].draw();
    }

    if (pointer.glow > 0.01) {
      const glow = ctx.createRadialGradient(pointer.sx, pointer.sy, 0, pointer.sx, pointer.sy, 180);
      glow.addColorStop(0, `rgba(239,200,117,${0.1 * pointer.glow})`);
      glow.addColorStop(1, "rgba(239,200,117,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(pointer.sx - 180, pointer.sy - 180, 360, 360);
    }

    for (let i = 0; i < sparks.length; i++) {
      sparks[i].update(dt);
      sparks[i].draw();
    }

    for (let i = 0; i < items.length; i++) {
      items[i].update(dt);
      items[i].draw();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();