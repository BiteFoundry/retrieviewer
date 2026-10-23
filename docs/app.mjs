const $ = (selector) => document.querySelector(selector);
const base = new Map(
  [...document.querySelectorAll("[data-i18n]")].map((el) => [
    el.dataset.i18n,
    el.innerHTML,
  ]),
);
const baseAria = new Map(
  [...document.querySelectorAll("[data-i18n-aria]")].map((el) => [
    el.dataset.i18nAria,
    el.getAttribute("aria-label"),
  ]),
);
const ko = {
  skip: "본문으로 이동",
  headline: "일하는 화면에,<br>작은 친구 하나.",
  intro:
    "혼자 뛰어놀고, 잠깐 쉬기도 하는 보송한 도트 리트리버. 가끔 공을 던져주고 간식을 주세요. 나머지 시간은 각자의 일을 하면 돼요.",
  adopt: '우리 화면으로 데려오기 <span aria-hidden="true">↓</span>',
  noAccount: "계정이나 모델 API 없이, 내 컴퓨터에서 함께해요.",
  previewLoading: "강아지를 만나기 위해 준비하고 있어요…",
  play: "여기서 놀아보기",
  ball: "공 던져주기",
  treat: "간식 주기",
  tug: "터그 놀이",
  inkLabel: "도트 색",
  cream: "크림색",
  gold: "골드색",
  darkInk: "짙은 갈색 / 밝은 배경",
  poseLabel: "수면 그림 · 정지 미리보기",
  livePose: "움직이는 강아지",
  sidePose: "왼쪽으로 옆잠",
  rightPose: "오른쪽으로 옆잠",
  bellyPose: "발라당",
  curlPose: "몸 말고 자기",
  chinPose: "앞발에 턱 괴기",
  sleepStudy: "수면 그림 미리보기예요. 움직이는 강아지를 선택하면 다시 이어집니다.",
  pause: "잠깐 쉬기",
  resume: "다시 놀기",
  demoNote: "같은 그림, 같은 움직임 엔진. 놀기를 누르면 약19MB를 불러와요.",
  previewNote: "브라우저 미리보기 · 설치한 강아지는 실제 앱 창을 따라다녀요.",
  retry: "다시 불러오기",
  dogLabel: "점자 도트 리트리버 실시간 미리보기",
  playLabel: "강아지와 놀기",
  lifeTitle: "강아지는 강아지답게.",
  lifeBody:
    "스스로 걷고 뛰다가 잠들어요. 가끔 나비를 쫓기도 해요. 함께 놀고 싶을 때만 끼어들면 돼요.",
  mechanism:
    "별도의 투명 네이티브 창으로 동작해요. 일반 클릭은 통과하고, 다른 창으로 옮겨가면 숨습니다. 에디터·터미널·에이전트를 개조하지 않아요.",
  installTitle: "명령 두 줄이면,<br>작은 친구가 생겨요.",
  installLocation:
    "앱 화면이 보이는 컴퓨터의 터미널에서 실행하세요. 다음부터는 두 번째 명령만 실행하면 돼요.",
  installStep: "설치 또는 업데이트",
  runStep: "실행한 뒤, 선택창에서 앱 창 고르기",
  copy: "복사",
  copied: "명령을 복사했어요.",
  copyFailed: "복사하지 못했어요. 위 명령을 직접 선택해 복사해 주세요.",
  remoteTitle: "Cursor / VS Code Remote SSH를 쓰나요?",
  remoteBody:
    "서버의 SSH 터미널이 아니라, 앱 화면이 떠 있는 로컬 PC에 설치하세요. 원격 DISPLAY=:1은 서버의 X11 화면이지, 로컬 Cursor 창을 뜻하지는 않아요.",
  nodeTitle: "Node.js / npm이 아직 없나요?",
  nodeBody:
    "공식 다운로드 페이지에서 유지보수 중인 Node.js와 npm을 설치한 뒤 터미널을 다시 여세요. AlmaLinux8 검증 버전은 Node22.23.4이고, 패키지는 Node20+가 필요해요.",
  nodeLink: "공식 페이지에서 Node.js 설치하기 ↗",
  almaNode:
    "AlmaLinux8은 관리자와 nodejs:22 모듈을 확인하세요. 기존 회사 관리 스트림을 승인 없이 reset하지 마세요.",
  prereqLink: "의존 도구·셸별 PATH·데스크톱 라이브러리 안내 ↗",
  npxTitle: "npx로 써보기 / command not found가 나와요",
  npxBody:
    "Node/npm이 있다면 전역 설치 없이 한 번 실행할 수 있어요. npx는 retrieviewer 명령을 PATH에 영구 등록하지 않아요. 다음부터 짧게 실행하려면 위의 전역 설치를 해주세요.",
  pathBody:
    "이미 전역 설치했다면 npm prefix -g를 확인하세요. Linux/macOS는 그 경로의 bin, Windows는 그 경로 자체에 실행 파일이 있어요. csh/tcsh와 bash는 PATH 설정 문법이 달라요.",
  pathLink: "내 셸에 맞는 PATH 설정 보기 ↗",
  supportTitle: "지원 범위",
  windows: "실제 실행 검증 · x64, Node, .NET Framework4 컴파일러가 필요해요.",
  linux:
    "AlmaLinux8 / GLIBC2.28을 격리된 X11 GUI에서 검증했어요. Python3.6+, X11/Xrender/Xext, compositor가 필요해요.",
  mac: "실험적 지원이에요. 실제 Mac에서의 실행은 아직 검증하지 못했어요.",
  wayland:
    "네이티브 Wayland·화면 없는 서버는 미지원이에요. 원격 X11/VNC는 그 원격 화면에서 동작하며 로컬 IDE와는 별개예요.",
  resource:
    "Linux는 16px 셀·15fps, Windows는 8px 셀·30fps예요. 패키지는 약19MB. 0.0.6 Windows 오버레이 검사에서 Node RSS는 약96~106MiB였고 헬퍼는 별도예요. 사용량은 화면 크기와 동작에 따라 달라져요. 이번 버전은 Linux GUI에서 재측정하지 않았어요.",
  supportLink: "필요 조건과 실제 검증 범위 보기 ↗",
  goodbyeTitle: "헤어질 때도, 간단하게.",
  goodbyeBody:
    "컨트롤에서 종료하거나 desktop-stop을 실행하세요. 되돌려야 할 자동 시작·에이전트 패치·셸 래퍼는 만들지 않아요.",
  removeTitle: "완전히 제거하기",
  removeNote:
    "OpenCode 연동을 별도로 활성화했다면 해당 등록을 먼저 disconnect해 주세요.",
  footerLine: "BiteFoundry가 만든 작은 화면 친구.",
  feedback: "피드백 보내기",
  licenses: "코드 MIT · 그림 CC BY-SA4.0",
  credits: "크레딧과 그림 이용 조건",
  fonts: "글꼴 라이선스",
  webAnalytics:
    '홈페이지 방문은 쿠키 없는 <a href="https://developers.cloudflare.com/web-analytics/about/">Cloudflare Web Analytics</a>로 집계해요. 설치한 강아지는 사용 통계를 전송하지 않아요.',
  loading: "강아지를 불러오고 있어요… 약19MB를 내려받아요.",
  running: "공을 던져주거나 간식을 줘 보세요. 아니면 그냥 지켜봐도 좋아요.",
  paused: "잠깐 쉬고 있어요. 다시 놀기를 누르면 이어집니다.",
  failed: "강아지를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
  snapshotFailed:
    "미리보기를 불러오지 못했어요. 아래 놀아보기로 직접 만나보세요.",
  ballSent: "공을 던졌어요!",
  treatSent: "간식을 줬어요.",
  tugSent: "터그 놀이를 시작했어요!",
  busy: "아직 놀고 있거나 쉬는 중이에요. 잠시 뒤 다시 해주세요.",
};
const enExtra = {
  sleepStudy: "Sleeping artwork, still preview. Choose Live puppy to continue.",
  resume: "Resume",
  copied: "Command copied.",
  copyFailed: "Could not copy. Select and copy the command above.",
  loading: "Loading your retriever… downloading about 19 MB.",
  running: "Toss a ball, offer a treat, or just let it do its thing.",
  paused: "Taking a breather. Resume whenever you like.",
  failed: "Could not load the puppy. Check your connection and try again.",
  snapshotFailed:
    "The still preview could not load. Try Play here to meet the puppy.",
  ballSent: "Ball tossed!",
  treatSent: "Treat offered.",
  tugSent: "Tug of war started!",
  busy: "Still playing or cooling down. Try again in a moment.",
};
let language = "en",
  pet = null,
  playing = false,
  loading = false,
  closed = false,
  timer = null,
  last = 0,
  statusKey = "demoNote",
  snapshot = "", study = null, studyRequest = 0;
