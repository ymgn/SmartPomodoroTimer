const SOUND_PRESETS = [
  {
    id: "gentle-bell",
    label: "ソフトベル",
    steps: [
      { frequencies: [880], duration: 0.32, type: "sine", gain: 0.9 },
      { delay: 0.02, frequencies: [1318.5], duration: 0.28, type: "sine", gain: 0.8 },
      { delay: 0.04, frequencies: [1046.5], duration: 0.6, type: "sine", gain: 0.7 },
    ],
    release: 0.6,
  },
  {
    id: "digital-chirp",
    label: "デジタルチャープ",
    steps: [
      {
        frequencies: [1200],
        frequencyEnd: [1800],
        duration: 0.18,
        type: "square",
        gain: 0.7,
      },
      {
        delay: 0.05,
        frequencies: [900],
        frequencyEnd: [1500],
        duration: 0.18,
        type: "square",
        gain: 0.6,
      },
      {
        delay: 0.05,
        frequencies: [1400],
        frequencyEnd: [1000],
        duration: 0.24,
        type: "triangle",
        gain: 0.5,
      },
    ],
    release: 0.3,
  },
  {
    id: "warm-marimba",
    label: "マリンバ",
    steps: [
      { frequencies: [660, 880], duration: 0.45, type: "sine", gain: 0.85 },
      { delay: 0.05, frequencies: [990], duration: 0.4, type: "sine", gain: 0.7 },
      { delay: 0.04, frequencies: [660], duration: 0.6, type: "sine", gain: 0.55 },
    ],
    release: 0.5,
  },
  {
    id: "soft-gong",
    label: "ソフトゴング",
    steps: [
      { frequencies: [392, 523.25], duration: 1.1, type: "sine", gain: 1 },
      { delay: 0.15, frequencies: [392], duration: 0.9, type: "sine", gain: 0.6 },
    ],
    release: 1.2,
  },
  {
    id: "fresh-drops",
    label: "さわやかチャイム",
    steps: [
      { frequencies: [1568], duration: 0.22, type: "sine", gain: 0.75 },
      { delay: 0.05, frequencies: [1760], duration: 0.24, type: "sine", gain: 0.7 },
      { delay: 0.06, frequencies: [2093], duration: 0.35, type: "sine", gain: 0.6 },
    ],
    release: 0.4,
  },
];

const DEFAULT_SOUND_ID = "gentle-bell";
const DEFAULT_VOLUME_PERCENT = 70;

const countdownDisplay = document.getElementById("countdown");
const timerLabelDisplay = document.getElementById("timer-label");
const startTimeDisplay = document.getElementById("start-time");
const elapsedTimeDisplay = document.getElementById("elapsed-time");
const completedCyclesDisplay = document.getElementById("completed-cycles");
const presetButtons = document.querySelectorAll(".preset-buttons .btn");
const customForm = document.getElementById("custom-form");
const customMinutesInput = document.getElementById("custom-minutes");
const enableBreakCheckbox = document.getElementById("enable-break");
const breakMinutesInput = document.getElementById("break-minutes");
const startButton = document.getElementById("start-button");
const pauseButton = document.getElementById("pause-button");
const resetButton = document.getElementById("reset-button");
const autoRestartCheckbox = document.getElementById("auto-restart");
const soundSelect = document.getElementById("sound-select");
const volumeRange = document.getElementById("volume-range");
const volumeValueDisplay = document.getElementById("volume-value");
const soundPreviewButton = document.getElementById("sound-preview-button");

