const countdownDisplay = document.getElementById("countdown");
const timerLabelDisplay = document.getElementById("timer-label");
const startTimeDisplay = document.getElementById("start-time");
const elapsedTimeDisplay = document.getElementById("elapsed-time");
const completedCyclesDisplay = document.getElementById("completed-cycles");
const presetButtons = document.querySelectorAll(".preset-buttons .btn");
const customForm = document.getElementById("custom-form");
const customMinutesInput = document.getElementById("custom-minutes");
const startButton = document.getElementById("start-button");
const pauseButton = document.getElementById("pause-button");
const resetButton = document.getElementById("reset-button");
const autoRestartCheckbox = document.getElementById("auto-restart");

let timerDurationSeconds = 25 * 60;
let remainingSeconds = timerDurationSeconds;
let timerLabel = "ポモドーロ (25分)";
let timerIntervalId = null;
let startTimestamp = null;
let pausedTimestamp = null;
let accumulatedPausedMs = 0;
let completedCycles = 0;
let isRunning = false;
let audioContext;

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
  timerLabelDisplay.textContent = timerLabel;
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

function clearTimerInterval() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function handleTimerTick() {
  remainingSeconds -= 1;
  if (remainingSeconds <= 0) {
    remainingSeconds = 0;
    updateCountdownDisplay();
    playChime();
    completedCycles += 1;
    updateCycleDisplay();

    if (autoRestartCheckbox.checked) {
      remainingSeconds = timerDurationSeconds;
    } else {
      stopTimer({ keepStartTimestamp: false });
      remainingSeconds = timerDurationSeconds;
      updateCountdownDisplay();
      return;
    }
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

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

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
  remainingSeconds = timerDurationSeconds;
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

function setTimerDuration(minutes, label, { startImmediately } = { startImmediately: false }) {
  timerDurationSeconds = Math.max(1, Math.round(minutes * 60));
  remainingSeconds = timerDurationSeconds;
  timerLabel = label;
  resetTimer();
  if (startImmediately) {
    startTimer({ resetCycles: true });
  }
}

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const minutes = Number(button.dataset.minutes);
    const label = `${button.textContent}`;
    setTimerDuration(minutes, label, { startImmediately: true });
  });
});

customForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const minutes = Number(customMinutesInput.value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    customMinutesInput.focus();
    return;
  }
  const label = `カスタム (${minutes}分)`;
  setTimerDuration(minutes, label, { startImmediately: true });
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

// 初期表示
updateCountdownDisplay();
updateLabelDisplay();
updateStartTimeDisplay();
updateElapsedDisplay();
updateCycleDisplay();
