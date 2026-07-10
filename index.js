"use strict";


/* =========================================================
   ELEMENTS
   ========================================================= */

const viewport = document.getElementById("scene-viewport");

const scenes = Array.from(
  document.querySelectorAll(".scene")
);

const indicatorDots = Array.from(
  document.querySelectorAll(".indicator-dot")
);

const nextSceneButtons = Array.from(
  document.querySelectorAll("[data-next-scene]")
);

const continuityVideo = document.getElementById(
  "continuity-video"
);

const videoFrame = document.querySelector(".video-frame");

const videoSceneIndex = scenes.findIndex((scene) => {
  return scene.classList.contains("scene-video");
});

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;


/* =========================================================
   SETTINGS
   ========================================================= */

const LAST_SCENE_INDEX = scenes.length - 1;

const TRANSITION_DURATION = reducedMotion
  ? 0
  : 900;

const WHEEL_THRESHOLD = 38;

const WHEEL_SETTLE_TIME = 190;

const TOUCH_THRESHOLD = 54;


/* =========================================================
   STATE
   ========================================================= */

let activeSceneIndex = 0;

let sceneLocked = false;

let wheelAccumulator = 0;

let lastWheelEventTime = 0;

let wheelResetTimer = null;

let unlockTimer = null;

let touchStartY = null;

let touchCurrentY = null;


/* =========================================================
   UTILITIES
   ========================================================= */

function clamp(value, minimum, maximum) {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}

function normalizeWheelDelta(event) {
  let delta = event.deltaY;

  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    delta *= 16;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    delta *= window.innerHeight;
  }

  return delta;
}


/* =========================================================
   VIDEO
   ========================================================= */

function markVideoAsReady() {
  if (!videoFrame) {
    return;
  }

  videoFrame.classList.add("is-ready");
}

function playCutscene() {
  if (!continuityVideo) {
    return;
  }

  continuityVideo.muted = true;

  const playback = continuityVideo.play();

  if (playback instanceof Promise) {
    playback.catch(() => {
      /*
       * Muted inline playback is normally allowed.
       * Some browsers may briefly reject playback while
       * the video is still loading.
       */
    });
  }
}

function pauseCutscene() {
  if (!continuityVideo) {
    return;
  }

  continuityVideo.pause();
}

if (continuityVideo) {
  continuityVideo.muted = true;

  continuityVideo.addEventListener(
    "loadeddata",
    markVideoAsReady
  );

  continuityVideo.addEventListener(
    "canplay",
    markVideoAsReady
  );

  if (continuityVideo.readyState >= 2) {
    markVideoAsReady();
  }
}


/* =========================================================
   SCENE MANAGEMENT
   ========================================================= */

function updateScenes(nextIndex) {
  activeSceneIndex = clamp(
    nextIndex,
    0,
    LAST_SCENE_INDEX
  );

  scenes.forEach((scene, index) => {
    const isActive = index === activeSceneIndex;

    scene.classList.toggle(
      "is-active",
      isActive
    );

    scene.setAttribute(
      "aria-hidden",
      String(!isActive)
    );

    scene.inert = !isActive;
  });

  indicatorDots.forEach((dot, index) => {
    dot.classList.toggle(
      "is-active",
      index === activeSceneIndex
    );
  });

  document.body.dataset.activeScene =
    String(activeSceneIndex);

  if (activeSceneIndex === videoSceneIndex) {
    playCutscene();
  } else {
    pauseCutscene();
  }
}


/* =========================================================
   WHEEL LOCKING
   Prevents trackpad momentum from advancing twice or
   immediately returning to the previous scene.
   ========================================================= */

