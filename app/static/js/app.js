/* =========================================================
   Career Intelligence & Recruitment Portal — app.js
   Talks to the existing FastAPI backend. No fake data is used
   for match/eligibility/skills/recommendations — those always
   come from a real API response.
   ========================================================= */
(function(){
  "use strict";

  const API = ""; // same-origin FastAPI app

  /* ---------------------------------------------------------
     DEMO CONFIG
     Your backend has no GET /api/positions (list) endpoint, so
     there is no real way to fetch "all open positions" yet.
     This is the one position your example data actually
     describes end-to-end (position_id assumed = 1). Swap this
     out, or better, add a listing endpoint and fetch it here.
     --------------------------------------------------------- */
  const DEMO_POSITION = {
    position_id: 1,
    title: "Backend Developer",
    company: "TechNova Solutions",
    location: "Hyderabad",
    skills: ["Python", "SQL", "FastAPI", "Docker", "React"],
    min_gpa: 7.5,
    min_experience_years: 0
  };
  const DEMO_USER_ID = 1; // no auth/session flow exists yet — see note in chat

  const state = {
    applicantId: null,
    applicantName: null,
    file: null,
    lastEvaluation: null, // cached /evaluate response for DEMO_POSITION

    // Analyze Any Job feature
    jobUrl: null,            // original URL the user pasted, if any (display-only)
    jobPositionId: null,     // position_id returned by /api/jobs/analyze-and-save
    jobDetails: null,        // job.* from that response
    jobEvaluation: null      // /evaluate response for jobPositionId
  };

  /* ---------------------------------------------------------
     Small DOM helpers
     --------------------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function icon(name){
    const icons = {
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>',
      circle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>'
    };
    return icons[name] || '';
  }

  /* ---------------------------------------------------------
     Toasts
     --------------------------------------------------------- */
  function toast(msg, type){
    const stack = $("#toastStack");
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

  /* ---------------------------------------------------------
     Fetch wrapper
     --------------------------------------------------------- */
  async function api(path, opts){
    try{
      const res = await fetch(API + path, Object.assign({
        headers: { "Content-Type": "application/json" }
      }, opts));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error){
        throw new Error(data.error || ("Request failed (" + res.status + ")"));
      }
      return data;
    } catch(err){
      throw err;
    }
  }

  /* ---------------------------------------------------------
     Nav: view switching (home / dashboard) + mobile menu
     --------------------------------------------------------- */
  function showView(name){
    const home = $("#view-home");
    const dash = $("#view-dashboard");
    const analyze = $("#view-analyze");

    if (name === "dashboard"){
      if (!state.applicantId){
        toast("Upload your resume first to see your dashboard.");
        openModal("modalUpload");
        return;
      }
      home.classList.add("hidden");
      analyze.classList.remove("active");
      dash.classList.add("active");
      window.scrollTo({ top:0, behavior:"instant" in window ? "instant" : "auto" });
    } else if (name === "analyze"){
      home.classList.add("hidden");
      dash.classList.remove("active");
      analyze.classList.add("active");
      window.scrollTo({ top:0, behavior:"instant" in window ? "instant" : "auto" });
    } else {
      dash.classList.remove("active");
      analyze.classList.remove("active");
      home.classList.remove("hidden");
    }
    $$(".nav-links a[data-nav], .nav-mobile a[data-nav]").forEach(a => {
      a.classList.toggle("active", a.dataset.nav === name);
    });
  }

  $$("[data-nav]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showView(el.dataset.nav);
      closeMobileNav();
    });
  });

  const navMobile = $("#navMobile");
  function closeMobileNav(){ navMobile.classList.remove("open"); }
  $("#burgerBtn").addEventListener("click", () => navMobile.classList.toggle("open"));
  $$("#navMobile [data-close]").forEach(a => a.addEventListener("click", closeMobileNav));

  /* ---------------------------------------------------------
     Modals
     --------------------------------------------------------- */
  function openModal(id){
    $("#" + id).classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeModal(id){
    $("#" + id).classList.remove("open");
    document.body.style.overflow = "";
  }
  $$(".modal-backdrop").forEach(bd => {
    bd.addEventListener("click", (e) => { if (e.target === bd) closeModal(bd.id); });
  });
  $$("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.closest(".modal-backdrop").id));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){
      $$(".modal-backdrop.open").forEach(bd => closeModal(bd.id));
    }
  });

  ["navUploadBtn","navUploadBtnMobile","heroUploadBtn","ciUploadBtn","finalUploadBtn"].forEach(id => {
    const el = $("#" + id);
    if (el) el.addEventListener("click", () => { resetUploadModal(); openModal("modalUpload"); closeMobileNav(); });
  });

  /* ---------------------------------------------------------
     Upload modal: dropzone + file handling
     --------------------------------------------------------- */
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const analyzeBtn = $("#analyzeBtn");
  const dzFilename = $("#dzFilename");

  ["dragenter","dragover"].forEach(evt => dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); dropzone.classList.add("drag");
  }));
  ["dragleave","drop"].forEach(evt => dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); dropzone.classList.remove("drag");
  }));
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  });

  function setFile(f){
    const okExt = /\.(pdf|docx?|txt)$/i.test(f.name);
    if (!okExt){
      toast("Please upload a PDF, DOCX or TXT file.", "error");
      return;
    }
    state.file = f;
    dzFilename.textContent = f.name;
    dzFilename.style.display = "block";
    analyzeBtn.disabled = false;
    if (!/\.txt$/i.test(f.name)){
      toast("Heads up: full text extraction for PDF/DOCX needs a backend upload endpoint — this demo reads plain text best from .txt files.");
    }
  }

  function readFileText(file){
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsText(file);
    });
  }

  function resetUploadModal(){
    state.file = null;
    fileInput.value = "";
    dzFilename.style.display = "none";
    analyzeBtn.disabled = true;
    $("#uploadStepForm").style.display = "block";
    $("#uploadStepLoading").style.display = "none";
    $("#uploadStepSuccess").style.display = "none";
    $$(".loading-substep").forEach(s => s.classList.remove("active","done"));
  }

  analyzeBtn.addEventListener("click", runAnalysisFlow);

  async function runAnalysisFlow(){
    if (!state.file) return;

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
    msgEl.textContent = messages[0];
    const msgTimer = setInterval(() => {
      mi = (mi + 1) % messages.length;
      msgEl.textContent = messages[mi];
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
      const resumeText = await readFileText(state.file);

      // 1. create applicant with extracted resume text
      const applicant = await api("/api/applicants", {
        method: "POST",
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          full_name: "New Applicant",
          resume_text: resumeText || ("Resume file: " + state.file.name)
        })
      });
      state.applicantId = applicant.applicant_id;
      markStep(1);

      // 2. parse resume via AI
      const parsed = await api("/api/applicants/" + state.applicantId + "/parse-resume", { method: "POST" });
      state.applicantName = (parsed.ai_result && parsed.ai_result.full_name) || null;
      markStep(2);

      // 3. evaluate against the demo position (real match + eligibility + skill gap, persisted)
      const evaluation = await api(
        "/api/applicants/" + state.applicantId + "/evaluate/" + DEMO_POSITION.position_id,
        { method: "GET" }
      );
      state.lastEvaluation = evaluation;
      markStep(3);

      clearInterval(msgTimer);
      $("#uploadStepLoading").style.display = "none";
      $("#uploadStepSuccess").style.display = "block";

      setTimeout(() => {
        closeModal("modalUpload");
        renderDashboard(evaluation);
        showView("dashboard");
        toast("Resume analyzed successfully", "success");
      }, 1100);

    } catch(err){
      clearInterval(msgTimer);
      $("#uploadStepLoading").style.display = "none";
      $("#uploadStepForm").style.display = "block";
      toast(err.message || "Something went wrong analyzing your resume.", "error");
    }
  }

  /* ---------------------------------------------------------
     Dashboard rendering (from real /evaluate response)
     --------------------------------------------------------- */
  function renderDashboard(evaluation){
    const name = state.applicantName || evaluation.applicant_name || "there";
    $("#dashGreeting").textContent = "Good morning, " + name.split(" ")[0] + " 👋";
    $("#dashSub").textContent = "Here's how your resume matches against " + evaluation.position + ".";

    $("#cardScore").textContent = evaluation.match_percentage + "%";
    $("#cardEligible").textContent = evaluation.eligible ? "Eligible" : "Not eligible";
    $("#cardEligible").parentElement.querySelector(".dash-card-icon").style.color =
      evaluation.eligible ? "var(--good)" : "var(--bad)";
    $("#cardSkills").textContent = evaluation.matched_skills.length;
    $("#cardGaps").textContent = evaluation.missing_skills.length;

    const list = $("#dashGapsList");
    list.innerHTML = "";
    if (evaluation.missing_skills.length === 0){
      list.innerHTML = '<div class="empty-state"><h4>No skill gaps found</h4><p>Your skills fully cover this role\'s requirements.</p></div>';
    } else {
      evaluation.missing_skills.forEach(skill => {
        const row = document.createElement("div");
        row.className = "gap-card";
        row.innerHTML =
          '<div class="gap-card-left"><span class="gap-dot"></span>' + escapeHtml(skill) + '</div>' +
          '<button class="btn btn-sm btn-secondary" data-learn="' + escapeHtml(skill) + '">Learn ' + escapeHtml(skill) + '</button>';
        list.appendChild(row);
      });
      $$("[data-learn]", list).forEach(btn => {
        btn.addEventListener("click", () => openLearningModal(btn.dataset.learn));
      });
    }
  }

  /* ---------------------------------------------------------
     Position cards (home page)
     --------------------------------------------------------- */
  function renderPositions(){
    const grid = $("#posGrid");
    grid.innerHTML = "";
    const card = document.createElement("div");
    card.className = "pos-card";
    card.innerHTML =
      '<div class="pos-card-top">' +
        '<div class="pos-logo">' + DEMO_POSITION.company.charAt(0) + '</div>' +
      '</div>' +
      '<div class="pos-title">' + escapeHtml(DEMO_POSITION.title) + '</div>' +
      '<div class="pos-meta">' + escapeHtml(DEMO_POSITION.company) + ' · ' + escapeHtml(DEMO_POSITION.location) + '</div>' +
      '<div class="pos-skills">' + DEMO_POSITION.skills.map(s => '<span class="chip">' + escapeHtml(s) + '</span>').join("") + '</div>' +
      '<div class="pos-facts">' +
        '<div><div class="pos-fact-label">Minimum GPA</div><div class="pos-fact-val">' + DEMO_POSITION.min_gpa + '</div></div>' +
        '<div><div class="pos-fact-label">Experience</div><div class="pos-fact-val">' + DEMO_POSITION.min_experience_years + '+ years</div></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" id="viewMatchBtn">View match</button>';
    grid.appendChild(card);
    $("#viewMatchBtn", card).addEventListener("click", openMatchModal);
  }

  /* ---------------------------------------------------------
     Match modal (real /match + /eligibility, or cached /evaluate)
     --------------------------------------------------------- */
  async function openMatchModal(){
    if (!state.applicantId){
      toast("Upload your resume first so we can calculate your match.");
      resetUploadModal();
      openModal("modalUpload");
      return;
    }

    $("#matchPosTitle").textContent = DEMO_POSITION.title;
    openModal("modalMatch");

    try{
      let evaluation = state.lastEvaluation;
      if (!evaluation || evaluation.position_id !== DEMO_POSITION.position_id){
        evaluation = await api(
          "/api/applicants/" + state.applicantId + "/evaluate/" + DEMO_POSITION.position_id
        );
        state.lastEvaluation = evaluation;
      }
      paintMatch(evaluation);
    } catch(err){
      $("#matchedList").innerHTML = '<div class="error-state"><h4>Couldn\'t load your match</h4><p>' + escapeHtml(err.message) + '</p></div>';
      $("#gapList").innerHTML = "";
      $("#eligList").innerHTML = "";
    }
  }

  // Shared ring animation — used by the position match modal AND the
  // Analyze Any Job result card, so the two stay visually identical.
  function animateRing(pct, ringEl, numEl){
    const circumference = 2 * Math.PI * 52;
    ringEl.style.strokeDasharray = circumference;
    ringEl.style.strokeDashoffset = circumference;
    requestAnimationFrame(() => {
      ringEl.style.strokeDashoffset = circumference - (circumference * Math.min(pct,100) / 100);
    });
    numEl.textContent = pct + "%";
  }

  // Shared matched/gap skill list rendering — same reuse rationale as animateRing.
  function renderSkillLists(evaluation, matchedListEl, gapListEl){
    matchedListEl.innerHTML = evaluation.matched_skills.length
      ? evaluation.matched_skills.map(s => '<div class="match-item yes">' + icon("check") + escapeHtml(s) + '</div>').join("")
      : '<div class="match-item no">No matched skills yet</div>';

    gapListEl.innerHTML = evaluation.missing_skills.length
      ? evaluation.missing_skills.map(s => '<div class="match-item no">' + icon("circle") + escapeHtml(s) + '</div>').join("")
      : '<div class="match-item yes">' + icon("check") + 'No skill gaps</div>';
  }

  function renderEligibilityBadges(evaluation){
    return '<div class="badge ' + (evaluation.gpa_eligible ? "good" : "bad") + '">' + icon("check") +
        (evaluation.gpa_eligible ? "GPA requirement satisfied" : "GPA requirement not met") + '</div>' +
      '<div class="badge ' + (evaluation.experience_eligible ? "good" : "bad") + '">' + icon("check") +
        (evaluation.experience_eligible ? "Experience requirement satisfied" : "Experience requirement not met") + '</div>';
  }

  function paintMatch(evaluation){
    animateRing(evaluation.match_percentage, $("#matchRingFg"), $("#matchRingNum"));
    renderSkillLists(evaluation, $("#matchedList"), $("#gapList"));
    $("#eligList").innerHTML = renderEligibilityBadges(evaluation);
  }

  /* ---------------------------------------------------------
     Learning recommendations modal (real career API)
     --------------------------------------------------------- */
  async function openLearningModal(skillHint){
    $("#learnTitle").textContent = "Level up your skills";
    $("#learnDesc").textContent = "Curated videos from your Career Intelligence recommendations.";
    $("#learnBody").innerHTML = '<div class="loading-state" style="padding:10px 0;"><div class="loading-ring" style="width:40px;height:40px;"></div></div>';
    openModal("modalLearn");

    try{
      const data = await api(
        "/api/career/" + state.applicantId + "/recommendations/" + DEMO_POSITION.position_id
      );

      if (data.message && (!data.recommendations || data.recommendations.length === 0)){
        $("#learnBody").innerHTML = '<div class="empty-state"><h4>No skill gaps found</h4><p>' + escapeHtml(data.message) + '</p></div>';
        return;
      }

      const items = (data.recommendations || []).filter(r => !skillHint || r.skill === skillHint);
      const list = items.length ? items : (data.recommendations || []);

      if (!list.length){
        $("#learnBody").innerHTML = '<div class="empty-state"><h4>No recommendations yet</h4><p>We couldn\'t find learning content for this skill right now.</p></div>';
        return;
      }

      $("#learnBody").innerHTML = list.map(r =>
        '<div class="yt-card">' +
          '<div class="yt-thumb"></div>' +
          '<div class="yt-info">' +
            '<div class="yt-title">' + escapeHtml(r.title) + '</div>' +
            '<div class="yt-channel">' + escapeHtml(r.channel) + ' · ' + escapeHtml(r.skill) + '</div>' +
            '<a class="yt-watch" href="' + r.url + '" target="_blank" rel="noopener">Watch on YouTube →</a>' +
          '</div>' +
        '</div>'
      ).join("");
    } catch(err){
      $("#learnBody").innerHTML = '<div class="error-state"><h4>Couldn\'t load recommendations</h4><p>' + escapeHtml(err.message) + '</p></div>';
    }
  }

  /* ---------------------------------------------------------
     Analyze Any Job
     Reuses: api(), toast(), openModal()/closeModal(), animateRing(),
     renderSkillLists(), renderEligibilityBadges(), escapeHtml(), icon().
     No new backend endpoint is invented here — job URLs are never sent
     to the server, since /api/jobs/analyze-and-save only accepts
     { job_description }. A pasted URL is kept client-side purely so
     "View Original Job" can reopen it.
     --------------------------------------------------------- */
  const jobUrlInput = $("#jobUrlInput");
  const jobDescInput = $("#jobDescInput");
  const analyzeJobBtn = $("#analyzeJobBtn");
  const analyzeErrorEl = $("#analyzeError");
  const analyzeLoadingEl = $("#analyzeLoading");
  const analyzeLoadingMsgEl = $("#analyzeLoadingMsg");
  const analyzeResultEl = $("#analyzeResult");

  function showAnalyzeError(msg){
    analyzeErrorEl.innerHTML = '<h4>Couldn\'t analyze this job</h4><p>' + escapeHtml(msg) + '</p>';
    analyzeErrorEl.style.display = "block";
  }
  function hideAnalyzeError(){
    analyzeErrorEl.style.display = "none";
    analyzeErrorEl.innerHTML = "";
  }
  function setAnalyzeLoading(on, msg){
    analyzeLoadingEl.style.display = on ? "block" : "none";
    if (msg) analyzeLoadingMsgEl.textContent = msg;
  }

  // Converts raw errors (network failures, backend {"error": "..."}
  // payloads, generic exceptions) into short, user-facing sentences.
  // Never surfaces raw JSON or stack traces.
  function friendlyError(err){
    const msg = (err && err.message) || "";
    if (/applicant/i.test(msg) && /not found/i.test(msg)){
      return "We couldn't find your applicant profile. Please upload your resume again.";
    }
    if (/position/i.test(msg) && /not found/i.test(msg)){
      return "We couldn't match you against this job. Please try analyzing it again.";
    }
    if (err instanceof TypeError || /failed to fetch/i.test(msg)){
      return "Network error — please check your connection and try again.";
    }
    if (!msg || msg.startsWith("{") || msg.length > 160){
      return "Something went wrong. Please try again.";
    }
    return msg;
  }

  if (analyzeJobBtn){
    analyzeJobBtn.addEventListener("click", runJobAnalysis);
  }

  async function runJobAnalysis(){
    hideAnalyzeError();
    analyzeResultEl.style.display = "none";

    const urlVal = jobUrlInput.value.trim();
    const descVal = jobDescInput.value.trim();

    if (!state.applicantId){
      showAnalyzeError("Please upload your resume first so we can match you against this job.");
      resetUploadModal();
      openModal("modalUpload");
      return;
    }
    if (!urlVal && !descVal){
      showAnalyzeError("Please paste a job URL or a job description.");
      return;
    }
    if (urlVal && !descVal){
      // We cannot fetch/scrape arbitrary third-party pages from the browser,
      // and the backend only accepts a description — so per spec we ask
      // for the description instead of inventing job data.
      showAnalyzeError("We couldn't read this job posting. Please paste the job description below.");
      return;
    }

    analyzeJobBtn.disabled = true;
    setAnalyzeLoading(true, "Analyzing job…");

    try{
      const jobResult = await api("/api/jobs/analyze-and-save", {
        method: "POST",
        body: JSON.stringify({ job_description: descVal })
      });

      if (!jobResult || !jobResult.position_id){
        throw new Error("Invalid job data returned by the server.");
      }

      state.jobUrl = urlVal || null;
      state.jobPositionId = jobResult.position_id;
      state.jobDetails = jobResult.job || {};

      setAnalyzeLoading(true, "Calculating your match…");

      const evaluation = await api(
        "/api/applicants/" + state.applicantId + "/evaluate/" + jobResult.position_id
      );
      state.jobEvaluation = evaluation;

      setAnalyzeLoading(false);
      renderJobAnalysisResult(jobResult, evaluation, state.jobUrl);

    } catch(err){
      setAnalyzeLoading(false);
      showAnalyzeError(friendlyError(err));
    } finally {
      analyzeJobBtn.disabled = false;
    }
  }

  function renderJobAnalysisResult(jobResult, evaluation, originalUrl){
    const job = jobResult.job || {};

    $("#resultJobTitle").textContent = job.title || "Untitled position";
    $("#resultJobCompany").textContent = job.company || "—";
    $("#resultJobLocation").textContent = job.location || "—";

    $("#resultReqSkills").innerHTML = (job.required_skills || []).length
      ? job.required_skills.map(s => '<span class="chip">' + escapeHtml(s) + '</span>').join("")
      : '<span style="color:var(--ink-faint);font-size:13px;">Not specified</span>';

    $("#resultOptSkills").innerHTML = (job.optional_skills || []).length
      ? job.optional_skills.map(s => '<span class="chip">' + escapeHtml(s) + '</span>').join("")
      : '<span style="color:var(--ink-faint);font-size:13px;">None listed</span>';

    const viewOriginalBtn = $("#viewOriginalJobBtn");
    if (originalUrl){
      viewOriginalBtn.style.display = "inline-flex";
      viewOriginalBtn.onclick = () => window.open(originalUrl, "_blank", "noopener");
    } else {
      viewOriginalBtn.style.display = "none";
    }

    animateRing(evaluation.match_percentage, $("#jobMatchRingFg"), $("#jobMatchRingNum"));
    renderSkillLists(evaluation, $("#jobMatchedList"), $("#jobGapList"));
    $("#jobEligList").innerHTML = renderEligibilityBadges(evaluation);

    $("#compareGpa").textContent = (evaluation.gpa != null ? evaluation.gpa : "—") + " / " + evaluation.required_gpa;
    $("#compareExperience").textContent = evaluation.experience_years + " / " + evaluation.required_experience_years + " yrs";

    const roadmapBtn = $("#buildRoadmapBtn");
    if (evaluation.missing_skills.length){
      roadmapBtn.style.display = "inline-flex";
      roadmapBtn.onclick = () => buildLearningRoadmap(state.jobPositionId);
    } else {
      roadmapBtn.style.display = "none";
    }

    analyzeResultEl.style.display = "block";
    analyzeResultEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Grouped learning roadmap — reuses the existing modalLearn modal,
  // openModal()/closeModal(), api(), toast() and escapeHtml(), but groups
  // recommendations by skill (the single-skill openLearningModal() used
  // by the dashboard is left untouched).
  async function buildLearningRoadmap(positionId){
    $("#learnTitle").textContent = "Your learning roadmap";
    $("#learnDesc").textContent = "Videos to help close each skill gap for this job.";
    $("#learnBody").innerHTML =
      '<div class="loading-state" style="padding:10px 0;">' +
        '<div class="loading-ring" style="width:40px;height:40px;"></div>' +
        '<div class="loading-msg" style="margin-top:10px;">Building your learning roadmap…</div>' +
      '</div>';
    openModal("modalLearn");

    try{
      const data = await api(
        "/api/career/" + state.applicantId + "/recommendations/" + positionId
      );

      if (data.message && (!data.recommendations || !data.recommendations.length)){
        $("#learnBody").innerHTML = '<div class="empty-state"><h4>No skill gaps found</h4><p>' + escapeHtml(data.message) + '</p></div>';
        return;
      }

      const groups = {};
      (data.recommendations || []).forEach(r => {
        if (!groups[r.skill]) groups[r.skill] = [];
        groups[r.skill].push(r);
      });
      const skillNames = Object.keys(groups);

      if (!skillNames.length){
        $("#learnBody").innerHTML = '<div class="empty-state"><h4>No recommendations yet</h4><p>We couldn\'t find learning content for these skills right now.</p></div>';
        return;
      }

      $("#learnBody").innerHTML = skillNames.map(skill =>
        '<div class="roadmap-group">' +
          '<div class="roadmap-skill-heading">' + escapeHtml(skill) + '</div>' +
          groups[skill].map(r =>
            '<div class="yt-card">' +
              '<div class="yt-thumb"></div>' +
              '<div class="yt-info">' +
                '<div class="yt-title">' + escapeHtml(r.title) + '</div>' +
                '<div class="yt-channel">' + escapeHtml(r.channel) + '</div>' +
                '<a class="yt-watch" href="' + r.url + '" target="_blank" rel="noopener">Watch on YouTube →</a>' +
              '</div>' +
            '</div>'
          ).join("") +
        '</div>'
      ).join("");
    } catch(err){
      $("#learnBody").innerHTML = '<div class="error-state"><h4>Couldn\'t build your roadmap</h4><p>' + escapeHtml(friendlyError(err)) + '</p></div>';
    }
  }

  /* ---------------------------------------------------------
     Utils
     --------------------------------------------------------- */
  function escapeHtml(str){
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */
  renderPositions();
  showView("home");

})();