let currentMode = "pomodoro";
let currentPhase = "focus";
let timerLabel = "ポモドーロ (25分)";
let timerLabelBase = "ポモドーロ";
let focusDurationSeconds = 25 * 60;
let breakDurationSeconds = 5 * 60;
let timerDurationSeconds = focusDurationSeconds;
let remainingSeconds = timerDurationSeconds;
let timerIntervalId = null;
let startTimestamp = null;
let pausedTimestamp = null;
let accumulatedPausedMs = 0;
let completedCycles = 0;
let isRunning = false;
let audioContext;
let selectedSoundId = DEFAULT_SOUND_ID;
let chimeVolume = DEFAULT_VOLUME_PERCENT / 100;

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playSoundPreset(presetId, volume) {
  if (volume <= 0) {
    return;
  }

  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const preset =
    SOUND_PRESETS.find((candidate) => candidate.id === presetId) || SOUND_PRESETS[0];
  if (!preset) {
    return;
  }

  const now = context.currentTime;
  const masterGain = context.createGain();
  const safeVolume = Math.max(0.0001, Math.min(volume, 1));
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(safeVolume, now + 0.02);
  masterGain.connect(context.destination);

  let stepStart = now;
  let totalDuration = 0;

  preset.steps.forEach((step) => {
    const stepDelay = Number(step.delay) > 0 ? Number(step.delay) : 0;
    stepStart += stepDelay;
    totalDuration += stepDelay;

    const frequencies =
      Array.isArray(step.frequencies) && step.frequencies.length > 0
        ? step.frequencies
        : [step.frequency || 880];
    const stepDuration = Number(step.duration) > 0 ? Number(step.duration) : 0.2;
    const stepGainLevel = Math.max(0.0001, Math.min(step.gain ?? 1, 1.2));

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = step.type || "sine";
      oscillator.frequency.setValueAtTime(frequency, stepStart);

      const frequencyEnd = Array.isArray(step.frequencyEnd)
        ? step.frequencyEnd[index]
        : step.frequencyEnd;
      if (
        Number.isFinite(frequencyEnd) &&
        frequencyEnd > 0 &&
        frequencyEnd !== frequency
      ) {
        oscillator.frequency.linearRampToValueAtTime(
          frequencyEnd,
          stepStart + stepDuration
        );
      }

      const gainNode = context.createGain();
      gainNode.gain.setValueAtTime(0.0001, stepStart);
      gainNode.gain.linearRampToValueAtTime(stepGainLevel, stepStart + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, stepStart + stepDuration);

      oscillator.connect(gainNode).connect(masterGain);
      oscillator.start(stepStart);
      oscillator.stop(stepStart + stepDuration + 0.1);
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gainNode.disconnect();
      });
    });

    stepStart += stepDuration;
    totalDuration += stepDuration;
  });

  const releaseTime = Math.max(0.2, Number(preset.release) || 0.4);
  const fadeStart = now + totalDuration;
  masterGain.gain.setTargetAtTime(0.0001, fadeStart, releaseTime / 3);
  window.setTimeout(() => {
    try {
      masterGain.disconnect();
    } catch (error) {
      console.warn("サウンドノードの解放に失敗しました", error);
    }
  }, Math.ceil((totalDuration + releaseTime + 0.5) * 1000));
}

function updateVolumeDisplay() {
  if (volumeValueDisplay) {
    volumeValueDisplay.textContent = `${Math.round(chimeVolume * 100)}%`;
  }
}

