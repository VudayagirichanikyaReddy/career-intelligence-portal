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
    selectedPositionId: null,
    positionCategoryFilter: "",
    positionCompanyFilter: "",
    positionSearch: ""
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
  function showView(name, scrollToId = null, fromHistory = false){
    const views={home:$("#view-home"),positions:$("#view-positions"),"career-intelligence":$("#view-career-intelligence"),dashboard:$("#view-dashboard"),analyze:$("#view-analyze"),recruiter:$("#view-recruiter"),"my-applications":$("#view-my-applications")};
    if((name==="dashboard"||name==="my-applications")&&!state.applicantId){toast("Please sign in or upload your resume first.");resetUploadModal();openModal("modalUpload");name="home";}
    if(name==="recruiter"&&(!state.user||state.user.role!=="RECRUITER")){toast("Recruiter authorization required.","error");setAuthRole("RECRUITER");setAuthMode("LOGIN");if(authStepForm)authStepForm.style.display="block";if(authStepReset)authStepReset.style.display="none";if(authStepProfile)authStepProfile.style.display="none";openModal("modalAuth");name="home";}
    if(!views[name])name="home";
    Object.entries(views).forEach(([key,el])=>{if(!el)return;if(key==="home")el.classList.toggle("hidden",key!==name);else el.classList.toggle("active",key===name);});
    if(name==="my-applications")loadMyApplications();if(name==="recruiter")populateRecruiterDropdown();if(name==="career-intelligence"){renderCareerIntelligence(state.lastEvaluation);const intelPosition=state.selectedPositionId||(state.positions[0]&&state.positions[0].position_id);if(!state.lastEvaluation&&state.applicantId&&intelPosition)switchDashboardPosition(intelPosition);}
    window.scrollTo({top:0,behavior:"auto"});if(scrollToId)setTimeout(()=>document.getElementById(scrollToId)?.scrollIntoView({behavior:"smooth"}),60);
    if(!fromHistory){const route=name==="home"?"/":`/${name}`;if(location.hash!==`#${route}`)history.pushState({view:name},"",`#${route}`);}
    $$(".nav-links a[data-nav], .nav-mobile a[data-nav]").forEach(link=>link.classList.toggle("active",link.dataset.nav===name));
  }
  function viewFromLocation(){const route=location.hash.replace(/^#\/?/,"").split("?")[0];showView(route||"home",null,true);}
  window.addEventListener("popstate",viewFromLocation);window.addEventListener("hashchange",()=>{if(!history.state?.view)viewFromLocation();});viewFromLocation();
  function renderCareerIntelligence(evaluation){const empty=$("#intelligenceEmpty"),pop=$("#intelligencePopulated");if(!empty||!pop)return;if(!evaluation){empty.hidden=false;pop.hidden=true;return;}empty.hidden=true;pop.hidden=false;const matched=evaluation.matched_skills||[],gaps=evaluation.missing_skills||[];$("#intelligenceRole").textContent=evaluation.position||"Your role match";$("#intelligenceRoleMeta").textContent=[evaluation.company,evaluation.location].filter(Boolean).join(" · ")||"Based on your latest resume analysis";$("#intelligenceScore").textContent=Math.round(Number(evaluation.match_score??evaluation.match_percentage)||0)+"%";$("#intelligenceEligibility").textContent=evaluation.eligible?"Eligible":"Keep building";$("#intelligenceMatchedCount").textContent=matched.length;$("#intelligenceGapCount").textContent=gaps.length;$("#intelligenceMatched").innerHTML=matched.length?matched.map(s=>'<span class="intel-skill">✓ '+escapeHtml(s)+'</span>').join(""):'<p class="intel-no-items">Your matched skills will appear here.</p>';const list=$("#intelligenceGaps");list.innerHTML=gaps.length?gaps.map(s=>'<div class="intel-gap"><span><i></i>'+escapeHtml(s)+'</span><button class="btn btn-sm btn-secondary" data-intel-learn="'+escapeHtml(s)+'">Explore</button></div>').join(""):'<p class="intel-no-items">Great work — no skill gaps for this role.</p>';$$('[data-intel-learn]',list).forEach(btn=>btn.addEventListener("click",()=>openLearningModal(btn.dataset.intelLearn,evaluation.position_id)));}
  ["intelligenceUploadBtn","emptyIntelligenceUploadBtn","intelligenceUploadAgainBtn"].forEach(id=>$("#"+id)?.addEventListener("click",()=>{resetUploadModal();openModal("modalUpload");}));
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

  ["navUploadBtn","navUploadBtnMobile","heroUploadBtn","featureUploadBtn","ciUploadBtn","finalUploadBtn"].forEach(id => {
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
      renderCareerIntelligence(evaluation);
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
      renderCareerIntelligence(evaluation);
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
      renderCareerIntelligence(evaluation);
    } catch(err) {
      toast(err.message || "Could not add skill.", "error");
    }
  }

  /* --- Live job discovery categories and company rails --- */
  function categoriesForPosition(pos){
    const title = String(pos.title || "").toLowerCase();
    const text = title + " " + (pos.skills || []).join(" ").toLowerCase();
    const categories = [];
    if (/data scientist|data science|analytics|machine learning|\bai\b/.test(text)) categories.push("Data Science");
    if (/bank|finance|accounting|fintech/.test(text)) categories.push("Banking & Finance");
    if (/\bhr\b|human resources|talent acquisition|recruiter/.test(text)) categories.push("HR");
    if (/engineer|engineering|mechanical|electrical|civil/.test(text)) categories.push("Engineering");
    if (/software|developer|programmer|backend|frontend|full.?stack|devops|\bit\b/.test(text)) categories.push("Software & IT");
    if (/fresher|entry.level|graduate/.test(title) || Number(pos.min_experience_years || 0) === 0) categories.push("Freshers");
    return categories.length ? [...new Set(categories)] : ["Other roles"];
  }

  const categorySymbols = {
    "Data Science":"◌", "Banking & Finance":"₹", "HR":"♙", "Engineering":"⚙",
    "Software & IT":"⌘", "Freshers":"✦", "Other roles":"↗"
  };

  function renderHiringDiscovery(positions){
    const categoryGrid = $("#jobCategoryGrid");
    const companyGrid = $("#companyHiringGrid");
    if (!categoryGrid || !companyGrid) return;
    categoryGrid.replaceChildren();
    companyGrid.replaceChildren();
    if (!positions || !positions.length){
      categoryGrid.innerHTML = '<div class="discovery-empty">No categories yet</div>';
      companyGrid.innerHTML = '<div class="discovery-empty">Open positions from companies will appear here.</div>';
      const status = $("#hiringFilterStatus");
      if (status) status.textContent = "No open positions right now.";
      const reset = $("#clearHiringFilter");
      if (reset) reset.hidden = true;
      return;
    }

    const categoryCounts = new Map();
    const companies = new Map();
    positions.forEach(pos => {
      categoriesForPosition(pos).forEach(category => categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1));
      const name = String(pos.company || "Company").trim() || "Company";
      const key = name.toLowerCase();
      if (!companies.has(key)) companies.set(key, { name, positions: [] });
      companies.get(key).positions.push(pos);
    });

    [...categoryCounts.entries()].sort((a,b) => a[0].localeCompare(b[0])).forEach(([name,count], i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-tile";
      button.dataset.jobCategory = name;
      button.style.setProperty("--tile-delay", `${i * 55}ms`);
      const symbol = document.createElement("span");
      symbol.className = "category-symbol";
      symbol.setAttribute("aria-hidden", "true");
      symbol.textContent = categorySymbols[name] || "↗";
      const copy = document.createElement("span");
      copy.className = "category-copy";
      copy.innerHTML = `<strong>${escapeHtml(name)}</strong><small>${count} ${count === 1 ? "opening" : "openings"}</small>`;
      const arrow = document.createElement("span");
      arrow.className = "category-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "›";
      button.append(symbol, copy, arrow);
      categoryGrid.appendChild(button);
    });

    [...companies.values()].sort((a,b) => b.positions.length - a.positions.length || a.name.localeCompare(b.name)).forEach((company,i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "company-hiring-card";
      button.dataset.companyFilter = company.name.toLowerCase();
      button.style.setProperty("--tile-delay", `${i * 65}ms`);
      const top = document.createElement("span");
      top.className = "company-card-top";
      const monogram = document.createElement("span");
      monogram.className = "company-monogram";
      monogram.setAttribute("aria-hidden", "true");
      monogram.textContent = company.name.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join("").toUpperCase();
      const arrow = document.createElement("span");
      arrow.className = "company-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      top.append(monogram, arrow);
      const title = document.createElement("strong");
      title.className = "company-card-name";
      title.textContent = company.name;
      const count = document.createElement("span");
      count.className = "company-card-count";
      count.textContent = `${company.positions.length} ${company.positions.length === 1 ? "open role" : "open roles"}`;
      const example = document.createElement("span");
      example.className = "company-card-example";
      example.textContent = company.positions[0].title || "Explore open roles";
      button.append(top,title,count,example);
      companyGrid.appendChild(button);
    });
  }

  function applyHiringFilters(){
    const cards = $$("#posGrid .pos-card");
    let visible = 0;
    cards.forEach(card => {
      const categories = (card.dataset.categories || "").split("|");
      const company = card.dataset.company || "";
      const query=(state.positionSearch||"").trim().toLowerCase();
      const matches = (!state.positionCategoryFilter || categories.includes(state.positionCategoryFilter)) && (!state.positionCompanyFilter || company === state.positionCompanyFilter) && (!query || card.textContent.toLowerCase().includes(query));
      card.classList.toggle("is-filtered-out", !matches);
      if (matches) visible++;
    });
    const status = $("#hiringFilterStatus");
    const reset = $("#clearHiringFilter");
    const filtered = state.positionCategoryFilter || state.positionCompanyFilter;
    if (status){
      const label = state.positionCategoryFilter || (state.positionCompanyFilter && (state.positions.find(p => String(p.company || "").toLowerCase() === state.positionCompanyFilter) || {}).company) || "all open roles";
      status.textContent = filtered ? `${visible} ${visible === 1 ? "opening" : "openings"} for ${label}` : `${cards.length} live ${cards.length === 1 ? "opening" : "open positions"}`;
    }
    if (reset) reset.hidden = !filtered;
    $$("#jobCategoryGrid .category-tile").forEach(button => button.classList.toggle("active", button.dataset.jobCategory === state.positionCategoryFilter));
    $$("#companyHiringGrid .company-hiring-card").forEach(button => button.classList.toggle("active", button.dataset.companyFilter === state.positionCompanyFilter));
  }

  const categoryGrid = $("#jobCategoryGrid");
  if (categoryGrid) categoryGrid.addEventListener("click", e => {
    const button = e.target.closest("[data-job-category]");
    if (!button) return;
    state.positionCategoryFilter = state.positionCategoryFilter === button.dataset.jobCategory ? "" : button.dataset.jobCategory;
    state.positionCompanyFilter = "";
    showView("positions");
    applyHiringFilters();
    $("#posGrid")?.scrollIntoView({behavior:"smooth", block:"start"});
  });
  const companyGrid = $("#companyHiringGrid");
  if (companyGrid) companyGrid.addEventListener("click", e => {
    const button = e.target.closest("[data-company-filter]");
    if (!button) return;
    state.positionCompanyFilter = state.positionCompanyFilter === button.dataset.companyFilter ? "" : button.dataset.companyFilter;
    state.positionCategoryFilter = "";
    showView("positions");
    applyHiringFilters();
    $("#posGrid")?.scrollIntoView({behavior:"smooth", block:"start"});
  });
  const positionSearch=$("#positionSearch"), clearPositionSearch=$("#clearPositionSearch");
  if(positionSearch)positionSearch.addEventListener("input",()=>{state.positionSearch=positionSearch.value;if(clearPositionSearch)clearPositionSearch.hidden=!state.positionSearch;applyHiringFilters();});
  if(clearPositionSearch)clearPositionSearch.addEventListener("click",()=>{positionSearch.value="";state.positionSearch="";clearPositionSearch.hidden=true;applyHiringFilters();});
  const clearHiringFilter = $("#clearHiringFilter");
  if (clearHiringFilter) clearHiringFilter.addEventListener("click", () => {
    state.positionCategoryFilter = "";
    state.positionCompanyFilter = "";
    applyHiringFilters();
  });
  $$("[data-rail][data-direction]").forEach(button => button.addEventListener("click", () => {
    const rail = document.getElementById(button.dataset.rail);
    if (rail) rail.scrollBy({left:Number(button.dataset.direction) * Math.max(280, rail.clientWidth * .75), behavior:"smooth"});
  }));

  /* --- Dynamic Positions --- */
  async function loadPositions(){
    const grid = $("#posGrid");
    try {
      const positions = await api("/api/jobs");
      state.positions = positions || [];
      renderHiringDiscovery(state.positions);
      if (positions.length && !state.selectedPositionId){
        state.selectedPositionId = positions[0].position_id;
      }
      populatePositionDropdown();

      if (!grid) return;
      grid.innerHTML = "";
      if (!positions || positions.length === 0){
        grid.innerHTML = '<div class="empty-state"><p>No open positions found.</p></div>';
        applyHiringFilters();
        return;
      }

      positions.forEach(pos => {
        const card = document.createElement("div");
        card.className = "pos-card";
        card.dataset.categories = categoriesForPosition(pos).join("|");
        card.dataset.company = String(pos.company || "").toLowerCase();
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

      applyHiringFilters();
      if(location.hash==="#/career-intelligence" && state.applicantId && !state.lastEvaluation) switchDashboardPosition(state.selectedPositionId);
      $$("[data-match-id]", grid).forEach(btn => {
        btn.addEventListener("click", () => openMatchModal(Number(btn.dataset.matchId), btn.dataset.matchTitle));
      });
    } catch(err){
      renderHiringDiscovery([]);
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
      renderCareerIntelligence(evaluation);
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

  /* --- Offer celebration --- */
  const offerCelebration = $("#offerCelebration");
  function closeOfferCelebration(){
    if (!offerCelebration) return;
    offerCelebration.classList.remove("show");
    offerCelebration.setAttribute("aria-hidden", "true");
    offerCelebration.hidden = true;
    document.body.style.overflow = "";
  }
  function showOfferCelebration(offers){
    if (!offerCelebration || !offers.length) return;
    const title = $("#offerCelebrationTitle");
    const message = $("#offerCelebrationMessage");
    if (title) title.textContent = offers.length === 1 ? "You got an offer!" : `${offers.length} offers — amazing!`;
    if (message){
      const offer = offers[0];
      message.textContent = offers.length === 1
        ? `Congratulations! ${offer.company ? "" + offer.company : "A company"} offered you the ${offer.title || "role"}. Your hard work paid off.`
        : `Congratulations! ${offers.length} companies have made you an offer. Your hard work paid off.`;
    }
    const confetti = $("#offerConfetti");
    if (confetti){
      confetti.replaceChildren();
      for (let i=0; i<34; i++){
        const piece = document.createElement("i");
        piece.style.setProperty("--x", `${Math.random()*100}%`);
        piece.style.setProperty("--delay", `${Math.random()*650}ms`);
        piece.style.setProperty("--duration", `${1500+Math.random()*1100}ms`);
        piece.style.setProperty("--hue", `${Math.floor(Math.random()*360)}`);
        piece.style.setProperty("--spin", `${Math.floor(Math.random()*720-360)}deg`);
        confetti.appendChild(piece);
      }
    }
    offerCelebration.hidden = false;
    offerCelebration.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => offerCelebration.classList.add("show"));
  }
  ["offerCelebrationClose","offerCelebrationDone"].forEach(id => {
    const button = $("#" + id);
    if (button) button.addEventListener("click", closeOfferCelebration);
  });
  if (offerCelebration) offerCelebration.addEventListener("click", e => {
    if (e.target === offerCelebration) closeOfferCelebration();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && offerCelebration && !offerCelebration.hidden) closeOfferCelebration();
  });

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

      const statusStorageKey = `careeriq_application_status_${state.applicantId}`;
      let previousStatuses = {};
      try { previousStatuses = JSON.parse(localStorage.getItem(statusStorageKey) || "{}"); } catch(e){}
      const newOffers = data.applications.filter(app => String(app.status || "").toUpperCase() === "OFFERED" && previousStatuses[String(app.application_id)] !== "OFFERED");
      const currentStatuses = {};
      data.applications.forEach(app => { currentStatuses[String(app.application_id)] = String(app.status || "APPLIED").toUpperCase(); });
      try { localStorage.setItem(statusStorageKey, JSON.stringify(currentStatuses)); } catch(e){}
      if (newOffers.length) setTimeout(() => showOfferCelebration(newOffers), 350);
      const newOfferIds = new Set(newOffers.map(app => String(app.application_id)));

      grid.innerHTML = data.applications.map(app => `
        <div class="app-card${newOfferIds.has(String(app.application_id)) ? " offer-received" : ""}">
          <div>
            <div class="app-card-head">
              <div>
                <h4 style="font-size:18px; margin-bottom:4px;">${escapeHtml(app.title)}</h4>
                <div style="font-size:13.5px; color:var(--ink-soft);">${escapeHtml(app.company)} · ${escapeHtml(app.location)}</div>
              </div>
              <span class="app-status-badge ${app.status}">${app.status === "OFFERED" ? "Offer received" : escapeHtml(app.status)}</span>
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
        a.download = "Career_Sensei_Report_Pos" + posId + ".pdf";
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

    const analyzeJobBtn = $("#analyzeJobBtn");

  if (analyzeJobBtn) {
    analyzeJobBtn.addEventListener("click", async () => {
      const description = ($("#jobDescInput")?.value || "").trim();
      const errorBox = $("#analyzeError");
      const loading = $("#analyzeLoading");
      const result = $("#analyzeResult");

      if (errorBox) {
        errorBox.textContent = "";
        errorBox.style.display = "none";
      }

      if (!description) {
        const message = ($("#jobUrlInput")?.value || "").trim()
          ? "URL analysis isn't connected yet. Paste the job description instead."
          : "Paste a job description first.";

        if (errorBox) {
          errorBox.textContent = message;
          errorBox.style.display = "block";
        }
        return;
      }

      if (!state.applicantId) {
        if (errorBox) {
          errorBox.textContent = "Upload your resume first to see a match.";
          errorBox.style.display = "block";
        }
        return;
      }

      analyzeJobBtn.disabled = true;
      analyzeJobBtn.textContent = "Analyzing…";
      if (loading) loading.style.display = "block";
      if (result) result.style.display = "none";

      try {
        const saved = await api("/api/jobs/analyze-and-save", {
          method: "POST",
          body: JSON.stringify({ job_description: description })
        });

        const job = saved.job || {};
        state.selectedPositionId = saved.position_id;

        $("#resultJobTitle").textContent = job.title || "Analyzed job";
        $("#resultJobCompany").textContent = job.company || "Company not specified";
        $("#resultJobLocation").textContent = job.location || "Location not specified";

        const showSkills = (selector, skills) => {
          const element = $(selector);
          if (!element) return;
          const items = Array.isArray(skills) ? skills : [];
          element.innerHTML = items.length
            ? items.map(skill => `<span class="chip">${escapeHtml(skill)}</span>`).join("")
            : '<span class="pos-meta">None detected</span>';
        };

        showSkills("#resultReqSkills", job.required_skills);
        showSkills("#resultOptSkills", job.optional_skills);

        const match = await api(
          `/api/applicants/${state.applicantId}/evaluate/${saved.position_id}`
        );

        animateRing(match.match_score, $("#jobMatchRingFg"), $("#jobMatchRingNum"));

        $("#jobMatchedList").innerHTML = match.matched_skills.length
          ? match.matched_skills.map(skill =>
              `<div class="match-item yes">${icon("check")}${escapeHtml(skill)}</div>`
            ).join("")
          : '<div class="match-item no">No matched skills yet</div>';

        $("#jobGapList").innerHTML = match.missing_skills.length
          ? match.missing_skills.map(skill =>
              `<div class="match-item no">${icon("circle")}${escapeHtml(skill)}</div>`
            ).join("")
          : '<div class="match-item yes">No skill gaps</div>';

        $("#jobEligList").innerHTML =
          `<div class="badge ${match.gpa_eligible ? "good" : "bad"}">
            ${match.gpa_eligible ? "GPA requirement satisfied" : "GPA requirement not met"}
          </div>
          <div class="badge ${match.experience_eligible ? "good" : "bad"}">
            ${match.experience_eligible ? "Experience requirement satisfied" : "Experience requirement not met"}
          </div>`;

        $("#compareGpa").textContent =
          `${match.gpa ?? "—"} / ${match.required_gpa ?? "—"}`;
        $("#compareExperience").textContent =
          `${match.experience_years ?? "—"} / ${match.required_experience_years ?? "—"}`;

        if (result) result.style.display = "flex";
      } catch (error) {
        if (errorBox) {
          errorBox.textContent = error.message || "Job analysis failed.";
          errorBox.style.display = "block";
        }
      } finally {
        if (loading) loading.style.display = "none";
        analyzeJobBtn.disabled = false;
        analyzeJobBtn.textContent = "Analyze job";
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
