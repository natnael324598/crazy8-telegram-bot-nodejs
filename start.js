import { cards } from "./cards.js";
import { Markup } from "telegraf";
function createDeck() {
  return Object.keys(cards); // ["spades_A", "spades_2", ...]
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

export async function startGame(ctx, session) {
  // 1. Create & shuffle deck
  const deck = createDeck();
  shuffle(deck);

  // 2. Initialize game state
  session.deck = deck;
  session.discardPile = [];
  session.currentPlayerIndex = 0;

  // 3. Give each player 5 cards
  session.players.forEach((player) => {
    player.hand = [];

    for (let i = 0; i < 5; i++) {
      player.hand.push(session.deck.pop());
    }
  });

  // 4. Set starting card (not an 8 ideally)
  let firstCard = session.deck.pop();

  // Avoid starting with special (optional but better)
  while (firstCard.includes("_8")) {
    session.deck.unshift(firstCard); // put back
    firstCard = session.deck.pop();
  }

  session.discardPile.push(firstCard);

  // 5. Announce game start (text first)
  await ctx.reply(
    `🎮 Game started!\n\n👉 First turn: ${session.players[0].name} \nuse /draw1card to draw card \nuse /skipturn8 to skip`,
  );

  // 6. Send starting card as sticker
  await ctx.telegram.sendSticker(ctx.chat.id, cards[firstCard]);


  // 6. Prompt first player
  

const player = session.players[0];
const safeName = player.name.replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;");

const mention = `<a href="tg://user?id=${player.id}">${safeName}</a>`;

// Inline button to "See your cards"
// New inline mode button
const keyboard = Markup.inlineKeyboard([
  Markup.button.switchToCurrentChat("🃏 See your cards", `${ctx.chat.id}`)
]);

await ctx.reply(
  `👉 ${mention}, it's your turn! \nuse /draw1card to draw card \nuse /skipturn8 to skip`,
  {
    parse_mode: "HTML",
    ...keyboard
  }
);

}