function formatCountdown(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(seconds % 60, 0);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function updateCountdownDisplay() {
  countdownDisplay.textContent = formatCountdown(remainingSeconds);
}

function updateLabelDisplay() {
  if (currentMode === "pomodoro") {
    const phaseName = currentPhase === "focus" ? "作業" : "休憩";
    const phaseSeconds = currentPhase === "focus" ? focusDurationSeconds : breakDurationSeconds;
    const minutes = Math.round(Math.max(phaseSeconds, 60) / 60);
    timerLabelDisplay.textContent = `${timerLabelBase} - ${phaseName} (${minutes}分)`;
  } else {
    timerLabelDisplay.textContent = timerLabel;
  }
}

function updateStartTimeDisplay() {
  if (!startTimestamp) {
    startTimeDisplay.textContent = "--:--:--";
    return;
  }
  const options = { hour: "2-digit", minute: "2-digit", second: "2-digit" };
  startTimeDisplay.textContent = startTimestamp.toLocaleTimeString("ja-JP", options);
}

function updateElapsedDisplay() {
  if (!startTimestamp) {
    elapsedTimeDisplay.textContent = "00:00:00";
    return;
  }
  const elapsedMs = Date.now() - startTimestamp.getTime() - accumulatedPausedMs;
  elapsedTimeDisplay.textContent = formatElapsed(elapsedMs);
}

function updateCycleDisplay() {
  completedCyclesDisplay.textContent = String(completedCycles);
}

function isBreakEnabled() {
  return enableBreakCheckbox.checked && breakDurationSeconds > 0;
}

function syncBreakDurationFromInput() {
  const minutes = Number(breakMinutesInput.value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return;
  }
  breakDurationSeconds = Math.max(1, Math.round(minutes * 60));
}

function updateBreakInputState() {
  const isDisabled = !enableBreakCheckbox.checked;
  breakMinutesInput.disabled = isDisabled;
  if (isDisabled) {
    breakMinutesInput.setAttribute("aria-disabled", "true");
  } else {
    breakMinutesInput.removeAttribute("aria-disabled");
  }
  const breakRow = breakMinutesInput.closest(".custom-form__row--break");
  if (breakRow) {
    breakRow.classList.toggle("custom-form__row--inactive", isDisabled);
  }
  if (!isDisabled) {
    syncBreakDurationFromInput();
  }
}

function clearTimerInterval() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function transitionToFocusPhase() {
  currentPhase = "focus";
  if (currentMode === "pomodoro") {
    timerDurationSeconds = focusDurationSeconds;
  }
  remainingSeconds = timerDurationSeconds;
  updateLabelDisplay();
  updateCountdownDisplay();
}

function transitionToBreakPhase() {
  currentPhase = "break";
  timerDurationSeconds = breakDurationSeconds;
  remainingSeconds = timerDurationSeconds;
  updateLabelDisplay();
  updateCountdownDisplay();
}

function handleTimerTick() {
  remainingSeconds -= 1;
  if (remainingSeconds <= 0) {
    remainingSeconds = 0;
    updateCountdownDisplay();
    playChime();
    updateElapsedDisplay();

    if (currentMode === "pomodoro") {
      if (currentPhase === "focus") {
        completedCycles += 1;
        updateCycleDisplay();
        if (isBreakEnabled()) {
          transitionToBreakPhase();
          return;
        }
      } else if (currentPhase === "break") {
        if (autoRestartCheckbox.checked) {
          transitionToFocusPhase();
        } else {
          stopTimer({ keepStartTimestamp: false });
          transitionToFocusPhase();
        }
        return;
      }
    } else {
      completedCycles += 1;
      updateCycleDisplay();
    }

    if (autoRestartCheckbox.checked) {
      transitionToFocusPhase();
    } else {
      stopTimer({ keepStartTimestamp: false });
      transitionToFocusPhase();
    }
    return;
  }

  updateCountdownDisplay();
  updateElapsedDisplay();
}

function playChime() {
  try {
    playSoundPreset(selectedSoundId, chimeVolume);
  } catch (error) {
    console.warn("サウンドを再生できませんでした", error);
  }
}

function startTimer({ resetCycles } = { resetCycles: false }) {
  if (isRunning) {
    return;
  }

  if (!startTimestamp) {
    startTimestamp = new Date();
    accumulatedPausedMs = 0;
    if (resetCycles) {
      completedCycles = 0;
      updateCycleDisplay();
    }
  } else if (pausedTimestamp) {
    accumulatedPausedMs += Date.now() - pausedTimestamp.getTime();
    pausedTimestamp = null;
  }

  updateStartTimeDisplay();
  updateElapsedDisplay();
  updateCountdownDisplay();

  timerIntervalId = window.setInterval(handleTimerTick, 1000);
  isRunning = true;
  startButton.disabled = true;
  pauseButton.disabled = false;
  startButton.textContent = "進行中";
}

function pauseTimer() {
  if (!isRunning) {
    return;
  }
  pausedTimestamp = new Date();
  clearTimerInterval();
  isRunning = false;
  startButton.disabled = false;
  pauseButton.disabled = true;
  startButton.textContent = "再開";
}

function stopTimer({ keepStartTimestamp } = { keepStartTimestamp: true }) {
  clearTimerInterval();
  isRunning = false;
  pausedTimestamp = null;
  startButton.disabled = false;
  pauseButton.disabled = true;
  if (!keepStartTimestamp) {
    startTimestamp = null;
    accumulatedPausedMs = 0;
    updateStartTimeDisplay();
    updateElapsedDisplay();
    startButton.textContent = "開始";
  } else {
    startButton.textContent = "再開";
  }
}

function resetTimer() {
  stopTimer();
  if (currentMode === "pomodoro") {
    transitionToFocusPhase();
  } else {
    remainingSeconds = timerDurationSeconds;
  }
  startTimestamp = null;
  accumulatedPausedMs = 0;
  completedCycles = 0;
  updateCountdownDisplay();
  updateLabelDisplay();
  updateStartTimeDisplay();
  updateElapsedDisplay();
  updateCycleDisplay();
  startButton.textContent = "開始";
}

function configureSingleTimer(minutes, label, { startImmediately } = { startImmediately: false }) {
  const focusMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
  currentMode = "single";
  currentPhase = "focus";
  timerDurationSeconds = Math.max(1, Math.round(focusMinutes * 60));
  remainingSeconds = timerDurationSeconds;
  timerLabel = label;
  resetTimer();
  if (startImmediately) {
    startTimer({ resetCycles: true });
  }
}

function configurePomodoroTimer(focusMinutes, breakMinutes, label, { startImmediately } = { startImmediately: false }) {
  const safeFocusMinutes = Number.isFinite(focusMinutes) && focusMinutes > 0 ? focusMinutes : 1;
  const safeBreakMinutes = Number.isFinite(breakMinutes) && breakMinutes > 0 ? breakMinutes : 1;
  currentMode = "pomodoro";
  timerLabelBase = label;
  currentPhase = "focus";
  focusDurationSeconds = Math.max(1, Math.round(safeFocusMinutes * 60));
  breakDurationSeconds = Math.max(1, Math.round(safeBreakMinutes * 60));
  timerDurationSeconds = focusDurationSeconds;
  remainingSeconds = timerDurationSeconds;
  resetTimer();
  if (startImmediately) {
    startTimer({ resetCycles: true });
  }
}

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const minutes = Number(button.dataset.minutes);
    const mode = button.dataset.mode;
    const label = button.textContent.trim();
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }

    if (mode === "pomodoro") {
      const defaultBreak = button.dataset.break ? Number(button.dataset.break) : null;
      if (Number.isFinite(defaultBreak) && defaultBreak > 0) {
        breakMinutesInput.value = String(defaultBreak);
      }
      enableBreakCheckbox.checked = true;
      updateBreakInputState();
      syncBreakDurationFromInput();
      customMinutesInput.value = String(minutes);
      configurePomodoroTimer(minutes, Number(breakMinutesInput.value), label, {
        startImmediately: true,
      });
    } else {
      customMinutesInput.value = String(minutes);
      configureSingleTimer(minutes, label, { startImmediately: true });
    }
  });
});

customForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const focusMinutes = Number(customMinutesInput.value);
  if (!Number.isFinite(focusMinutes) || focusMinutes <= 0) {
    customMinutesInput.focus();
    return;
  }

  if (enableBreakCheckbox.checked) {
    syncBreakDurationFromInput();
    const breakMinutes = Number(breakMinutesInput.value);
    configurePomodoroTimer(focusMinutes, breakMinutes, "カスタム ポモドーロ", {
      startImmediately: true,
    });
  } else {
    const label = `カスタム (${focusMinutes}分)`;
    configureSingleTimer(focusMinutes, label, { startImmediately: true });
  }
});

startButton.addEventListener("click", () => {
  startTimer({ resetCycles: false });
});

pauseButton.addEventListener("click", () => {
  pauseTimer();
});

resetButton.addEventListener("click", () => {
  resetTimer();
});

enableBreakCheckbox.addEventListener("change", () => {
  updateBreakInputState();
  if (!isBreakEnabled() && currentMode === "pomodoro" && currentPhase === "break") {
    transitionToFocusPhase();
  }
});

breakMinutesInput.addEventListener("change", () => {
  syncBreakDurationFromInput();
  if (currentMode === "pomodoro" && currentPhase === "break") {
    transitionToBreakPhase();
  }
});

if (soundSelect) {
  soundSelect.innerHTML = "";
  SOUND_PRESETS.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    soundSelect.append(option);
  });

  const availableSoundIds = new Set(SOUND_PRESETS.map((preset) => preset.id));
  if (!availableSoundIds.has(soundSelect.value)) {
    soundSelect.value = DEFAULT_SOUND_ID;
  }
  selectedSoundId = availableSoundIds.has(soundSelect.value)
    ? soundSelect.value
    : DEFAULT_SOUND_ID;
  soundSelect.addEventListener("change", () => {
    if (availableSoundIds.has(soundSelect.value)) {
      selectedSoundId = soundSelect.value;
    } else {
      selectedSoundId = DEFAULT_SOUND_ID;
      soundSelect.value = DEFAULT_SOUND_ID;
    }
  });
}

if (volumeRange) {
  const initialVolume = Number(volumeRange.value);
  if (Number.isFinite(initialVolume)) {
    chimeVolume = Math.max(0, Math.min(initialVolume / 100, 1));
  } else {
    chimeVolume = DEFAULT_VOLUME_PERCENT / 100;
    volumeRange.value = String(DEFAULT_VOLUME_PERCENT);
  }
  updateVolumeDisplay();
  volumeRange.addEventListener("input", () => {
    const nextVolume = Number(volumeRange.value);
    if (Number.isFinite(nextVolume)) {
      chimeVolume = Math.max(0, Math.min(nextVolume / 100, 1));
      updateVolumeDisplay();
    }
  });
} else {
  updateVolumeDisplay();
}

if (soundPreviewButton) {
  const PREVIEW_COOLDOWN_MS = 1200;
  soundPreviewButton.addEventListener("click", () => {
    soundPreviewButton.disabled = true;
    try {
      playChime();
    } finally {
      window.setTimeout(() => {
        soundPreviewButton.disabled = false;
      }, PREVIEW_COOLDOWN_MS);
    }
  });
}

// 初期表示
updateCountdownDisplay();
updateLabelDisplay();
updateStartTimeDisplay();
updateElapsedDisplay();
updateCycleDisplay();
updateBreakInputState();