const columns = 144,
  rows = 60,
  stage = $(".dog-stage"),
  art = $("#puppy"),
  pauseButton = $("#pause");
const t = (key) =>
  language === "ko"
    ? (ko[key] ?? base.get(key) ?? key)
    : (enExtra[key] ?? base.get(key) ?? key);
function status(key) {
  statusKey = key;
  $("#demo-status").textContent = t(key);
}
function setLanguage(next) {
  if (!["en", "ko"].includes(next)) return;
  language = next;
  document.documentElement.lang = next;
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.innerHTML = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-aria]"))
    el.setAttribute(
      "aria-label",
      next === "ko"
        ? ko[el.dataset.i18nAria]
        : baseAria.get(el.dataset.i18nAria),
    );
  for (const el of document.querySelectorAll("[data-language]"))
    el.setAttribute("aria-pressed", String(el.dataset.language === next));
  document.title =
    next === "ko"
      ? "Retrieviewer — 일하는 화면에, 작은 친구 하나"
      : "Retrieviewer — a little company for your screen";
  status(statusKey);
  syncControls();
  try {
    localStorage.setItem("retrieviewer-language", next);
  } catch {}
}
for (const button of document.querySelectorAll("[data-language]"))
  button.addEventListener("click", () => setLanguage(button.dataset.language));
