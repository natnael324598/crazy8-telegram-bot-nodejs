import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { startGame } from "./start.js";
import dotenv from "dotenv";
// import { cards } from "./cards.js";
import { cards, uniqueIdCards } from "./cards.js";
import http from "http";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const sessions = {};
const pendingInlineStickerPlays = {};

// Replace with your bot username (without @)
const BOT_USERNAME = "crazyesbot";
function avoidprivate(ctx) {
  if (ctx.chat.type === "private") {
    return ctx.reply(
      "🎮 To play this game, add me to a group!",
      Markup.inlineKeyboard([
        Markup.button.url(
          "➕ Add me to group",
          `https://t.me/${BOT_USERNAME}?startgroup=true`,
        ),
      ]),
    );
    return true;
  }
  return false;
}

bot.start((ctx) => {
  avoidprivate(ctx);
});
bot.command("newgame", (ctx) => {
  if (avoidprivate(ctx)) return;

  const chatId = ctx.chat.id;

  if (sessions[chatId]) {
    return ctx.reply("⚠️ A game is already in progress or waiting!", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  sessions[chatId] = {
    players: [],
    gameStarted: false,
  };

  ctx.reply("🃏 New Crazy 8 game created!\nType /join to enter.", {
    reply_to_message_id: ctx.message.message_id,
  });
});
bot.command("join", (ctx) => {
  console.log(ctx.message);
  const chatId = ctx.chat.id;
  const user = ctx.from;

  if (!sessions[chatId]) {
    return ctx.reply("❌ No active game. Type /newgame first.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const session = sessions[chatId];

  if (session.gameStarted) {
    return ctx.reply("🚫 Game already started!", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const alreadyJoined = session.players.find((p) => p.id === user.id);

  if (alreadyJoined) {
    return ctx.reply("⚠️ You already joined!", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const name = user.first_name || user.username || "Player";

  session.players.push({
    id: user.id,
    name: name,
  });
  const mention = `<a href="tg://user?id=${user.id}">${name}</a>`;
  ctx.reply(`✅ ${mention} joined the game!`, {
    parse_mode: "HTML",
    reply_to_message_id: ctx.message.message_id,
  });
});
bot.command("killgame", async (ctx) => {
  if (avoidprivate(ctx)) return;

  const chatId = ctx.chat.id;
  const user = ctx.from;
  const session = sessions[chatId];

  if (!session) {
    return ctx.reply("❌ No game to kill.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  // Only creator or admin can kill
  try {
    const member = await ctx.telegram.getChatMember(chatId, user.id);

    const isAdmin = ["administrator", "creator"].includes(member.status);
    const isCreator =
      session.players.length > 0 && session.players[0].id === user.id;

    if (!isCreator && !isAdmin) {
      return ctx.reply(
        "🚫 Only the game creator or a group admin can kill the game.",
        {
          reply_to_message_id: ctx.message.message_id,
        },
      );
    }

    // Delete the session
    delete sessions[chatId];
    ctx.reply("💀 Game has been killed.", {
      reply_to_message_id: ctx.message.message_id,
    });
  } catch (err) {
    console.error(err);
    ctx.reply("⚠️ Failed to check permissions.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }
});
bot.command("leave", (ctx) => {
  const chatId = ctx.chat.id;
  const user = ctx.from;

  const session = sessions[chatId];

  if (!session) {
    return ctx.reply("❌ No active game.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const playerIndex = session.players.findIndex((p) => p.id === user.id);

  if (playerIndex === -1) {
    return ctx.reply("⚠️ You are not in the game.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const playerName = session.players[playerIndex].name;

  // Remove player
  session.players.splice(playerIndex, 1);

  ctx.reply(`👋 ${playerName} left the game.`, {
    reply_to_message_id: ctx.message.message_id,
  });

  // Optional: auto-kill if empty
  if (session.players.length === 0) {
    delete sessions[chatId];
    ctx.reply("💀 Game ended (no players left).", {
      reply_to_message_id: ctx.message.message_id,
    });
  }
});
bot.command("close", (ctx) => {
  if (avoidprivate(ctx)) return;

  const chatId = ctx.chat.id;
  const user = ctx.from;
  const session = sessions[chatId];

  if (!session) {
    return ctx.reply("❌ No active game to close.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  // Only the creator (first player) can close
  if (session.players.length === 0 || session.players[0].id !== user.id) {
    return ctx.reply("🚫 Only the creator of the game can close it.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  if (session.gameStarted) {
    return ctx.reply("⚠️ Game has already started.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  // Check minimum players
  if (session.players.length < 2) {
    return ctx.reply("⚠️ You need at least 2 players to start the game!", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  // Lock the game
  session.gameStarted = true;

  ctx.reply(
    `🔒 Game is now closed. ${session.players.length} players are ready to play!\n` +
      `👥 Players: ${session.players.map((p) => p.name).join(", ")}\n` +
      `🎮 Let the game begin!`,
  );

  // 🚀 START GAME
  startGame(ctx, session);

  // You can call startGame() here if you implement it
});
// Enable inline queries
bot.on("inline_query", async (ctx) => {
  const userId = ctx.from.id;
  const query = ctx.inlineQuery.query; // contains the chat id
  console.log("Query received:", query);
  console.log("Available sessions:", Object.keys(sessions));

  // Parse chat id from query
  const chatId = parseInt(query);
  const session = sessions[chatId];

  if (!session) {
    // User is not in a valid game
    return ctx.answerInlineQuery([], {
      switch_pm_text: "❌ No active game here",
      switch_pm_parameter: "not_in_game",
      cache_time: 0,
    });
  }

  const player = session.players.find((p) => p.id === userId);

  if (!player) {
    // User clicked the button but isn't in game
    return ctx.answerInlineQuery([], {
      switch_pm_text: "❌ You are not in the game",
      switch_pm_parameter: "not_in_game",
      cache_time: 0,
    });
  }
  const currentPlayer = session.players[session.currentPlayerIndex];
  if (currentPlayer.id !== userId) {
    return ctx.answerInlineQuery([], {
      switch_pm_text: `⛔ It's not your turn, ${player.name}!`,
      switch_pm_parameter: "not_your_turn",
      cache_time: 0,
    });
  }
  // Map player's cards to inline sticker results with a stable result id.
  const results = player.hand.map((card, index) => ({
    type: "sticker",
    id: `play_${chatId}_${userId}_${index}`,
    sticker_file_id: cards[card],
  }));

  try {
    await ctx.answerInlineQuery(results, { cache_time: 0, is_personal: true });
  } catch (error) {
    console.error("Inline Query Error:", error);
  }
});

bot.on("sticker", async (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions[chatId];

  // 1. Basic Checks
  if (!session || !session.gameStarted) return;

  const userId = ctx.from.id;
  const player = session.players.find((p) => p.id === userId);
  if (!player) return;

  const currentPlayer = session.players[session.currentPlayerIndex];
  if (currentPlayer.id !== userId) {
    return ctx.reply("⛔ It's not your turn!");
  }

  // 2. Identify the Sticker
  // We use the last 20 characters because Telegram changes the start of File IDs
  const incomingUniqueId = ctx.message.sticker.file_unique_id;

  const topDiscard = session.discardPile[session.discardPile.length - 1];

  // Find the card in the player's hand by comparing the ends of the File IDs
  //   const cardIndex = player.hand.findIndex(handCardKey => {
  //     const storedFileId = cards[handCardKey];
  //     return storedFileId.slice(-20) === incomingFileId.slice(-20);
  //   });
  const cardIndex = player.hand.findIndex((handCardKey) => {
    return uniqueIdCards[handCardKey] === incomingUniqueId;
  });

  // 3. Validation: Did they play a card they actually own?
  if (cardIndex === -1) {
    console.log(
      `Mismatch: User sent sticker ending in ${incomingFileId.slice(-10)}`,
    );
    return ctx.reply(
      "❌ That sticker isn't in your hand! Please use the 'See your cards' button.",
    );
  }

  const playedCardKey = player.hand[cardIndex]; // e.g., "diamonds_8"
  cards[playedCardKey] = ctx.message.sticker.file_id;
  const [playedSuit, playedValue] = playedCardKey.split("_");
  const topSuit = session.currentSuit || topDiscard.split("_")[0];
  const topValue = topDiscard.split("_")[1];

  // 4. Crazy 8s Rules: Match Suit, Match Value, or play an 8
  const isEight = playedValue === "8";
  const matchesSuit = playedSuit === topSuit;
  const matchesValue = playedValue === topValue;

  if (!isEight && !matchesSuit && !matchesValue) {
    return ctx.reply(
      `❌ Invalid move! You can't play ${playedCardKey.replace("_", " ")} on ${topDiscard.replace("_", " ")}.`,
    );
  }

  // 5. Processing the Move
  player.hand.splice(cardIndex, 1);
  if (isEight) {
    handleEightWild(session, ctx, player, playedCardKey);
    return; // Wait for suit selection
  } else {
    // session.discardPile.push(playedCardKey);
    session.currentSuit = playedSuit; // normal suit tracking
  }
  session.discardPile.push(playedCardKey);

  // 6. Win Condition
  if (player.hand.length === 0) {
    await ctx.reply(
      `🏆 <a href="tg://user?id=${player.id}">${player.name}</a> wins the game!`,
      { parse_mode: "HTML" },
    );
    delete sessions[chatId];
    return;
  }
  // When a game starts or new turn begins
  session.players.forEach((player) => (player.hasDrawnThisTurn = false));

  // 7. Turn Management
  session.currentPlayerIndex =
    (session.currentPlayerIndex + 1) % session.players.length;
  const nextPlayer = session.players[session.currentPlayerIndex];

  // Format mention for next player
  const mention = `<a href="tg://user?id=${nextPlayer.id}">${nextPlayer.name.replace(/[&<>]/g, "")}</a>`;

  await ctx.reply(
    `✅ ${player.name} played <b>${playedCardKey.replace("_", " ")}</b>.`,
    { parse_mode: "HTML" },
  );

  // Send the new top card
  //   await ctx.telegram.sendSticker(chatId, cards[playedCardKey]);

  // Prompt next player
  const keyboard = Markup.inlineKeyboard([
    Markup.button.switchToCurrentChat("🃏 See your cards", `${chatId}`),
  ]);

  await ctx.reply(
    `👉 ${mention}, it's your turn! \nuse /draw1card to draw card \nuse /skipturn8 to skip `,
    {
      parse_mode: "HTML",
      ...keyboard,
    },
  );
});
// When a game starts or new turn begins
// session.players.forEach(player => player.hasDrawnThisTurn = false);
bot.command("draw1card", (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions[chatId];
  if (!session || !session.gameStarted) return ctx.reply("❌ No active game.");

  const userId = ctx.from.id;
  const player = session.players.find((p) => p.id === userId);
  if (!player) return ctx.reply("❌ You are not in this game.");

  const currentPlayer = session.players[session.currentPlayerIndex];
  if (currentPlayer.id !== userId) return ctx.reply("⛔ It's not your turn! ");

  if (player.hasDrawnThisTurn) {
    return ctx.reply("⚠️ You have already drawn a card this turn!");
  }

  // Draw a random card from deck
  //
  // If deck is empty → reshuffle discard pile
  if (session.deck.length === 0) {
    if (session.discardPile.length <= 1) {
      return ctx.reply("⚠️ No cards left to draw.");
    }

    // Keep top card
    const topCard = session.discardPile.pop();

    // Move discard → deck
    session.deck = session.discardPile;

    // Shuffle deck
    for (let i = session.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [session.deck[i], session.deck[j]] = [session.deck[j], session.deck[i]];
    }

    // Reset discard pile with top card
    session.discardPile = [topCard];
  }

  // Draw card
  const drawnCard = session.deck.pop();
  player.hand.push(drawnCard);

  player.hasDrawnThisTurn = true;

  // ctx.reply(`🎴 You drew one card`);

  ctx.reply(`🎴 You drew one card`, { parse_mode: "HTML" });
});
bot.command("skipturn8", (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions[chatId];
  if (!session || !session.gameStarted) return ctx.reply("❌ No active game.");

  const userId = ctx.from.id;
  const player = session.players.find((p) => p.id === userId);
  if (!player) return ctx.reply("❌ You are not in this game.");

  const currentPlayer = session.players[session.currentPlayerIndex];
  if (currentPlayer.id !== userId) return ctx.reply("⛔ It's not your turn!");

  if (!player.hasDrawnThisTurn) {
    return ctx.reply("⚠️ You must draw a card before you can skip your turn.");
  }

  // Skip the turn
  nextTurn(session, ctx, null, player);
});
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data; // e.g., "choose_suit_hearts_123456"
  const chatId = ctx.chat.id;
  const session = sessions[chatId];
  if (!session) return;

  if (!data.startsWith("choose_suit_")) return;

  const parts = data.split("_");
  const chosenSuit = parts[2]; // hearts, diamonds, clubs, spades
  const playerId = parseInt(parts[3]);

  // Only the player who played the 8 can pick
  if (ctx.from.id !== playerId) {
    return ctx.answerCbQuery("⛔ This isn't your choice!", {
      show_alert: true,
    });
  }

  // Finalize the 8 play
  const pending = session.pendingEight;
  if (!pending || pending.playerId !== playerId) return;

  session.discardPile.push(pending.card);
  delete session.pendingEight;

  // Update the session top suit to the chosen one
  session.currentSuit = chosenSuit;

  await ctx.editMessageText(
    `🃏 ${ctx.from.first_name} chose ${chosenSuit.toUpperCase()} as the new suit!`,
    {
      parse_mode: "HTML",
    },
  );

  // Proceed to next turn
  const playerObj = session.players.find((p) => p.id === playerId);
  nextTurn(session, ctx, pending.card, playerObj);
});
bot.launch();
function nextTurn(session, ctx, playedCardName = null, playerWhoPlayed = null) {
  // Reset drawn flag for the player who just played or skipped
  if (playerWhoPlayed) playerWhoPlayed.hasDrawnThisTurn = false;

  // Move to next player
  session.currentPlayerIndex =
    (session.currentPlayerIndex + 1) % session.players.length;
  const nextPlayer = session.players[session.currentPlayerIndex];
  const mention = `<a href="tg://user?id=${nextPlayer.id}">${nextPlayer.name.replace(/[&<>]/g, "")}</a>`;

  // Notify group
  if (playedCardName && playerWhoPlayed) {
    ctx.reply(
      `✅ ${playerWhoPlayed.name} played <b>${playedCardName.replace("_", " ")}</b>.`,
      { parse_mode: "HTML" },
    );
  }

  // Prompt next player
  const keyboard = Markup.inlineKeyboard([
    Markup.button.switchToCurrentChat("🃏 See your cards", `${ctx.chat.id}`),
  ]);

  ctx.reply(
    `👉 ${mention}, it's your turn! \nuse /draw1card to draw card \nuse /skipturn8 to skip `,
    {
      parse_mode: "HTML",
      ...keyboard,
    },
  );
}
function handleEightWild(session, ctx, player, playedCardKey) {
  const chatId = ctx.chat.id;

  // Prompt the player to choose a suit
  const suits = ["hearts", "diamonds", "clubs", "spades"];
  const buttons = suits.map((suit) =>
    Markup.button.callback(
      suit.toUpperCase(),
      `choose_suit_${suit}_${player.id}`,
    ),
  );

  ctx.reply(
    `🃏 ${player.name} played an 8! Choose the suit for the next play:`,
    Markup.inlineKeyboard(buttons, { columns: 2 }),
  );

  // Temporarily store the played 8 in session to finalize after suit choice
  session.pendingEight = {
    playerId: player.id,
    card: playedCardKey,
  };
}
const port = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("Bot is running!");
    res.end();
  })
  .listen(port, () => {
    console.log(`Dummy server listening on port ${port}`);
  });
