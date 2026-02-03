// Host Game Logic

let currentRoomPin = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let timerInterval = null;
let hostPlayersSubscription = null;
let players = [];

// Player limits are defined in game.js (MIN_PLAYERS, MAX_PLAYERS)

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check if Supabase is configured
  if (!SUPABASE_URL || SUPABASE_URL.includes('your-project') || !SUPABASE_KEY || SUPABASE_KEY.includes('your-anon-key')) {
    showStatus('Ошибка: Настройте SUPABASE_URL и SUPABASE_KEY в game.js', 'error');
    return;
  }

  // Event listeners
  document.getElementById('start-room-btn').addEventListener('click', createRoom);
  document.getElementById('load-questions-btn').addEventListener('click', loadQuestions);
  document.getElementById('category-select').addEventListener('change', onCategoryChange);
  document.getElementById('next-question-btn').addEventListener('click', nextQuestion);
  document.getElementById('end-game-btn').addEventListener('click', endGame);

  // Load categories
  await loadCategories();
});

// Create Room
async function createRoom() {
  try {
    const pin = generatePIN();
    currentRoomPin = pin;

    // Create room in database
    await createRoomInDB(pin);

    // Update UI
    document.getElementById('room-pin').textContent = pin;
    document.getElementById('start-room-btn').style.display = 'none';
    document.getElementById('category-section').style.display = 'block';

    // Generate QR Code
    const baseURL = getBaseURL();
    const playerURL = `${baseURL}/player.html?pin=${pin}`;
    
    // Clear previous QR code if any
    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = '';
    
    try {
      new QRCode(qrContainer, {
        text: playerURL,
        width: 256,
        height: 256,
        colorDark: '#0d0d0d',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      document.getElementById('qr-container').style.display = 'block';
    } catch (qrError) {
      console.error('QR Code error:', qrError);
      showStatus('Ошибка генерации QR-кода', 'error');
    }

    showStatus(`Комната создана! PIN: ${pin}`, 'success');

    // Load initial players list
    await loadPlayers();

    // Subscribe to players changes
    hostPlayersSubscription = subscribeToPlayers(pin, (payload) => {
      console.log('Player update received:', payload);
      loadPlayers();
    });

  } catch (error) {
    console.error('Error creating room:', error);
    showStatus('Ошибка создания комнаты: ' + error.message, 'error');
  }
}

// Load Categories
async function loadCategories() {
  try {
    const categories = await getCategories();
    const select = document.getElementById('category-select');
    
    select.innerHTML = '<option value="">Выберите категорию...</option>';
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading categories:', error);
    showStatus('Ошибка загрузки категорий', 'error');
  }
}

// Category Change
function onCategoryChange() {
  const category = document.getElementById('category-select').value;
  if (category) {
    document.getElementById('load-questions-btn').style.display = 'block';
  } else {
    document.getElementById('load-questions-btn').style.display = 'none';
  }
}

// Load Questions
async function loadQuestions() {
  try {
    const category = document.getElementById('category-select').value;
    if (!category) {
      showStatus('Выберите категорию', 'error');
      return;
    }

    // Check minimum players
    if (players.length < MIN_PLAYERS) {
      showStatus(`Минимум ${MIN_PLAYERS} игроков требуется для начала игры. Сейчас: ${players.length}`, 'error');
      return;
    }

    showStatus('Загрузка вопросов...', 'info');
    currentQuestions = await getQuestionsByCategory(category, QUESTIONS_PER_GAME);
    currentQuestionIndex = 0;

    if (currentQuestions.length === 0) {
      showStatus('Вопросы не найдены в этой категории', 'error');
      return;
    }

    // Update room status
    await updateRoom(currentRoomPin, { status: 'playing' });

    // Show game section
    document.getElementById('category-section').style.display = 'none';
    document.getElementById('game-section').style.display = 'block';
    document.getElementById('lobby-section').style.display = 'none';

    // Load players
    await loadPlayers();

    // Start first question
    await nextQuestion();

    showStatus(`Загружено ${currentQuestions.length} вопросов`, 'success');
  } catch (error) {
    console.error('Error loading questions:', error);
    showStatus('Ошибка загрузки вопросов: ' + error.message, 'error');
  }
}

// Next Question
async function nextQuestion() {
  try {
    // Stop previous timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Check if there are more questions
    if (currentQuestionIndex >= currentQuestions.length) {
      showStatus('Все вопросы завершены!', 'info');
      return;
    }

    const question = currentQuestions[currentQuestionIndex];
    currentQuestionIndex++;

    // Update room with current question
    const questionData = {
      id: question.id,
      question_text: question.question_text,
      image_url: question.image_url,
      answers: question.answers,
      correct_index: question.correct_index,
      question_number: currentQuestionIndex,
      total_questions: currentQuestions.length
    };

    // Set timer (30 seconds)
    const timerDuration = 30;
    const timerEnd = new Date(Date.now() + timerDuration * 1000);

    await updateRoom(currentRoomPin, {
      current_question: questionData,
      timer_end: timerEnd.toISOString()
    });

    // Display question
    displayQuestion(questionData);

    // Start timer
    startTimer(timerEnd, question.correct_index);

    showStatus(`Вопрос ${currentQuestionIndex} из ${currentQuestions.length}`, 'info');
  } catch (error) {
    console.error('Error loading next question:', error);
    showStatus('Ошибка загрузки вопроса: ' + error.message, 'error');
  }
}

// Display Question
function displayQuestion(questionData) {
  const questionTextEl = document.getElementById('question-text');
  const questionImageContainer = document.getElementById('question-image-container');
  const hostAnswersEl = document.getElementById('host-answers');

  questionTextEl.textContent = questionData.question_text;

  // Display image if available
  if (questionData.image_url) {
    questionImageContainer.innerHTML = `<img src="${questionData.image_url}" alt="Question Image" class="question-image">`;
  } else {
    questionImageContainer.innerHTML = '';
  }

  // Display answers with correct one highlighted
  if (questionData.answers && Array.isArray(questionData.answers)) {
    const shapes = ['○', '△', '□', '☆'];
    const answersHTML = questionData.answers.map((answer, index) => {
      const isCorrect = index === questionData.correct_index;
      const correctClass = isCorrect ? 'correct-answer' : '';
      const correctIcon = isCorrect ? ' ✓' : '';
      return `
        <div class="host-answer-item ${correctClass}">
          <span class="answer-shape">${shapes[index]}</span>
          <span class="answer-text">${answer}${correctIcon}</span>
        </div>
      `;
    }).join('');
    hostAnswersEl.innerHTML = answersHTML;
  }
}

// Start Timer
function startTimer(timerEnd, correctIndex) {
  const timerValueEl = document.getElementById('timer-value');
  const timerEl = document.querySelector('.timer');

  function updateTimer() {
    const now = new Date();
    const end = new Date(timerEnd);
    const diff = end - now;

    if (diff <= 0) {
      // Timer ended
      timerValueEl.textContent = '00:00';
      timerEl.classList.add('warning');
      clearInterval(timerInterval);
      timerInterval = null;

      // Grade answers
      gradeAnswers(currentRoomPin, correctIndex).then(() => {
        showStatus('Ответы проверены!', 'info');
        loadPlayers(); // Refresh player list
      }).catch(error => {
        console.error('Error grading:', error);
        showStatus('Ошибка проверки ответов', 'error');
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

// Load Players
async function loadPlayers() {
  try {
    console.log('Loading players for room:', currentRoomPin);
    players = await getPlayersInRoom(currentRoomPin);
    console.log('Loaded players:', players);
    displayPlayers();
  } catch (error) {
    console.error('Error loading players:', error);
  }
}

// Display Players
function displayPlayers() {
  const playersListContent = document.getElementById('players-list-content');
  const lobbyPlayersContent = document.getElementById('lobby-players-content');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const lobbyPlayersTitle = lobbyPlayersList ? lobbyPlayersList.querySelector('h3') : null;
  
  console.log('Displaying players:', players.length);
  
  // Update player count in title
  const countText = `Игроки: ${players.length}/${MAX_PLAYERS} (мин. ${MIN_PLAYERS})`;
  if (lobbyPlayersTitle) {
    lobbyPlayersTitle.textContent = countText;
  }
  
  if (players.length === 0) {
    if (playersListContent) {
      playersListContent.innerHTML = '<p style="text-align: center; color: var(--gray);">Нет игроков</p>';
    }
    if (lobbyPlayersContent) {
      lobbyPlayersContent.innerHTML = `<p style="text-align: center; color: var(--gray);">Ожидание игроков... (мин. ${MIN_PLAYERS})</p>`;
    }
    return;
  }

  // Show lobby players list when we have players
  if (lobbyPlayersList) {
    lobbyPlayersList.style.display = 'block';
  }

  const playersList = players.map(player => {
    const eliminatedClass = (player.is_eliminated || player.score <= 0) ? 'eliminated' : '';
    const healthPercent = Math.max(0, Math.min(100, (player.score / STARTING_HEALTH) * 100));
    let healthColor = '#00ff00';
    if (healthPercent <= 30) healthColor = '#ff0000';
    else if (healthPercent <= 60) healthColor = '#ffaa00';
    
    return `
      <div class="player-item ${eliminatedClass}">
        <div class="player-name">${player.nickname}</div>
        <div class="player-health">
          <span class="hp-value">${player.score} HP</span>
          <div class="mini-health-bar">
            <div class="mini-health-fill" style="width: ${healthPercent}%; background: ${healthColor};"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (playersListContent) {
    playersListContent.innerHTML = playersList;
  }
  if (lobbyPlayersContent) {
    lobbyPlayersContent.innerHTML = playersList;
  }
}

// End Game
async function endGame() {
  if (confirm('Вы уверены, что хотите завершить игру?')) {
    try {
      await updateRoom(currentRoomPin, { status: 'ended' });
      showStatus('Игра завершена!', 'info');
      
      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      // Unsubscribe
      unsubscribe();
      if (hostPlayersSubscription) {
        hostPlayersSubscription.unsubscribe();
        hostPlayersSubscription = null;
      }
    } catch (error) {
      console.error('Error ending game:', error);
      showStatus('Ошибка завершения игры', 'error');
    }
  }
}

// Show Status Message
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 5000);
}