let initial = new URL(location.href).searchParams.get("lang");
if (!["en", "ko"].includes(initial)) {
  try {
    initial = localStorage.getItem("retrieviewer-language");
  } catch {}
}
setLanguage(initial ?? "en");
for (const button of document.querySelectorAll("[data-copy]"))
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      $("#copy-status").textContent = t("copied");
    } catch {
      $("#copy-status").textContent = t("copyFailed");
    }
  });
function fit() {
  const { width, height } = stage.getBoundingClientRect();
  const context = document.createElement("canvas").getContext("2d");
  context.font = "100px JuliaMono";
  const ratio = context.measureText("⣿").width / 100 || 0.6;
  // An intentionally cropped close view, not an OS/agent screenshot. All motion
  // and projection still come from the existing public core; no CSS dog animation.
  const c=study?160:columns,r=study?art.textContent.split('\n').length:rows;
  const cell = Math.min(width / c, height / (r * 2)) * (study?1:1.8);
  art.style.fontSize = cell / ratio + "px";
  art.style.lineHeight = cell * 2 + "px";
  art.style.width = c * cell + "px";
  art.style.height = r * cell * 2 + "px";
}
function syncControls() {
  $("#sleep-pose").disabled=loading;
  $("#play").disabled = loading;
  $("#play").hidden = !!pet || !!study;
  pauseButton.disabled = !pet || !!study;
  pauseButton.setAttribute("aria-pressed", String(!!pet && !playing));
  pauseButton.textContent = t(pet && !playing ? "resume" : "pause");
  for (const kind of ["ball", "treat", "tug"])
    $("#" + kind).disabled = !pet || !playing || !!study;
}
function paint() {
  if (!pet) return;
  const frame = pet.frame({ columns, rows, cellAspect: 0.5, poseFps: 24 });
  art.textContent = frame.text;
  for (const kind of ["ball", "treat", "tug"])
    $("#" + kind).disabled =
      !playing || frame.report.busy || frame.report.cooldowns[kind] > 0;
  stage.dataset.ready = "true";
  stage.dataset.frames = String((Number(stage.dataset.frames) || 0) + 1);
}
function cancelLoop() {
  clearTimeout(timer);
  timer = null;
  last = 0;
}
function schedule() {
  cancelLoop();
  if (closed || !playing || document.hidden) return;
  const tick = () => {
    timer = null;
    if (closed || !playing || document.hidden) {
      last = 0;
      return;
    }
    const now = performance.now();
    try {
      pet.step(last ? Math.min(0.1, (now - last) / 1000) : 0);
      last = now;
      paint();
      timer = setTimeout(tick, 1000 / 24);
    } catch (error) {
      console.error("Retrieviewer preview:", error);
      playing = false;
      cancelLoop();
      status("failed");
      syncControls();
      $("#retry").hidden = false;
    }
  };
  timer = setTimeout(tick, 0);
}
async function load() {
  if (loading) return;
  loading = true;
  status("loading");
  $("#retry").hidden = true;
  syncControls();
  pet?.dispose();
  pet = null;
  playing = false;
  cancelLoop();
  try {
    const { createPet } = await import("./runtime/0.0.6/retrieviewer.mjs");
    const next = await createPet({ seed: 731 });
    if (closed) {
      next.dispose();
      return;
    }
    pet = next;
    playing = true;
    $("#preview-fallback").hidden = true;
    status("running");
    fit();
    paint();
    schedule();
  } catch (error) {
    console.error("Retrieviewer loading:", error);
    status("failed");
    $("#retry").hidden = false;
  } finally {
    loading = false;
    syncControls();
  }
}
$("#ink").addEventListener("change",()=>{
  const ink=$("#ink").value;stage.dataset.ink=ink;
  $("#ink-command").textContent="retrieviewer desktop --ink "+ink;
});
$("#sleep-pose").addEventListener("change",async()=>{
  const key=$("#sleep-pose").value,request=++studyRequest;
  if(key==='live'){
    study=null;playing=!!pet;art.textContent=pet?'':snapshot;
    fit();syncControls();status(pet?'running':'demoNote');
    if(pet){paint();schedule();}return;
  }
  study=key;playing=false;cancelLoop();syncControls();status('previewLoading');
  try{
    const response=await fetch('./sleep-'+key+'.txt?v=0.0.6');
    if(!response.ok)throw Error('Sleep preview HTTP '+response.status);
    const text=await response.text();if(request!==studyRequest||closed)return;
    art.textContent=text.replace(/^(?:\u2800*\n)+/,'').replace(/(?:\n\u2800*)+$/,'');
    $("#preview-fallback").hidden=true;fit();status('sleepStudy');
  }catch{if(request===studyRequest)status('snapshotFailed');}
});
$("#play").addEventListener("click", load);
$("#retry").addEventListener("click", load);
pauseButton.addEventListener("click", () => {
  if (!pet) return;
  playing = !playing;
  status(playing ? "running" : "paused");
  syncControls();
  if (playing) schedule();
  else cancelLoop();
});
for (const kind of ["ball", "treat", "tug"])
  $("#" + kind).addEventListener("click", () => {
    if (!pet || !playing) return;
    status(
      pet.interact(kind)
        ? kind + "Sent"
        : "busy",
    );
    paint();
  });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelLoop();
  else if (playing) schedule();
});
const observer = new ResizeObserver(fit);
observer.observe(stage);
document.fonts.ready.then(fit);
try {
  const response = await fetch("./preview.txt");
  if (!response.ok) throw Error("snapshot HTTP " + response.status);
  snapshot = await response.text();
  if (!pet && !study) {
    art.textContent = snapshot;
    $("#preview-fallback").hidden = true;
    fit();
  }
} catch {
  if (!pet) {
    $("#preview-fallback").textContent = t("snapshotFailed");
  }
}
window.addEventListener("pagehide", (event) => {
  if (event.persisted) {
    cancelLoop();
    return;
  }
  closed = true;
  playing = false;
  cancelLoop();
  observer.disconnect();
  pet?.dispose();
  pet = null;
});
window.addEventListener("pageshow", () => {
  if (!closed && playing) schedule();
});
