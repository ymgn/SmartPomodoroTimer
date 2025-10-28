const SOUND_LIBRARY = [
  {
    id: "gentle-bell",
    label: "ソフトベル",
    description: "柔らかなベルの倍音",
  },
  {
    id: "digital-chirp",
    label: "デジタルチャープ",
    description: "上昇する電子音",
  },
  {
    id: "warm-marimba",
    label: "マリンバ",
    description: "木琴風のワンショット",
  },
  {
    id: "soft-gong",
    label: "ソフトゴング",
    description: "低めのゴングサウンド",
  },
  {
    id: "fresh-drops",
    label: "さわやかチャイム",
    description: "滴るような三音",
  },
];

const DEFAULT_SOUND_ID = SOUND_LIBRARY[0].id;
const DEFAULT_VOLUME_PERCENT = 100;
const MAX_VOLUME_MULTIPLIER = 2;
const TIMER_UPDATE_INTERVAL_MS = 250;

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
let timerEndTimestamp = null;

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function scheduleTone(context, destination, {
  type = "sine",
  frequency = 440,
  startTime = context.currentTime,
  attack = 0.01,
  decay = 0.1,
  sustainLevel = 0.6,
  hold = 0.1,
  release = 0.3,
  frequencySweep,
}) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  if (frequencySweep && typeof frequencySweep.to === "number" && typeof frequencySweep.duration === "number") {
    oscillator.frequency.linearRampToValueAtTime(
      frequencySweep.to,
      startTime + Math.max(frequencySweep.duration, 0)
    );
  }

  const gainNode = context.createGain();
  const epsilon = 0.0001;
  const peakTime = startTime + Math.max(attack, 0.001);
  const decayTime = peakTime + Math.max(decay, 0);
  const holdEndTime = decayTime + Math.max(hold, 0);
  const releaseEndTime = holdEndTime + Math.max(release, 0.01);

  gainNode.gain.setValueAtTime(epsilon, startTime);
  gainNode.gain.linearRampToValueAtTime(1, peakTime);
  gainNode.gain.linearRampToValueAtTime(Math.max(sustainLevel, epsilon), decayTime);
  gainNode.gain.setValueAtTime(Math.max(sustainLevel, epsilon), holdEndTime);
  gainNode.gain.linearRampToValueAtTime(epsilon, releaseEndTime);

  oscillator.connect(gainNode).connect(destination);
  oscillator.start(startTime);
  oscillator.stop(releaseEndTime + 0.05);
  oscillator.addEventListener("ended", () => {
    try {
      oscillator.disconnect();
      gainNode.disconnect();
    } catch (error) {
      console.warn("サウンドノードの解放に失敗しました", error);
    }
  });

  return releaseEndTime + 0.05;
}

function renderChimePattern(soundId, context, destination, startTime) {
  switch (soundId) {
    case "digital-chirp": {
      const base = startTime;
      const first = scheduleTone(context, destination, {
        type: "triangle",
        frequency: 880,
        startTime: base,
        attack: 0.005,
        decay: 0.12,
        sustainLevel: 0.4,
        hold: 0.08,
        release: 0.2,
        frequencySweep: { to: 1760, duration: 0.25 },
      });
      return first;
    }
    case "warm-marimba": {
      const base = startTime;
      const first = scheduleTone(context, destination, {
        type: "sine",
        frequency: 660,
        startTime: base,
        attack: 0.01,
        decay: 0.08,
        sustainLevel: 0.45,
        hold: 0.05,
        release: 0.3,
      });
      const second = scheduleTone(context, destination, {
        type: "square",
        frequency: 990,
        startTime: base + 0.05,
        attack: 0.005,
        decay: 0.1,
        sustainLevel: 0.3,
        hold: 0.05,
        release: 0.25,
      });
      return Math.max(first, second);
    }
    case "soft-gong": {
      const base = startTime;
      const low = scheduleTone(context, destination, {
        type: "sine",
        frequency: 220,
        startTime: base,
        attack: 0.02,
        decay: 0.4,
        sustainLevel: 0.6,
        hold: 0.4,
        release: 0.8,
      });
      const high = scheduleTone(context, destination, {
        type: "sine",
        frequency: 440,
        startTime: base + 0.1,
        attack: 0.02,
        decay: 0.3,
        sustainLevel: 0.4,
        hold: 0.3,
        release: 0.7,
      });
      return Math.max(low, high);
    }
    case "fresh-drops": {
      const base = startTime;
      const first = scheduleTone(context, destination, {
        type: "sine",
        frequency: 1240,
        startTime: base,
        attack: 0.005,
        decay: 0.08,
        sustainLevel: 0.35,
        hold: 0.05,
        release: 0.2,
      });
      const second = scheduleTone(context, destination, {
        type: "sine",
        frequency: 1480,
        startTime: base + 0.1,
        attack: 0.005,
        decay: 0.09,
        sustainLevel: 0.35,
        hold: 0.05,
        release: 0.2,
      });
      const third = scheduleTone(context, destination, {
        type: "sine",
        frequency: 1760,
        startTime: base + 0.2,
        attack: 0.005,
        decay: 0.1,
        sustainLevel: 0.3,
        hold: 0.05,
        release: 0.25,
      });
      return Math.max(first, second, third);
    }
    case "gentle-bell":
    default: {
      const base = startTime;
      const carrier = scheduleTone(context, destination, {
        type: "sine",
        frequency: 880,
        startTime: base,
        attack: 0.02,
        decay: 0.25,
        sustainLevel: 0.5,
        hold: 0.2,
        release: 0.5,
      });
      const overtone = scheduleTone(context, destination, {
        type: "sine",
        frequency: 1320,
        startTime: base + 0.02,
        attack: 0.015,
        decay: 0.18,
        sustainLevel: 0.35,
        hold: 0.15,
        release: 0.45,
      });
      return Math.max(carrier, overtone);
    }
  }
}

