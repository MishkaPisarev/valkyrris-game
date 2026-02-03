// Player Game Logic

let currentPlayerId = null;
let currentRoomPin = null;
let playerRoomSubscription = null;
let playerPlayerSubscription = null;
let timerInterval = null;
let selectedAnswer = null;
let isEliminated = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check if Supabase is configured
  if (!SUPABASE_URL || SUPABASE_URL.includes('your-project') || !SUPABASE_KEY || SUPABASE_KEY.includes('your-anon-key')) {
    showJoinStatus('Ошибка: Настройте SUPABASE_URL и SUPABASE_KEY в game.js', 'error');
    return;
  }

  // Get PIN from URL
  const urlParams = new URLSearchParams(window.location.search);
  const pinFromURL = urlParams.get('pin');
  if (pinFromURL) {
    document.getElementById('pin-input').value = pinFromURL;
  }

  // Event listeners
  document.getElementById('join-btn').addEventListener('click', joinGame);
  document.getElementById('pin-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('nickname-input').focus();
    }
  });
  document.getElementById('nickname-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      joinGame();
    }
  });

  // Answer button listeners - use event delegation to avoid duplicate handlers
  const answersContainer = document.querySelector('.answers-container');
  if (answersContainer) {
    answersContainer.addEventListener('click', (e) => {
      const button = e.target.closest('.answer-button');
      if (button && !button.disabled) {
        const answerIndex = parseInt(button.dataset.index);
        if (!isNaN(answerIndex)) {
          selectAnswer(answerIndex);
        }
      }
    });
  }
});

// Join Game
async function joinGame() {
  try {
    console.log('joinGame called');
    const pin = document.getElementById('pin-input').value.trim();
    const nickname = document.getElementById('nickname-input').value.trim();

    console.log('PIN:', pin, 'Nickname:', nickname);

    if (!pin || pin.length !== 4) {
      showJoinStatus('Введите правильный 4-значный PIN', 'error');
      return;
    }

    if (!nickname || nickname.length < 2) {
      showJoinStatus('Введите никнейм (минимум 2 символа)', 'error');
      return;
    }

    showJoinStatus('Подключение...', 'info');

    // Check if room exists
    console.log('Checking room...');
    const room = await getRoom(pin);
    console.log('Room result:', room);
    if (!room) {
      showJoinStatus('Комната не найдена. Проверьте PIN.', 'error');
      return;
    }

    // Check if room is full
    console.log('Checking player count...');
    const existingPlayers = await getPlayersInRoom(pin);
    console.log('Existing players:', existingPlayers.length);
    if (existingPlayers.length >= MAX_PLAYERS) {
      showJoinStatus(`Комната полная! Максимум ${MAX_PLAYERS} игроков.`, 'error');
      return;
    }

    // Check if game already started
    if (room.status === 'playing') {
      showJoinStatus('Игра уже началась. Невозможно присоединиться.', 'error');
      return;
    }

    // Create player
    console.log('Creating player...');
    const player = await createPlayer(pin, nickname);
    console.log('Player created:', player);
    currentPlayerId = player.id;
    currentRoomPin = pin;

    // Update UI
    document.getElementById('join-section').style.display = 'none';
    document.getElementById('player-name-display').textContent = nickname;
    document.getElementById('player-score').textContent = player.score || STARTING_HEALTH;
    updateHealthBar(player.score || STARTING_HEALTH);

    // Check if eliminated
    isEliminated = player.is_eliminated || player.score <= 0;

    // Subscribe to room changes
    subscribeToRoom(pin, async (payload) => {
      await handleRoomUpdate(payload);
    });

    // Subscribe to player updates
    playerPlayerSubscription = subscribeToPlayers(pin, async (payload) => {
      if (payload.new && payload.new.id === currentPlayerId) {
        // Update player data
        const updatedPlayer = await getPlayer(currentPlayerId);
        if (updatedPlayer) {
          isEliminated = updatedPlayer.is_eliminated || updatedPlayer.score <= 0;
          document.getElementById('player-score').textContent = updatedPlayer.score;
          updateHealthBar(updatedPlayer.score);
        }
      }
    });

    // Load current question if game is in progress
    if (room.current_question && room.status === 'playing') {
      // Reset buttons before displaying question
      document.querySelectorAll('.answer-button').forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = false;
      });
      await displayQuestion(room.current_question);
      if (room.timer_end) {
        startTimer(new Date(room.timer_end));
      }
      document.getElementById('game-section').style.display = 'block';
    } else {
      document.getElementById('waiting-section').style.display = 'block';
    }

    showJoinStatus('Успешно присоединились!', 'success');
  } catch (error) {
    console.error('Error joining game:', error);
    showJoinStatus('Ошибка присоединения: ' + error.message, 'error');
  }
}

// Handle Room Update
async function handleRoomUpdate(payload) {
  try {
    const room = payload.new || payload.old;
    if (!room) return;

    // Check if game ended
    if (room.status === 'ended') {
      document.getElementById('game-section').style.display = 'none';
      document.getElementById('waiting-section').innerHTML = `
        <div class="status-message info">
          <h2>Игра завершена!</h2>
          <p>Ваш финальный счет: <span class="digital-font">${document.getElementById('player-score').textContent}</span></p>
        </div>
      `;
      document.getElementById('waiting-section').style.display = 'block';
      return;
    }

    // If new question
    if (room.current_question && room.status === 'playing') {
      document.getElementById('waiting-section').style.display = 'none';
      document.getElementById('game-section').style.display = 'block';
      
      // Reset state BEFORE displaying question
      isSubmitting = false;
      selectedAnswer = null;
      const buttons = document.querySelectorAll('.answer-button');
      buttons.forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = false;
        btn.blur(); // Remove focus to remove glow
        // Force remove any focus state
        if (document.activeElement === btn) {
          document.activeElement.blur();
        }
      });
      document.getElementById('answer-status').style.display = 'none';
      
      await displayQuestion(room.current_question);

      // Start timer
      if (room.timer_end) {
        startTimer(new Date(room.timer_end));
      }
    }
  } catch (error) {
    console.error('Error handling room update:', error);
  }
}

