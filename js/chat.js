// =============================================
// TUTORIAL CHAT
// =============================================
let chatQueue = [
    { char: 'arif', text: 'Ajeng! Kamu di mana?', delay: 2 },
    { char: 'ajeng', text: 'Aku di sisi lain labirin! Sinyalku terputus.', delay: 4 },
    { char: 'arif', text: 'Kita hanya bisa bergerak searah bersamaan. Arahkan kita berdua!', delay: 7 },
    { char: 'ajeng', text: 'Hati-hati, ada Quest Node yang menghalangi jalan kita.', delay: 10 },
    { char: 'arif', text: 'Ayo selesaikan 4 Quest baru kita bisa bertemu di titik terang (🩷)!', delay: 13 },
];
let chatActive = false;
let chatTimeout = null;
let lastRandomChatTime = 0;
const RANDOM_CHAT_INTERVAL = 17; // seconds between random chats

function processChatQueue() {
    if (!gameStarted) return;

    if (chatQueue.length > 0) {
        const nextChat = chatQueue[0];
        if (elapsedSec >= nextChat.delay) {
            chatQueue.shift(); // remove from queue
            showChatMessage(nextChat.char, nextChat.text);
        }
    } else if (!questPaused && !fusionComplete && (elapsedSec - lastRandomChatTime > RANDOM_CHAT_INTERVAL)) {
        // Randomly queue a chat if there's no chat currently displayed
        const chatUI = document.getElementById('tutorial-chat');
        if (chatUI && chatUI.classList.contains('hidden') && !chatTimeout) {
            lastRandomChatTime = elapsedSec;

            const rand = Math.random();
            if (rand < 0.3 && soloArifChats.length > 0) {
                const text = soloArifChats[Math.floor(Math.random() * soloArifChats.length)];
                chatQueue.push({ char: 'arif', text, delay: elapsedSec + 1 });
            } else if (rand < 0.6 && soloAjengChats.length > 0) {
                const text = soloAjengChats[Math.floor(Math.random() * soloAjengChats.length)];
                chatQueue.push({ char: 'ajeng', text, delay: elapsedSec + 1 });
            } else if (duoChats.length > 0) {
                const seq = duoChats[Math.floor(Math.random() * duoChats.length)];
                let curDelay = elapsedSec + 1;
                seq.forEach(msg => {
                    chatQueue.push({ char: msg.char, text: msg.text, delay: curDelay });
                    curDelay += 4; // 4 second gap between replies
                });
            }
        }
    }
}

function showChatMessage(char, text) {
    const chatUI = document.getElementById('tutorial-chat');
    const avatar = document.getElementById('chat-avatar');
    const nameEl = document.getElementById('chat-name');
    const textEl = document.getElementById('chat-text');

    if (!chatUI) return;

    menuSynth.playSFX('chat');

    avatar.src = char === 'arif' ? 'arif.png' : 'ajeng.png';
    nameEl.textContent = char === 'arif' ? 'Arif' : 'Ajeng';
    nameEl.style.color = char === 'arif' ? 'var(--blue)' : 'var(--pink)';
    textEl.textContent = text;

    chatUI.classList.remove('hidden');

    if (chatTimeout) clearTimeout(chatTimeout);
    chatTimeout = setTimeout(() => {
        chatUI.classList.add('hidden');
        chatTimeout = null;
        lastRandomChatTime = elapsedSec;
    }, 4500); // hide after 4.5s
}
