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
const volumeSlider = document.getElementById("volume-slider");
const volumeDisplay = document.getElementById("volume-display");

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
let phaseEndTimestamp = null;
let chimeVolumePercent = 100;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function syncRemainingSecondsWithClock() {
  if (!phaseEndTimestamp) {
    return;
  }
  const msRemaining = phaseEndTimestamp - Date.now();
  const secondsRemaining = Math.ceil(msRemaining / 1000);
  remainingSeconds = Math.max(0, secondsRemaining);
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
  phaseEndTimestamp = isRunning ? Date.now() + remainingSeconds * 1000 : null;
  updateLabelDisplay();
  updateCountdownDisplay();
}

function transitionToBreakPhase() {
  currentPhase = "break";
  timerDurationSeconds = breakDurationSeconds;
  remainingSeconds = timerDurationSeconds;
  phaseEndTimestamp = isRunning ? Date.now() + remainingSeconds * 1000 : null;
  updateLabelDisplay();
  updateCountdownDisplay();
}

function handleTimerTick() {
  syncRemainingSecondsWithClock();
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
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const volumeRatio = Math.max(0, chimeVolumePercent) / 100;
    if (volumeRatio === 0) {
      return;
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const now = audioContext.currentTime;
    const peakGain = 0.2 * volumeRatio;
    const startGain = Math.max(peakGain * 0.005, 0.0001);
    const endGain = Math.max(peakGain * 0.001, 0.00005);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gainNode.gain.setValueAtTime(startGain, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(endGain, now + 1.3);

    oscillator.connect(gainNode).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.4);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gainNode.disconnect();
    });
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

  phaseEndTimestamp = Date.now() + remainingSeconds * 1000;
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
  syncRemainingSecondsWithClock();
  pausedTimestamp = new Date();
  clearTimerInterval();
  phaseEndTimestamp = null;
  isRunning = false;
  startButton.disabled = false;
  pauseButton.disabled = true;
  startButton.textContent = "再開";
  updateCountdownDisplay();
  updateElapsedDisplay();
}

function stopTimer({ keepStartTimestamp } = { keepStartTimestamp: true }) {
  clearTimerInterval();
  isRunning = false;
  pausedTimestamp = null;
  phaseEndTimestamp = null;
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
    phaseEndTimestamp = null;
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

function setChimeVolume(percent) {
  const safeValue = clamp(Math.round(percent), 0, 200);
  chimeVolumePercent = safeValue;
  if (volumeDisplay) {
    volumeDisplay.textContent = `${safeValue}%`;
  }
  if (volumeSlider) {
    volumeSlider.value = String(safeValue);
    volumeSlider.setAttribute("aria-valuenow", volumeSlider.value);
    volumeSlider.setAttribute("aria-valuetext", `${safeValue}%`);
  }
}

if (volumeSlider) {
  setChimeVolume(Number(volumeSlider.value) || 100);
  volumeSlider.addEventListener("input", () => {
    const sliderValue = Number(volumeSlider.value);
    if (!Number.isFinite(sliderValue)) {
      return;
    }
    setChimeVolume(sliderValue);
  });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && isRunning) {
    syncRemainingSecondsWithClock();
    if (remainingSeconds <= 0) {
      handleTimerTick();
    } else {
      updateCountdownDisplay();
      updateElapsedDisplay();
    }
  }
});

// 初期表示
updateCountdownDisplay();
updateLabelDisplay();
updateStartTimeDisplay();
updateElapsedDisplay();
updateCycleDisplay();
updateBreakInputState();