function playSoundFromLibrary(soundId, volumeMultiplier) {
  return new Promise((resolve) => {
    if (!Number.isFinite(volumeMultiplier) || volumeMultiplier <= 0) {
      resolve();
      return;
    }

    const context = ensureAudioContext();
    if (!context) {
      resolve();
      return;
    }

    const safeVolume = Math.max(0, Math.min(volumeMultiplier, MAX_VOLUME_MULTIPLIER));
    if (safeVolume <= 0) {
      resolve();
      return;
    }

    const masterGain = context.createGain();
    const currentTime = context.currentTime + 0.01;
    masterGain.gain.setValueAtTime(0.0001, currentTime);
    masterGain.gain.linearRampToValueAtTime(safeVolume, currentTime + 0.01);
    masterGain.connect(context.destination);

    const releaseTime = renderChimePattern(soundId, context, masterGain, currentTime);
    const cleanupTime = Math.max(releaseTime ?? currentTime + 0.5, currentTime + 0.1);
    const timeUntilCleanup = Math.max(0, (cleanupTime - context.currentTime) * 1000 + 100);

    window.setTimeout(() => {
      try {
        masterGain.disconnect();
      } catch (error) {
        console.warn("サウンドノードの解放に失敗しました", error);
      }
      resolve();
    }, timeUntilCleanup);
  });
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

function refreshTimerTargetForRunningTimer() {
  if (isRunning) {
    timerEndTimestamp = Date.now() + Math.max(remainingSeconds, 0) * 1000;
  }
}

function syncRemainingSecondsFromTarget() {
  if (!timerEndTimestamp) {
    return;
  }
  const millisecondsRemaining = timerEndTimestamp - Date.now();
  remainingSeconds = Math.max(0, Math.ceil(millisecondsRemaining / 1000));
}

function transitionToFocusPhase() {
  currentPhase = "focus";
  if (currentMode === "pomodoro") {
    timerDurationSeconds = focusDurationSeconds;
  }
  remainingSeconds = timerDurationSeconds;
  updateLabelDisplay();
  updateCountdownDisplay();
  refreshTimerTargetForRunningTimer();
}

function transitionToBreakPhase() {
  currentPhase = "break";
  timerDurationSeconds = breakDurationSeconds;
  remainingSeconds = timerDurationSeconds;
  updateLabelDisplay();
  updateCountdownDisplay();
  refreshTimerTargetForRunningTimer();
}

function handleTimerCompletion() {
  void playChime();

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
}

function handleTimerTick() {
  if (!isRunning || !timerEndTimestamp) {
    return;
  }

  const millisecondsRemaining = timerEndTimestamp - Date.now();
  if (millisecondsRemaining <= 0) {
    remainingSeconds = 0;
    updateCountdownDisplay();
    updateElapsedDisplay();
    handleTimerCompletion();
    return;
  }

  const secondsRemaining = Math.ceil(millisecondsRemaining / 1000);
  if (secondsRemaining !== remainingSeconds) {
    remainingSeconds = secondsRemaining;
    updateCountdownDisplay();
  }
  updateElapsedDisplay();
}

function playChime() {
  try {
    return playSoundFromLibrary(selectedSoundId, chimeVolume);
  } catch (error) {
    console.warn("サウンドを再生できませんでした", error);
    return Promise.resolve();
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

  timerEndTimestamp = Date.now() + Math.max(remainingSeconds, 0) * 1000;
  timerIntervalId = window.setInterval(handleTimerTick, TIMER_UPDATE_INTERVAL_MS);
  isRunning = true;
  startButton.disabled = true;
  pauseButton.disabled = false;
  startButton.textContent = "進行中";
}

function pauseTimer() {
  if (!isRunning) {
    return;
  }
  syncRemainingSecondsFromTarget();
  timerEndTimestamp = null;
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
  timerEndTimestamp = null;
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
  SOUND_LIBRARY.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    soundSelect.append(option);
  });

  const availableSoundIds = new Set(SOUND_LIBRARY.map((preset) => preset.id));
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
    chimeVolume = Math.max(0, Math.min(initialVolume / 100, MAX_VOLUME_MULTIPLIER));
  } else {
    chimeVolume = DEFAULT_VOLUME_PERCENT / 100;
    volumeRange.value = String(DEFAULT_VOLUME_PERCENT);
  }
  updateVolumeDisplay();
  volumeRange.addEventListener("input", () => {
    const nextVolume = Number(volumeRange.value);
    if (Number.isFinite(nextVolume)) {
      chimeVolume = Math.max(0, Math.min(nextVolume / 100, MAX_VOLUME_MULTIPLIER));
      updateVolumeDisplay();
    }
  });
} else {
  updateVolumeDisplay();
}

if (soundPreviewButton) {
  const PREVIEW_COOLDOWN_MS = 1200;
  soundPreviewButton.addEventListener("click", async () => {
    soundPreviewButton.disabled = true;
    try {
      await playChime();
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
