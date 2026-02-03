// Squid Game Trivia - Shared Game Logic
const SUPABASE_URL = 'https://mcxenuxvbeqpbdzzawro.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jeGVudXh2YmVxcGJkenphd3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Nzc2OTEsImV4cCI6MjA4NTM1MzY5MX0.RQv1JZBPzfhtjXVn7oXHbPbRDsriMWCPU9BUZU71PmE';

// Initialize Supabase client (using global supabase from CDN)
let supabaseClient = null;

function initSupabase() {
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    console.error('Supabase library not loaded');
  }
  return supabaseClient;
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}

// Game state
let currentRoom = null;
let currentPlayer = null;
let roomSubscription = null;

// Player limits
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 15;

// Game settings
const STARTING_HEALTH = 1000;
const DAMAGE_PER_WRONG = 84; // 12 wrong answers = 1008 damage = eliminated
const QUESTIONS_PER_GAME = 20;

// Utility Functions
function generatePIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getBaseURL() {
  const path = window.location.pathname;
  const pathParts = path.split('/');
  // Remove the last part (filename) and join
  const basePath = pathParts.slice(0, -1).join('/');
  return `${window.location.origin}${basePath}`;
}

// Room Management
async function createRoomInDB(pin) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('rooms')
      .insert([
        {
          pin: pin,
          current_question: null,
          status: 'lobby',
          timer_end: null
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating room:', error);
    throw error;
  }
}

async function getRoom(pin) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('pin', pin)
      .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error getting room:', error);
    return null;
  }
}

async function updateRoom(pin, updates) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('rooms')
      .update(updates)
      .eq('pin', pin)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating room:', error);
    throw error;
  }
}

// Player Management
async function createPlayer(pin, nickname) {
  try {
    if (!supabaseClient) initSupabase();
    console.log('Creating player with pin:', pin, 'nickname:', nickname);
    
    const { data, error } = await supabaseClient
      .from('players')
      .insert([
        {
          room_pin: pin,
          nickname: nickname,
          score: STARTING_HEALTH, // Start with 1000 health points
          is_eliminated: false,
          last_answer: null
        }
      ])
      .select()
      .single();

    console.log('Create player result:', data, 'error:', error);
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating player:', error);
    throw error;
  }
}

async function getPlayer(playerId) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting player:', error);
    throw error;
  }
}

async function getPlayersInRoom(pin) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('players')
      .select('*')
      .eq('room_pin', pin)
      .order('score', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting players:', error);
    throw error;
  }
}

async function submitAnswer(playerId, answerIndex) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('players')
      .update({ last_answer: answerIndex })
      .eq('id', playerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error submitting answer:', error);
    throw error;
  }
}

async function updatePlayerScore(playerId, score) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('players')
      .update({ score: score })
      .eq('id', playerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating score:', error);
    throw error;
  }
}

async function eliminatePlayer(playerId) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('players')
      .update({ is_eliminated: true })
      .eq('id', playerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error eliminating player:', error);
    throw error;
  }
}

// Question Management
async function getCategories() {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('question_bank')
      .select('category')
      .order('category');

    if (error) throw error;
    
    // Get unique categories
    const uniqueCategories = [...new Set(data.map(q => q.category))];
    return uniqueCategories;
  } catch (error) {
    console.error('Error getting categories:', error);
    throw error;
  }
}

async function getQuestionsByCategory(category, limit = 20) {
  try {
    if (!supabaseClient) initSupabase();
    const { data, error } = await supabaseClient
      .from('question_bank')
      .select('*')
      .eq('category', category)
      .limit(limit);

    if (error) throw error;
    
    // Shuffle and return
    return shuffleArray(data).slice(0, limit);
  } catch (error) {
    console.error('Error getting questions:', error);
    throw error;
  }
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Realtime Subscriptions
function subscribeToRoom(pin, callback) {
  if (!supabaseClient) initSupabase();
  if (roomSubscription) {
    roomSubscription.unsubscribe();
  }

  roomSubscription = supabaseClient
    .channel(`room:${pin}`)
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'rooms',
        filter: `pin=eq.${pin}`
      }, 
      callback
    )
    .subscribe();

  return roomSubscription;
}

function subscribeToPlayers(pin, callback) {
  if (!supabaseClient) initSupabase();
  console.log('Subscribing to players for room:', pin);
  
  const playerSubscription = supabaseClient
    .channel(`players:${pin}`)
    .on('postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `room_pin=eq.${pin}`
      },
      (payload) => {
        console.log('Realtime player update:', payload);
        callback(payload);
      }
    )
    .subscribe((status) => {
      console.log('Player subscription status:', status);
    });

  return playerSubscription;
}

function unsubscribe() {
  if (roomSubscription) {
    roomSubscription.unsubscribe();
    roomSubscription = null;
  }
}

// Grading Logic
async function gradeAnswers(pin, correctIndex) {
  try {
    // Get all players in room
    const players = await getPlayersInRoom(pin);
    
    // Get current question to verify correct answer
    const room = await getRoom(pin);
    if (!room || !room.current_question) {
      throw new Error('No current question found');
    }

    const gradingPromises = players.map(async (player) => {
      // Skip if already eliminated (health <= 0)
      if (player.is_eliminated || player.score <= 0) {
        console.log(`Player ${player.nickname} skipped - eliminated`);
        return;
      }

      // Convert to numbers for comparison (handle string/number mismatch)
      const playerAnswer = player.last_answer !== null ? Number(player.last_answer) : null;
      const correct = Number(correctIndex);
      
      console.log(`Grading ${player.nickname}: answer=${playerAnswer}, correct=${correct}, health=${player.score}`);

      // Check if answer is correct
      if (playerAnswer !== null && playerAnswer === correct) {
        // Correct answer - no change to health
        console.log(`${player.nickname} answered correctly!`);
      } else {
        // Wrong answer or no answer - reduce health
        const newHealth = Math.max(0, player.score - DAMAGE_PER_WRONG);
        console.log(`${player.nickname} wrong/no answer. Health: ${player.score} -> ${newHealth}`);
        await updatePlayerScore(player.id, newHealth);
        
        // If health reaches 0, mark as eliminated
        if (newHealth <= 0) {
          await eliminatePlayer(player.id);
        }
      }
      
      // Reset last_answer for next question
      await supabaseClient
        .from('players')
        .update({ last_answer: null })
        .eq('id', player.id);
    });

    await Promise.all(gradingPromises);
  } catch (error) {
    console.error('Error grading answers:', error);
    throw error;
  }
}
