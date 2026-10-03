(function(){
  "use strict";

  const API = ""; 
  const STORAGE_KEY = "careeriq_user_session";

  const state = {
    user: null,
    applicantId: null,
    applicantName: null,
    file: null,
    lastEvaluation: null,
    positions: [],
    selectedPositionId: null
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function escapeHtml(str){
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function icon(name){
    const icons = {
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>',
      circle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>'
    };
    return icons[name] || '';
  }

  function toast(msg, type){
    const stack = $("#toastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, 3600);
  }

  async function api(path, opts){
    const res = await fetch(API + path, Object.assign({
      headers: { "Content-Type": "application/json" }
    }, opts));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error){
      throw new Error(data.detail || data.error || ("Request failed (" + res.status + ")"));
    }
    return data;
  }

  function openModal(id){
    const el = $("#" + id);
    if (el) {
      el.classList.add("open");
      el.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  }
  function closeModal(id){
    const el = $("#" + id);
    if (el) {
      el.classList.remove("open");
      el.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  $$(".modal-backdrop").forEach(bd => {
    bd.addEventListener("click", (e) => { if (e.target === bd) closeModal(bd.id); });
  });
  $$("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.closest(".modal-backdrop").id));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modal-backdrop.open").forEach(bd => closeModal(bd.id));
  });

  const root = document.documentElement;
  const themeToggle = $("#themeToggle");
  function applyTheme(t){
    root.setAttribute("data-theme", t);
    if (themeToggle) themeToggle.setAttribute("aria-checked", String(t === "dark"));
    try { localStorage.setItem("careeriq-theme", t); } catch(e){}
  }
  if (themeToggle){
    themeToggle.addEventListener("click", () => {
      const current = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(current);
    });
  }

  /* --- Auth & Session --- */
  const navSignInBtn = $("#navSignInBtn");
  const navProfileBtn = $("#navProfileBtn");
  const navAvatar = $("#navAvatar");
  const navProfileEmail = $("#navProfileEmail");
  const authStepForm = $("#authStepForm");
  const authStepProfile = $("#authStepProfile");
  const authStepReset = $("#authStepReset");
  const authForm = $("#authForm");
  const authEmail = $("#authEmail");
  const authPassword = $("#authPassword");
  const authFullName = $("#authFullName");
  const authNameField = $("#authNameField");
  const authError = $("#authError");
  const authSignOutBtn = $("#authSignOutBtn");
  const authAvatar = $("#authAvatar");
  const authProfileEmail = $("#authProfileEmail");
  const authProfileRoleBadge = $("#authProfileRoleBadge");

  const authRoleCandidateBtn = $("#authRoleCandidateBtn");
  const authRoleRecruiterBtn = $("#authRoleRecruiterBtn");
  const authRoleInput = $("#authRoleInput");
  const authModeInput = $("#authModeInput");
  const authPasscodeField = $("#authPasscodeField");
  const authRecruiterKey = $("#authRecruiterKey");
  const authTabLogin = $("#authTabLogin");
  const authTabRegister = $("#authTabRegister");
  const authSubmitBtn = $("#authSubmitBtn");
  const authForgotBtn = $("#authForgotBtn");

  function setAuthMode(mode){
    if (authModeInput) authModeInput.value = mode;
    const isReg = mode === "REGISTER";
    if (authNameField) authNameField.style.display = isReg ? "block" : "none";
    if (authTabLogin && authTabRegister){
      authTabLogin.style.borderBottom = isReg ? "2px solid transparent" : "2px solid var(--accent)";
      authTabLogin.style.color = isReg ? "var(--ink-soft)" : "var(--ink)";
      authTabRegister.style.borderBottom = isReg ? "2px solid var(--accent)" : "2px solid transparent";
      authTabRegister.style.color = isReg ? "var(--ink)" : "var(--ink-soft)";
    }
    if (authSubmitBtn) authSubmitBtn.textContent = isReg ? "Create Account" : "Sign In";
  }

  if (authTabLogin) authTabLogin.addEventListener("click", () => setAuthMode("LOGIN"));
  if (authTabRegister) authTabRegister.addEventListener("click", () => setAuthMode("REGISTER"));

  function setAuthRole(role){
    if (authRoleInput) authRoleInput.value = role;
    const isRecruiter = role === "RECRUITER";
    if (authRoleRecruiterBtn) authRoleRecruiterBtn.className = isRecruiter ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost";
    if (authRoleCandidateBtn) authRoleCandidateBtn.className = isRecruiter ? "btn btn-sm btn-ghost" : "btn btn-sm btn-primary";
    if (authPasscodeField) authPasscodeField.style.display = isRecruiter ? "block" : "none";
    const title = $("#authModalTitle");
    if (title) title.textContent = isRecruiter ? "Recruiter Portal" : "Candidate Portal";
  }

  if (authRoleCandidateBtn) authRoleCandidateBtn.addEventListener("click", () => setAuthRole("APPLICANT"));
  if (authRoleRecruiterBtn) authRoleRecruiterBtn.addEventListener("click", () => setAuthRole("RECRUITER"));

  function setUserSession(userData, notify = true){
    state.user = userData;
    state.applicantId = userData.applicant_id;
    state.applicantName = userData.full_name;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); } catch(e){}

    const initial = (userData.full_name || userData.email || "U").charAt(0).toUpperCase();
    if (navAvatar) navAvatar.textContent = initial;
    if (navProfileEmail) navProfileEmail.textContent = userData.email;
    if (navSignInBtn) navSignInBtn.hidden = true;
    if (navProfileBtn) navProfileBtn.hidden = false;

    if (authAvatar) authAvatar.textContent = initial;
    if (authProfileEmail) authProfileEmail.textContent = userData.email;
    if (authProfileRoleBadge) {
      authProfileRoleBadge.textContent = userData.role === "RECRUITER" ? "🛡️ Verified Recruiter" : "🎓 Applicant";
    }
    if (authStepForm) authStepForm.style.display = "none";
    if (authStepReset) authStepReset.style.display = "none";
    if (authStepProfile) authStepProfile.style.display = "block";

    if (notify) toast("Signed in as " + userData.email + " (" + userData.role + ")", "success");
  }

  function clearUserSession(){
    state.user = null;
    state.applicantId = null;
    state.applicantName = null;
    state.lastEvaluation = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}

    if (navSignInBtn) navSignInBtn.hidden = false;
    if (navProfileBtn) navProfileBtn.hidden = true;
    if (authStepForm) authStepForm.style.display = "block";
    if (authStepReset) authStepReset.style.display = "none";
    if (authStepProfile) authStepProfile.style.display = "none";

    closeModal("modalAuth");
    toast("Signed out successfully.");
    showView("home");
  }

  if (navSignInBtn) navSignInBtn.addEventListener("click", () => {
    setAuthRole("APPLICANT");
    setAuthMode("LOGIN");
    if (authStepForm) authStepForm.style.display = "block";
    if (authStepReset) authStepReset.style.display = "none";
    if (authStepProfile) authStepProfile.style.display = "none";
    openModal("modalAuth");
  });
  if (navProfileBtn) navProfileBtn.addEventListener("click", () => openModal("modalAuth"));
  if (authSignOutBtn) authSignOutBtn.addEventListener("click", clearUserSession);

  if (authForm){
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = (authEmail && authEmail.value || "").trim();
      const password = (authPassword && authPassword.value || "").trim();
      const role = (authRoleInput && authRoleInput.value) || "APPLICANT";
      const mode = (authModeInput && authModeInput.value) || "LOGIN";
      const key = (authRecruiterKey && authRecruiterKey.value || "").trim();
      const name = (authFullName && authFullName.value || "").trim();

      if (!email || !password){
        if (authError){ authError.textContent = "Please enter both email and password."; authError.style.display = "block"; }
        return;
      }
      if (mode === "REGISTER" && role === "APPLICANT" && !name){
        if (authError){ authError.textContent = "Please enter your full name."; authError.style.display = "block"; }
        return;
      }

      if (authSubmitBtn) { authSubmitBtn.disabled = true; authSubmitBtn.textContent = "Processing…"; }
      if (authError) authError.style.display = "none";

      try {
        const endpoint = mode === "REGISTER" ? "/api/auth/register" : "/api/auth/login";
        const payload = mode === "REGISTER" 
          ? { email, password, full_name: name || email.split("@")[0], role, invite_code: key }
          : { email, password, role };

        const data = await api(endpoint, {
          method: "POST",
          body: JSON.stringify(payload)
        });

        setUserSession(data);
        closeModal("modalAuth");

        if (data.role === "RECRUITER"){
          showView("recruiter");
        } else if (state.selectedPositionId){
          switchDashboardPosition(state.selectedPositionId);
        }
      } catch(err){
        if (authError){ authError.textContent = err.message || "Authentication failed."; authError.style.display = "block"; }
      } finally {
        if (authSubmitBtn) {
          authSubmitBtn.disabled = false;
          authSubmitBtn.textContent = mode === "REGISTER" ? "Create Account" : "Sign In";
        }
      }
    });
  }

  /* --- Password Reset --- */
  const backToSignInBtn = $("#backToSignInBtn");
  const sendResetCodeBtn = $("#sendResetCodeBtn");
  const confirmResetBtn = $("#confirmResetBtn");
  const resetEmailInput = $("#resetEmailInput");
  const resetCodeInput = $("#resetCodeInput");
  const resetNewPassInput = $("#resetNewPassInput");
  const resetError = $("#resetError");

  if (authForgotBtn) {
    authForgotBtn.addEventListener("click", () => {
      if (authEmail && resetEmailInput) resetEmailInput.value = authEmail.value;
      if (authStepForm) authStepForm.style.display = "none";
      if (authStepReset) authStepReset.style.display = "block";
      if (resetError) resetError.style.display = "none";
    });
  }

  if (backToSignInBtn) {
    backToSignInBtn.addEventListener("click", () => {
      if (authStepReset) authStepReset.style.display = "none";
      if (authStepForm) authStepForm.style.display = "block";
    });
  }

  if (sendResetCodeBtn) {
    sendResetCodeBtn.addEventListener("click", async () => {
      const email = (resetEmailInput && resetEmailInput.value || "").trim();
      if (!email) {
        if (resetError) { resetError.textContent = "Please enter your email."; resetError.style.display = "block"; }
        return;
      }
      sendResetCodeBtn.disabled = true;
      sendResetCodeBtn.textContent = "Sending...";
      if (resetError) resetError.style.display = "none";

      try {
        await api("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email })
        });
        toast("Code dispatched! Check your console/email.", "success");
      } catch(err) {
        if (resetError) { resetError.textContent = err.message || "Failed to dispatch code."; resetError.style.display = "block"; }
      } finally {
        sendResetCodeBtn.disabled = false;
        sendResetCodeBtn.textContent = "Send Code";
      }
    });
  }

  if (confirmResetBtn) {
    confirmResetBtn.addEventListener("click", async () => {
      const email = (resetEmailInput && resetEmailInput.value || "").trim();
      const code = (resetCodeInput && resetCodeInput.value || "").trim();
      const new_password = (resetNewPassInput && resetNewPassInput.value || "").trim();

      if (!email || !code || !new_password) {
        if (resetError) { resetError.textContent = "Please fill in all fields."; resetError.style.display = "block"; }
        return;
      }

      confirmResetBtn.disabled = true;
      confirmResetBtn.textContent = "Updating...";
      if (resetError) resetError.style.display = "none";

      try {
        await api("/api/auth/confirm-reset", {
          method: "POST",
          body: JSON.stringify({ email, reset_code: code, new_password })
        });
        toast("Password updated! Please sign in.", "success");
        if (authStepReset) authStepReset.style.display = "none";
        if (authStepForm) authStepForm.style.display = "block";
        if (authPassword) authPassword.value = new_password;
      } catch(err) {
        if (resetError) { resetError.textContent = err.message || "Reset failed."; resetError.style.display = "block"; }
      } finally {
        confirmResetBtn.disabled = false;
        confirmResetBtn.textContent = "Save & Reset Password";
      }
    });
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.email) setUserSession(parsed, false);
    }
  } catch(e){}

  /* --- Navigation Views --- */
  function showView(name, scrollToId = null){
    const home = $("#view-home");
    const dash = $("#view-dashboard");
    const analyze = $("#view-analyze");
    const recView = $("#view-recruiter");
    const myAppsView = $("#view-my-applications");

    if (home) home.classList.add("hidden");
    if (dash) dash.classList.remove("active");
    if (analyze) analyze.classList.remove("active");
    if (recView) recView.classList.remove("active");
    if (myAppsView) myAppsView.classList.remove("active");

    if (name === "dashboard"){
      if (!state.applicantId){
        toast("Please sign in or upload your resume first.");
        resetUploadModal();
        openModal("modalUpload");
        if (home) home.classList.remove("hidden");
        return;
      }
      if (dash) dash.classList.add("active");
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    } else if (name === "my-applications"){
      if (!state.applicantId){
        toast("Please sign in or upload your resume to view your applications.");
        resetUploadModal();
        openModal("modalUpload");
        if (home) home.classList.remove("hidden");
        return;
      }
      if (myAppsView) myAppsView.classList.add("active");
      loadMyApplications();
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    } else if (name === "analyze"){
      if (analyze) analyze.classList.add("active");
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    } else if (name === "recruiter"){
      if (!state.user || state.user.role !== "RECRUITER"){
        toast("Recruiter authorization required.", "error");
        setAuthRole("RECRUITER");
        setAuthMode("LOGIN");
        if (authStepForm) authStepForm.style.display = "block";
        if (authStepReset) authStepReset.style.display = "none";
        if (authStepProfile) authStepProfile.style.display = "none";
        openModal("modalAuth");
        if (home) home.classList.remove("hidden");
        return;
      }
      if (recView) recView.classList.add("active");
      populateRecruiterDropdown();
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    } else {
      if (home) home.classList.remove("hidden");
      if (scrollToId){
        setTimeout(() => {
          const target = document.getElementById(scrollToId);
          if (target) target.scrollIntoView({ behavior: "smooth" });
        }, 60);
      } else {
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
      }
    }

    $$(".nav-links a[data-nav], .nav-mobile a[data-nav]").forEach(a => {
      a.classList.toggle("active", a.dataset.nav === name && !a.dataset.scroll);
    });
  }

  $$("[data-nav]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const view = el.dataset.nav;
      const targetScroll = el.dataset.scroll || null;
      showView(view, targetScroll);

      const navMobile = $("#navMobile");
      if (navMobile) navMobile.classList.remove("open");
    });
  });

  const burgerBtn = $("#burgerBtn");
  const navMobile = $("#navMobile");
  if (burgerBtn && navMobile){
    burgerBtn.addEventListener("click", () => {
      navMobile.classList.toggle("open");
    });
  }
  $$("#navMobile [data-close]").forEach(a => {
    a.addEventListener("click", () => {
      if (navMobile) navMobile.classList.remove("open");
    });
  });

  /* --- Resume Upload & Analysis Flow --- */
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const analyzeBtn = $("#analyzeBtn");
  const dzFilename = $("#dzFilename");

  function setFile(f){
    if (!f) return;
    if (!/\.(pdf|docx?|txt)$/i.test(f.name)){
      toast("Please upload a PDF, DOCX or TXT file.", "error");
      return;
    }
    state.file = f;
    if (dzFilename){
      dzFilename.textContent = "Selected: " + f.name;
      dzFilename.style.display = "block";
    }
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.style.opacity = "1";
      analyzeBtn.style.pointerEvents = "auto";
    }
    toast("Attached " + f.name);
  }

  function resetUploadModal(){
    state.file = null;
    if (fileInput) fileInput.value = "";
    if (dzFilename) dzFilename.style.display = "none";
    if (analyzeBtn) analyzeBtn.disabled = true;
    const formStep = $("#uploadStepForm");
    const loadStep = $("#uploadStepLoading");
    const succStep = $("#uploadStepSuccess");
    if (formStep) formStep.style.display = "block";
    if (loadStep) loadStep.style.display = "none";
    if (succStep) succStep.style.display = "none";
    $$(".loading-substep").forEach(s => s.classList.remove("active","done"));
  }

  ["navUploadBtn","navUploadBtnMobile","heroUploadBtn","ciUploadBtn","finalUploadBtn"].forEach(id => {
    const el = $("#" + id);
    if (el) el.addEventListener("click", () => {
      resetUploadModal();
      openModal("modalUpload");
      if (navMobile) navMobile.classList.remove("open");
    });
  });

  if (fileInput){
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        setFile(e.target.files[0]);
      }
    });
  }

  if (dropzone){
    dropzone.style.position = "relative";
    ["dragenter","dragover"].forEach(evt => dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); dropzone.classList.add("drag");
    }));
    ["dragleave","drop"].forEach(evt => dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); dropzone.classList.remove("drag");
    }));
    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        setFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (analyzeBtn) analyzeBtn.addEventListener("click", runAnalysisFlow);

  async function runAnalysisFlow(){
    if (!state.file) {
      toast("Please select a file first.", "error");
      return;
    }

    $("#uploadStepForm").style.display = "none";
    $("#uploadStepLoading").style.display = "block";

    const messages = [
      "Analyzing your resume…",
      "Extracting skills…",
      "Checking career opportunities…",
      "Finding your skill gaps…"
    ];
    const msgEl = $("#loadingMsg");
    let mi = 0;
    if (msgEl) msgEl.textContent = messages[0];
    const msgTimer = setInterval(() => {
      mi = (mi + 1) % messages.length;
      if (msgEl) msgEl.textContent = messages[mi];
    }, 1100);

    const substeps = $$(".loading-substep");
    function markStep(i){
      substeps.forEach((s, idx) => {
        s.classList.toggle("done", idx < i);
        s.classList.toggle("active", idx === i);
      });
    }
    markStep(0);

    try{
      const targetUserId = (state.user && state.user.user_id) ? state.user.user_id : 1;
      const formData = new FormData();
      formData.append("file", state.file);
      formData.append("user_id", targetUserId);

      const res = await fetch(API + "/api/applicants/upload-resume", {
        method: "POST",
        body: formData
      });

      const uploadData = await res.json().catch(() => ({}));
      if (!res.ok || uploadData.error) {
        throw new Error(uploadData.detail || uploadData.error || ("Upload failed (" + res.status + ")"));
      }

      state.applicantId = uploadData.applicant_id;
      if (state.user) {
        state.user.applicant_id = uploadData.applicant_id;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user)); } catch(e){}
      }
      markStep(1);

      try {
        const parsed = await api("/api/applicants/" + state.applicantId + "/parse-resume", { method: "POST" });
        if (parsed.ai_result && parsed.ai_result.full_name){
          state.applicantName = parsed.ai_result.full_name;
        }
      } catch(parseErr){
        console.warn("Parse note:", parseErr);
      }
      markStep(2);

      const targetPosId = state.selectedPositionId || (state.positions[0] && state.positions[0].position_id) || 1;
      const evaluation = await api("/api/applicants/" + state.applicantId + "/evaluate/" + targetPosId);
      state.lastEvaluation = evaluation;
      markStep(3);

      clearInterval(msgTimer);
      $("#uploadStepLoading").style.display = "none";
      $("#uploadStepSuccess").style.display = "block";

      setTimeout(() => {
        closeModal("modalUpload");
        renderDashboard(evaluation);
        showView("dashboard");
        toast("Resume analyzed successfully!", "success");
      }, 900);

    } catch(err){
      clearInterval(msgTimer);
      $("#uploadStepLoading").style.display = "none";
      $("#uploadStepForm").style.display = "block";
      toast(err.message || "Failed analyzing resume.", "error");
    }
  }

  /* --- Dashboard & Switcher --- */
  const dashPositionSelect = $("#dashPositionSelect");
  const dashApplyBtn = $("#dashApplyBtn");

  function populatePositionDropdown(){
    if (!dashPositionSelect) return;
    dashPositionSelect.innerHTML = "";
    state.positions.forEach(pos => {
      const opt = document.createElement("option");
      opt.value = pos.position_id;
      opt.textContent = pos.title + " (" + (pos.company || "") + ")";
      if (pos.position_id === state.selectedPositionId) opt.selected = true;
      dashPositionSelect.appendChild(opt);
    });
  }

  if (dashPositionSelect){
    dashPositionSelect.addEventListener("change", (e) => {
      const posId = Number(e.target.value);
      state.selectedPositionId = posId;
      switchDashboardPosition(posId);
    });
  }

  async function switchDashboardPosition(positionId){
    if (!state.applicantId) return;
    try {
      const evaluation = await api("/api/applicants/" + state.applicantId + "/evaluate/" + positionId);
      state.lastEvaluation = evaluation;
      renderDashboard(evaluation);
    } catch(err){
      toast("Could not evaluate against this role: " + err.message, "error");
    }
  }

  async function checkApplicationStatus(positionId){
    if (!dashApplyBtn || !state.applicantId) return;
    try {
      const res = await api("/api/applications/status/" + state.applicantId + "/" + positionId);
      if (res.has_applied){
        dashApplyBtn.textContent = "✓ Applied";
        dashApplyBtn.classList.add("btn-applied");
        dashApplyBtn.disabled = true;
      } else {
        dashApplyBtn.textContent = "Apply for this Role";
        dashApplyBtn.classList.remove("btn-applied");
        dashApplyBtn.disabled = false;
      }
    } catch(e){}
  }

  if (dashApplyBtn){
    dashApplyBtn.addEventListener("click", async () => {
      if (!state.applicantId){
        toast("Please sign in or upload your resume before applying.");
        return;
      }
      const posId = state.selectedPositionId || (state.lastEvaluation && state.lastEvaluation.position_id);
      if (!posId) return;

      dashApplyBtn.disabled = true;
      dashApplyBtn.textContent = "Submitting…";

      try {
        const score = (state.lastEvaluation && (state.lastEvaluation.match_score ?? state.lastEvaluation.match_percentage)) || 0;
        await api("/api/applications/apply", {
          method: "POST",
          body: JSON.stringify({
            applicant_id: state.applicantId,
            position_id: posId,
            match_score: score
          })
        });

        toast("Successfully submitted your application!", "success");
        checkApplicationStatus(posId);
      } catch(err){
        toast(err.message || "Failed to submit application.", "error");
        dashApplyBtn.disabled = false;
        dashApplyBtn.textContent = "Apply for this Role";
      }
    });
  }

  function renderDashboard(evaluation){
    const name = state.applicantName || (state.user && state.user.full_name) || evaluation.applicant_name || "there";
    $("#dashGreeting").textContent = "Good day, " + name.split(" ")[0] + " 👋";
    $("#dashSub").textContent = "Here's how your resume matches against " + evaluation.position + ".";

    if (dashPositionSelect && evaluation.position_id){
      dashPositionSelect.value = evaluation.position_id;
      state.selectedPositionId = evaluation.position_id;
    }

    const score = Math.round(Number(evaluation.match_score ?? evaluation.match_percentage) || 0);
    $("#cardScore").textContent = score + "%";
    $("#cardEligible").textContent = evaluation.eligible ? "Eligible" : "Not eligible";
    $("#cardEligible").parentElement.querySelector(".dash-card-icon").style.color =
      evaluation.eligible ? "var(--good)" : "var(--bad)";
    $("#cardSkills").textContent = (evaluation.matched_skills || []).length;
    $("#cardGaps").textContent = (evaluation.missing_skills || []).length;

    const list = $("#dashGapsList");
    list.innerHTML = "";
    if (!evaluation.missing_skills || evaluation.missing_skills.length === 0){
      list.innerHTML = '<div class="empty-state"><h4>No skill gaps found</h4><p>Your skills fully cover this role\'s requirements.</p></div>';
    } else {
      evaluation.missing_skills.forEach(skill => {
        const row = document.createElement("div");
        row.className = "gap-card";
        row.innerHTML =
          '<div class="gap-card-left"><span class="gap-dot"></span>' + escapeHtml(skill) + '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn btn-sm btn-ghost" data-learned-skill="' + escapeHtml(skill) + '">Mark Learned</button>' +
            '<button class="btn btn-sm btn-secondary" data-learn="' + escapeHtml(skill) + '">Learn ' + escapeHtml(skill) + '</button>' +
          '</div>';
        list.appendChild(row);
      });
      $$("[data-learn]", list).forEach(btn => {
        btn.addEventListener("click", () => openLearningModal(btn.dataset.learn, evaluation.position_id));
      });
      $$("[data-learned-skill]", list).forEach(btn => {
        btn.addEventListener("click", () => addLearnedSkill(btn.dataset.learnedSkill, evaluation.position_id));
      });
    }

    checkApplicationStatus(evaluation.position_id);
  }

  const addSkillBtn = $("#addSkillBtn");
  if (addSkillBtn){
    addSkillBtn.addEventListener("click", async () => {
      if (!state.applicantId){
        toast("Please sign in or upload your resume first.");
        return;
      }
      const skillName = prompt("Enter a skill you have learned (e.g. Docker, Redis, Kubernetes):");
      if (skillName && skillName.trim()){
        await addLearnedSkill(skillName.trim(), state.selectedPositionId || (state.lastEvaluation && state.lastEvaluation.position_id) || 1);
      }
    });
  }

  async function addLearnedSkill(skillName, positionId){
    try {
      await api("/api/applicants/" + state.applicantId + "/add-skill", {
        method: "POST",
        body: JSON.stringify({ skill_name: skillName })
      });
      toast("Added " + skillName + " to your profile!", "success");

      const evaluation = await api("/api/applicants/" + state.applicantId + "/evaluate/" + (positionId || 1));
      state.lastEvaluation = evaluation;
      renderDashboard(evaluation);
    } catch(err) {
      toast(err.message || "Could not add skill.", "error");
    }
  }

  /* --- Dynamic Positions --- */
  async function loadPositions(){
    const grid = $("#posGrid");
    try {
      const positions = await api("/api/jobs");
      state.positions = positions || [];
      if (positions.length && !state.selectedPositionId){
        state.selectedPositionId = positions[0].position_id;
      }
      populatePositionDropdown();

      if (!grid) return;
      grid.innerHTML = "";
      if (!positions || positions.length === 0){
        grid.innerHTML = '<div class="empty-state"><p>No open positions found.</p></div>';
        return;
      }

      positions.forEach(pos => {
        const card = document.createElement("div");
        card.className = "pos-card";
        card.innerHTML =
          '<div class="pos-card-top"><div class="pos-logo">' + escapeHtml((pos.company || "C").charAt(0)) + '</div></div>' +
          '<div class="pos-title">' + escapeHtml(pos.title) + '</div>' +
          '<div class="pos-meta">' + escapeHtml(pos.company) + ' · ' + escapeHtml(pos.location) + '</div>' +
          '<div class="pos-skills">' + (pos.skills || []).map(s => '<span class="chip">' + escapeHtml(s) + '</span>').join("") + '</div>' +
          '<div class="pos-facts">' +
            '<div><div class="pos-fact-label">Minimum GPA</div><div class="pos-fact-val">' + (pos.min_gpa ?? "—") + '</div></div>' +
            '<div><div class="pos-fact-label">Experience</div><div class="pos-fact-val">' + (pos.min_experience_years ?? 0) + '+ years</div></div>' +
          '</div>' +
          '<button class="btn btn-primary btn-block" data-match-id="' + pos.position_id + '" data-match-title="' + escapeHtml(pos.title) + '">View match</button>';
        grid.appendChild(card);
      });

      $$("[data-match-id]", grid).forEach(btn => {
        btn.addEventListener("click", () => openMatchModal(Number(btn.dataset.matchId), btn.dataset.matchTitle));
      });
    } catch(err){
      if (grid) grid.innerHTML = '<div class="error-state"><p>' + escapeHtml(err.message) + '</p></div>';
    }
  }

  /* --- Match Modal --- */
  async function openMatchModal(positionId, positionTitle){
    if (!state.applicantId){
      toast("Upload your resume or sign in first to calculate your match.");
      resetUploadModal();
      openModal("modalUpload");
      return;
    }
    $("#matchPosTitle").textContent = positionTitle || "Position Match";
    openModal("modalMatch");

    try {
      const evaluation = await api("/api/applicants/" + state.applicantId + "/evaluate/" + positionId);
      state.lastEvaluation = evaluation;
      paintMatch(evaluation);
    } catch(err){
      $("#matchedList").innerHTML = '<div class="error-state"><p>' + escapeHtml(err.message) + '</p></div>';
      $("#gapList").innerHTML = "";
      $("#eligList").innerHTML = "";
    }
  }

  function animateRing(pct, ringEl, numEl){
    const cleanPct = Math.round(Number(pct) || 0);
    const circumference = 2 * Math.PI * 52;
    ringEl.style.strokeDasharray = circumference;
    ringEl.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
      ringEl.style.strokeDashoffset = circumference - (circumference * Math.min(cleanPct, 100) / 100);
    });
    numEl.textContent = cleanPct + "%";
  }

  function paintMatch(evaluation){
    const score = evaluation.match_score ?? evaluation.match_percentage ?? 0;
    animateRing(score, $("#matchRingFg"), $("#matchRingNum"));

    const matched = evaluation.matched_skills || [];
    const missing = evaluation.missing_skills || [];
    $("#matchedList").innerHTML = matched.length
      ? matched.map(s => '<div class="match-item yes">' + icon("check") + escapeHtml(s) + '</div>').join("")
      : '<div class="match-item no">No matched skills yet</div>';

    $("#gapList").innerHTML = missing.length
      ? missing.map(s => '<div class="match-item no">' + icon("circle") + escapeHtml(s) + '</div>').join("")
      : '<div class="match-item yes">' + icon("check") + 'No skill gaps</div>';

    $("#eligList").innerHTML =
      '<div class="badge ' + (evaluation.gpa_eligible ? "good" : "bad") + '">' + icon("check") +
        (evaluation.gpa_eligible ? "GPA requirement satisfied" : "GPA requirement not met") + '</div>' +
      '<div class="badge ' + (evaluation.experience_eligible ? "good" : "bad") + '">' + icon("check") +
        (evaluation.experience_eligible ? "Experience requirement satisfied" : "Experience requirement not met") + '</div>';
  }

  /* --- Learning Modal --- */
  async function openLearningModal(skillHint, positionId){
    const targetPos = positionId || state.selectedPositionId || 1;
    $("#learnTitle").textContent = "Level up your skills";
    $("#learnDesc").textContent = "Curated video tutorials to master this requirement.";
    $("#learnBody").innerHTML = '<div class="loading-state" style="padding:10px 0;"><div class="loading-ring" style="width:40px;height:40px;"></div></div>';
    openModal("modalLearn");

    try{
      const data = await api("/api/career/" + state.applicantId + "/recommendations/" + targetPos);
      const items = (data.recommendations || []).filter(r => !skillHint || r.skill === skillHint);
      const list = items.length ? items : (data.recommendations || []);

      if (!list.length){
        $("#learnBody").innerHTML = '<div class="empty-state"><h4>No recommendations yet</h4><p>No content available right now.</p></div>';
        return;
      }

      $("#learnBody").innerHTML = list.map(r =>
        '<div class="yt-card">' +
          '<div class="yt-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent-text);font-weight:700;">' + escapeHtml(r.skill) + '</div>' +
          '<div class="yt-info">' +
            '<div class="yt-title">' + escapeHtml(r.title) + '</div>' +
            '<div class="yt-channel">' + escapeHtml(r.channel) + '</div>' +
            '<a class="yt-watch" href="' + r.url + '" target="_blank" rel="noopener">Watch on YouTube →</a>' +
          '</div>' +
        '</div>'
      ).join("");
    } catch(err){
      $("#learnBody").innerHTML = '<div class="error-state"><p>' + escapeHtml(err.message) + '</p></div>';
    }
  }

  /* --- Recruiter Hub --- */
  const recruiterPosSelect = $("#recruiterPositionSelect");
  const leaderboardTbody = $("#leaderboardTbody");
  const postJobForm = $("#postJobForm");
  const openPostJobModalBtn = $("#openPostJobModalBtn");

  if (openPostJobModalBtn){
    openPostJobModalBtn.addEventListener("click", () => openModal("modalPostJob"));
  }

  function populateRecruiterDropdown(){
    if (!recruiterPosSelect) return;
    recruiterPosSelect.innerHTML = "";
    state.positions.forEach(pos => {
      const opt = document.createElement("option");
      opt.value = pos.position_id;
      opt.textContent = pos.title + " (" + (pos.company || "Company") + ")";
      recruiterPosSelect.appendChild(opt);
    });
    if (state.positions.length){
      loadLeaderboard(state.positions[0].position_id);
    }
  }

  if (recruiterPosSelect){
    recruiterPosSelect.addEventListener("change", (e) => {
      loadLeaderboard(Number(e.target.value));
    });
  }

  async function loadLeaderboard(positionId){
    if (!leaderboardTbody) return;
    leaderboardTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:28px;">Loading applicants...</td></tr>';

    try {
      const data = await api("/api/recruiter/positions/" + positionId + "/leaderboard");
      const counterEl = $("#recruiterTotalCount");
      if (counterEl) counterEl.textContent = data.total_applicants + " Applicants Ranked";

      if (!data.leaderboard || data.leaderboard.length === 0){
        leaderboardTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ink-faint);">No applications submitted for this role yet.</td></tr>';
        return;
      }

      leaderboardTbody.innerHTML = data.leaderboard.map((app, index) => {
        const scoreClass = app.match_score >= 70 ? "hi" : (app.match_score >= 45 ? "med" : "low");
        const eligBadge = app.eligible
          ? '<span class="badge good">Eligible</span>'
          : '<span class="badge bad">Not Met</span>';

        return `
          <tr>
            <td style="font-weight:700; color:var(--ink-soft);">#${index + 1}</td>
            <td>
              <div style="font-weight:600; color:var(--ink);">${escapeHtml(app.full_name)}</div>
              <div style="font-size:12.5px; color:var(--ink-faint);">${escapeHtml(app.email)}</div>
            </td>
            <td><span class="score-pill ${scoreClass}">${app.match_score}%</span></td>
            <td>${eligBadge}</td>
            <td>
              <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:240px;">
                ${app.skills.slice(0, 4).map(s => `<span class="chip" style="font-size:11px; padding:2px 8px;">${escapeHtml(s)}</span>`).join("")}
              </div>
            </td>
            <td style="color:var(--ink-soft); font-size:13px;">${app.applied_at}</td>
            <td>
              <select class="status-select ${app.status}" data-app-id="${app.application_id}">
                <option value="APPLIED" ${app.status === 'APPLIED' ? 'selected' : ''}>Applied</option>
                <option value="SHORTLISTED" ${app.status === 'SHORTLISTED' ? 'selected' : ''}>Shortlisted</option>
                <option value="INTERVIEW" ${app.status === 'INTERVIEW' ? 'selected' : ''}>Interview</option>
                <option value="OFFERED" ${app.status === 'OFFERED' ? 'selected' : ''}>Offered</option>
                <option value="REJECTED" ${app.status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
              </select>
            </td>
          </tr>
        `;
      }).join("");

      $$(".status-select", leaderboardTbody).forEach(sel => {
        sel.addEventListener("change", async (e) => {
          const appId = e.target.dataset.appId;
          const newStatus = e.target.value;
          try {
            await api("/api/recruiter/applications/" + appId + "/status", {
              method: "PATCH",
              body: JSON.stringify({ status: newStatus })
            });
            e.target.className = "status-select " + newStatus;
            toast("Applicant status updated to " + newStatus, "success");
          } catch(err){
            toast("Failed to update status: " + err.message, "error");
          }
        });
      });

    } catch(err){
      leaderboardTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--bad);">' + escapeHtml(err.message) + '</td></tr>';
    }
  }

  if (postJobForm){
    postJobForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#postJobSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Publishing...";

      const reqSkills = $("#jobReqSkillsInp").value.split(",").map(s => s.trim()).filter(Boolean);
      const optSkills = $("#jobOptSkillsInp").value.split(",").map(s => s.trim()).filter(Boolean);

      try {
        await api("/api/recruiter/positions/create", {
          method: "POST",
          body: JSON.stringify({
            title: $("#jobTitleInp").value.trim(),
            company_name: $("#jobCompanyInp").value.trim(),
            location: $("#jobLocInp").value.trim(),
            min_gpa: $("#jobGpaInp").value ? parseFloat($("#jobGpaInp").value) : null,
            min_experience_years: $("#jobExpInp").value ? parseInt($("#jobExpInp").value) : 0,
            required_skills: reqSkills,
            optional_skills: optSkills,
            description: $("#jobDescInp").value.trim()
          })
        });

        closeModal("modalPostJob");
        postJobForm.reset();
        toast("Job opening published live!", "success");

        await loadPositions();
        populateRecruiterDropdown();

      } catch(err){
        toast("Could not create opening: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Publish Job Opening";
      }
    });
  }

  /* --- My Applications --- */
  async function loadMyApplications(){
    const grid = $("#myAppsGrid");
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state"><p>Loading your applications...</p></div>';

    try {
      const data = await api("/api/applications/my-applications/" + state.applicantId);
      if (!data.applications || data.applications.length === 0){
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <h4>No applications yet</h4>
            <p>Explore positions and apply to track your progress here.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = data.applications.map(app => `
        <div class="app-card">
          <div>
            <div class="app-card-head">
              <div>
                <h4 style="font-size:18px; margin-bottom:4px;">${escapeHtml(app.title)}</h4>
                <div style="font-size:13.5px; color:var(--ink-soft);">${escapeHtml(app.company)} · ${escapeHtml(app.location)}</div>
              </div>
              <span class="app-status-badge ${app.status}">${escapeHtml(app.status)}</span>
            </div>
          </div>
          <div class="app-meta-strip">
            <div>Match: <strong style="color:var(--accent-text);">${app.match_score}%</strong></div>
            <div>Applied: ${app.applied_at}</div>
          </div>
        </div>
      `).join("");
    } catch(err){
      grid.innerHTML = '<div class="error-state" style="grid-column: 1 / -1;"><p>' + escapeHtml(err.message) + '</p></div>';
    }
  }

  /* --- PDF Report --- */
  const dashDownloadReportBtn = $("#dashDownloadReportBtn");
  if (dashDownloadReportBtn){
    dashDownloadReportBtn.addEventListener("click", async () => {
      if (!state.applicantId){
        toast("Please sign in or upload your resume first.", "error");
        return;
      }
      const posId = state.selectedPositionId || (state.lastEvaluation && state.lastEvaluation.position_id) || 1;
      toast("Generating verified PDF report...", "success");
      try {
        const res = await fetch(API + "/api/career/" + state.applicantId + "/report/" + posId);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || errData.error || ("Server error " + res.status));
        }
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = blobUrl;
        a.download = "CareerIQ_Report_Pos" + posId + ".pdf";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
          a.remove();
        }, 1200);
        toast("Report downloaded successfully!", "success");
      } catch(err) {
        toast("Download failed: " + err.message, "error");
      }
    });
  }

  /* --- URL Params Check --- */
  function handleUrlParams(){
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteCode = urlParams.get("invite");
      if (inviteCode) {
        setTimeout(() => {
          setAuthRole("RECRUITER");
          setAuthMode("REGISTER");
          const keyInput = $("#authRecruiterKey");
          if (keyInput) keyInput.value = inviteCode.toUpperCase();
          if (authStepForm) authStepForm.style.display = "block";
          if (authStepReset) authStepReset.style.display = "none";
          if (authStepProfile) authStepProfile.style.display = "none";
          openModal("modalAuth");
          toast("Recruiter invite detected! Enter your email and password to activate.", "success");
        }, 300);
      }
    } catch(e){}
  }

  /* --- Init --- */
  loadPositions();
  showView("home");
  handleUrlParams();
})();