function scheduleSceneUnlock() {
  window.clearTimeout(unlockTimer);

  const earliestUnlockTime =
    performance.now() + TRANSITION_DURATION;

  function attemptUnlock() {
    const currentTime = performance.now();

    const wheelHasSettled =
      currentTime - lastWheelEventTime >=
      WHEEL_SETTLE_TIME;

    const transitionHasFinished =
      currentTime >= earliestUnlockTime;

    if (
      wheelHasSettled &&
      transitionHasFinished
    ) {
      sceneLocked = false;
      wheelAccumulator = 0;
      return;
    }

    unlockTimer = window.setTimeout(
      attemptUnlock,
      45
    );
  }

  unlockTimer = window.setTimeout(
    attemptUnlock,
    45
  );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function goToScene(nextIndex) {
  const safeIndex = clamp(
    nextIndex,
    0,
    LAST_SCENE_INDEX
  );

  if (
    safeIndex === activeSceneIndex ||
    sceneLocked
  ) {
    wheelAccumulator = 0;
    return;
  }

  sceneLocked = true;
  wheelAccumulator = 0;

  updateScenes(safeIndex);
  scheduleSceneUnlock();
}

function goToNextScene() {
  goToScene(activeSceneIndex + 1);
}

function goToPreviousScene() {
  goToScene(activeSceneIndex - 1);
}


/* =========================================================
   MOUSE AND TRACKPAD
   ========================================================= */

function handleWheel(event) {
  event.preventDefault();

  lastWheelEventTime = performance.now();

  if (sceneLocked) {
    return;
  }

  const delta = normalizeWheelDelta(event);

  wheelAccumulator += delta;

  window.clearTimeout(wheelResetTimer);

  wheelResetTimer = window.setTimeout(() => {
    wheelAccumulator = 0;
  }, 130);

  if (
    Math.abs(wheelAccumulator) <
    WHEEL_THRESHOLD
  ) {
    return;
  }

  const direction =
    wheelAccumulator > 0
      ? 1
      : -1;

  wheelAccumulator = 0;

  goToScene(
    activeSceneIndex + direction
  );
}

viewport.addEventListener(
  "wheel",
  handleWheel,
  {
    passive: false
  }
);


/* =========================================================
   TOUCH
   ========================================================= */

viewport.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length !== 1) {
      return;
    }

    touchStartY = event.touches[0].clientY;
    touchCurrentY = touchStartY;
  },
  {
    passive: true
  }
);

viewport.addEventListener(
  "touchmove",
  (event) => {
    if (
      touchStartY === null ||
      event.touches.length !== 1
    ) {
      return;
    }

    event.preventDefault();

    touchCurrentY = event.touches[0].clientY;
  },
  {
    passive: false
  }
);

viewport.addEventListener(
  "touchend",
  () => {
    if (
      touchStartY === null ||
      touchCurrentY === null ||
      sceneLocked
    ) {
      touchStartY = null;
      touchCurrentY = null;
      return;
    }

    const distance =
      touchStartY - touchCurrentY;

    touchStartY = null;
    touchCurrentY = null;

    if (
      Math.abs(distance) <
      TOUCH_THRESHOLD
    ) {
      return;
    }

    if (distance > 0) {
      goToNextScene();
    } else {
      goToPreviousScene();
    }
  },
  {
    passive: true
  }
);

viewport.addEventListener(
  "touchcancel",
  () => {
    touchStartY = null;
    touchCurrentY = null;
  },
  {
    passive: true
  }
);


/* =========================================================
   KEYBOARD
   ========================================================= */

window.addEventListener(
  "keydown",
  (event) => {
    const nextKeys = [
      "ArrowDown",
      "PageDown",
      " "
    ];

    const previousKeys = [
      "ArrowUp",
      "PageUp"
    ];

    if (nextKeys.includes(event.key)) {
      event.preventDefault();
      goToNextScene();
      return;
    }

    if (previousKeys.includes(event.key)) {
      event.preventDefault();
      goToPreviousScene();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      goToScene(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      goToScene(LAST_SCENE_INDEX);
    }
  }
);


/* =========================================================
   BUTTON NAVIGATION
   ========================================================= */

nextSceneButtons.forEach((button) => {
  button.addEventListener(
    "click",
    goToNextScene
  );
});


/* =========================================================
   PAGE VISIBILITY
   ========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      pauseCutscene();
      return;
    }

    if (
      activeSceneIndex ===
      videoSceneIndex
    ) {
      playCutscene();
    }
  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

function initialize() {
  pauseCutscene();
  updateScenes(0);
}

initialize();