// Display Question
async function displayQuestion(questionData) {
  const questionTextEl = document.getElementById('question-text');
  const questionImageContainer = document.getElementById('question-image-container');
  const answerButtons = document.querySelectorAll('.answer-button');

  if (typeof questionData === 'string') {
    questionData = JSON.parse(questionData);
  }

  // Reset all buttons first - completely clear state
  isSubmitting = false;
  selectedAnswer = null;
  answerButtons.forEach(btn => {
    btn.classList.remove('selected');
    btn.disabled = false;
    btn.blur(); // Remove focus/glow
    // Force remove focus if this button is currently focused
    if (document.activeElement === btn) {
      document.activeElement.blur();
    }
  });
  document.getElementById('answer-status').style.display = 'none';

  questionTextEl.textContent = questionData.question_text || '';

  // Display image if available
  if (questionData.image_url) {
    questionImageContainer.innerHTML = `<img src="${questionData.image_url}" alt="Question Image" class="question-image">`;
  } else {
    questionImageContainer.innerHTML = '';
  }

  // Display answers on buttons (without showing which is correct)
  if (questionData.answers && Array.isArray(questionData.answers)) {
    const shapes = ['○', '△', '□', '☆'];
    answerButtons.forEach((btn, index) => {
      if (questionData.answers[index]) {
        btn.innerHTML = `<span class="answer-shape">${shapes[index]}</span><span class="answer-text">${questionData.answers[index]}</span>`;
      }
    });
  }
}

// Select Answer
let isSubmitting = false; // Prevent double submission

async function selectAnswer(answerIndex) {
  if (!currentPlayerId) return;
  if (isSubmitting) return; // Prevent double clicks
  
  // Check if buttons are disabled (timer ended)
  const buttons = document.querySelectorAll('.answer-button');
  if (buttons[answerIndex] && buttons[answerIndex].disabled) {
    return;
  }

  isSubmitting = true;

  // Remove focus from all buttons first to remove glow
  buttons.forEach(btn => {
    btn.blur();
    btn.classList.remove('selected');
  });

  // Update UI - add selected class and remove focus
  const selectedButton = buttons[answerIndex];
  if (selectedButton) {
    selectedButton.classList.add('selected');
    selectedButton.blur(); // Remove focus to prevent glow
  }

  selectedAnswer = answerIndex;

  // Submit answer (even if eliminated, for fun)
  try {
    await submitAnswer(currentPlayerId, answerIndex);
    
    if (isEliminated) {
      showAnswerStatus('Ответ отправлен (вы в режиме наблюдателя)', 'info');
    } else {
      showAnswerStatus('Ответ отправлен!', 'success');
    }
  } catch (error) {
    console.error('Error submitting answer:', error);
    showAnswerStatus('Ошибка отправки ответа', 'error');
    // Reset selection on error
    selectedButton?.classList.remove('selected');
    selectedAnswer = null;
  } finally {
    // Allow new selection after a short delay
    setTimeout(() => {
      isSubmitting = false;
    }, 300);
  }
}

// Start Timer
function startTimer(timerEnd) {
  const timerValueEl = document.getElementById('timer-value');
  const timerEl = document.querySelector('.timer');

  // Clear previous timer
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  function updateTimer() {
    const now = new Date();
    const end = new Date(timerEnd);
    const diff = end - now;

    if (diff <= 0) {
      timerValueEl.textContent = '00:00';
      timerEl.classList.add('warning');
      clearInterval(timerInterval);
      timerInterval = null;

      // Disable answer buttons
      document.querySelectorAll('.answer-button').forEach(btn => {
        btn.disabled = true;
      });

      return;
    }

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerValueEl.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Warning when less than 10 seconds
    if (seconds <= 10) {
      timerEl.classList.add('warning');
    } else {
      timerEl.classList.remove('warning');
    }
  }

  updateTimer();
  timerInterval = setInterval(updateTimer, 100);
}

// Update Health Bar
function updateHealthBar(health) {
  const healthBarFill = document.getElementById('health-bar-fill');
  const healthPercent = Math.max(0, Math.min(100, (health / STARTING_HEALTH) * 100));
  
  healthBarFill.style.width = healthPercent + '%';
  
  // Change color based on health
  if (healthPercent > 60) {
    healthBarFill.style.background = 'linear-gradient(90deg, #00ff00, #88ff88)';
  } else if (healthPercent > 30) {
    healthBarFill.style.background = 'linear-gradient(90deg, #ffaa00, #ffcc00)';
  } else {
    healthBarFill.style.background = 'linear-gradient(90deg, #ff0000, #ff4444)';
  }
  
  // Disable buttons if eliminated
  if (health <= 0) {
    document.querySelectorAll('.answer-button').forEach(btn => {
      btn.disabled = true;
    });
  }
}

// Show Join Status
function showJoinStatus(message, type = 'info') {
  const statusEl = document.getElementById('join-status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';

  setTimeout(() => {
    if (type === 'success') {
      statusEl.style.display = 'none';
    }
  }, 3000);
}

// Show Answer Status
function showAnswerStatus(message, type = 'info') {
  const statusEl = document.getElementById('answer-status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';

  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}
