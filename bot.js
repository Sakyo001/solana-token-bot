const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Add basic web server
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Initialize bot and channel ID
const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID || '@solanaallet'; // Default to channel username if ID not set

// Verify environment variables
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not found in environment variables');
    process.exit(1);
}

// Log channel configuration
console.log('Channel ID/Username:', CHANNEL_ID);

// Function to fetch Solana tokens using CoinGecko
async function getSolanaTokens() {
    try {
        // First request for page 1
        const response1 = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
            params: {
                vs_currency: 'usd',
                category: 'solana-ecosystem',
                order: 'id_desc',
                per_page: 250,
                page: 1,
                sparkline: false
            },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        // Add delay before second request
        await delay(1000);

        // Second request for page 2
        const response2 = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
            params: {
                vs_currency: 'usd',
                category: 'solana-ecosystem',
                order: 'id_desc',
                per_page: 250,
                page: 2,
                sparkline: false
            },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const allTokens = [...response1.data, ...response2.data];

        if (!allTokens || allTokens.length === 0) {
            throw new Error('No tokens found in response');
        }

        // Filter tokens from 2024
        const start2024 = new Date('2024-01-01').getTime();
        const validTokens = allTokens.filter(token => {
            // Get the token's creation date from various possible fields
            const dates = [
                token.genesis_date,
                token.created_at,
                token.first_data_at,
                token.last_updated,
                token.atl_date,
                token.ath_date
            ].filter(Boolean); // Remove null/undefined values

            // If no dates available, check if the token ID contains a timestamp
            if (dates.length === 0) {
                return true; // Include tokens without dates for now
            }

            // Get the earliest date
            const tokenDate = new Date(Math.min(...dates.map(date => new Date(date).getTime()))).getTime();
            return tokenDate >= start2024;
        });

        return validTokens;
    } catch (error) {
        console.error('Error in getSolanaTokens:', error.message);
        return null;
    }
}

// Add search function
async function searchSolanaTokens(searchTerm) {
    try {
        // First try searching in all cryptocurrencies
        const searchResponse = await axios.get(`https://api.coingecko.com/api/v3/search`, {
            params: {
                query: searchTerm
            },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (!searchResponse.data?.coins) {
            throw new Error('No search results available');
        }

        // Get detailed information for found coins
        const foundCoins = searchResponse.data.coins;
        const detailedTokens = [];

        for (const coin of foundCoins.slice(0, 5)) { // Get details for top 5 matches
            try {
                const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coin.id}`, {
                    params: {
                        localization: false,
                        tickers: true,
                        market_data: true,
                        community_data: false,
                        developer_data: false
                    },
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });
                
                if (response.data) {
                    detailedTokens.push(response.data);
                }
                await delay(1000); // Respect rate limit
            } catch (error) {
                console.error(`Error fetching details for ${coin.id}:`, error.message);
            }
        }

        return detailedTokens;
    } catch (error) {
        console.error('Error searching tokens:', error.message);
        return null;
    }
}

// Add delay utility function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const userCooldowns = new Map();
const COOLDOWN_PERIOD = 30000; // 30 seconds

// Define the welcome message as a function to ensure it's always available
function getWelcomeMessage(firstName) {
    return `*✨ Welcome to Solana Token Explorer! ✨*\n\n` +
        `Hello ${firstName}! 🎉\n\n` +
        `I'm your personal Solana token assistant. I help you track and discover tokens on the Solana blockchain in real-time!\n\n` +
        `*🚀 Available Commands:*\n` +
        `• /start - Display this welcome message\n` +
        `• /latest - View Solana tokens (oldest to latest)\n` +
        `• /search <term> - Search for specific tokens\n` +
        `• /help - Get detailed help\n\n` +
        `*💫 What I can show you:*\n` +
        `• Token logos & images\n` +
        `• Real-time prices & charts\n` +
        `• Market statistics & volume\n` +
        `• Token information & details\n` +
        `• Project descriptions & updates\n` +
        `• Contract addresses & deployers\n` +
        `• Social media links\n\n` +
        `*🌐 Useful Links:*\n` +
        `• [Solana Explorer](https://explorer.solana.com)\n` +
        `• [Solana Website](https://solana.com)\n` +
        `• [CoinGecko](https://www.coingecko.com)\n\n` +
        `*📱 Join Our Community:*\n` +
        `• Telegram Channel: @SolanaUpdates\n` +
        `• Telegram Group: @SolanaCommunity\n` +
        `• Twitter: @SolanaNews\n\n` +
        `*💎 Trading Tips:*\n` +
        `• Always DYOR (Do Your Own Research)\n` +
        `• Check token liquidity\n` +
        `• Verify contract addresses\n` +
        `• Monitor market trends\n` +
        `• Start with small investments\n\n` +
        `*⚠️ Security Tips:*\n` +
        `• Verify token contracts\n` +
        `• Use trusted wallets\n` +
        `• Be aware of scams\n` +
        `• Never share private keys\n\n` +
        `Ready to explore Solana tokens? Click the buttons below! 🌟`;
}

// Create keyboard buttons
const getKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🔍 Explore Tokens', 'latest'),
            Markup.button.callback('❓ Help', 'help')
        ],
        [
            Markup.button.url('📊 Solana Explorer', 'https://explorer.solana.com'),
            Markup.button.url('🌐 Website', 'https://solana.com')
        ],
        [
            Markup.button.url('📢 Channel', 't.me/SolanaUpdates'),
            Markup.button.url('👥 Community', 't.me/SolanaCommunity')
        ]
    ]);
};

// Add channel initialization command
bot.command('initchannel', async (ctx) => {
    try {
        const welcomeMessage = 
            `*🚀 Welcome to Solana Token Updates! 🚀*\n\n` +
            `This channel provides real-time updates for:\n` +
            `• TRUMP Token 🎯\n` +
            `• AI Token 🤖\n` +
            `• VODKA Token 🍸\n\n` +
            `*📊 Updates Include:*\n` +
            `• Current Price\n` +
            `• Market Cap\n` +
            `• Liquidity\n` +
            `• 24h Volume\n` +
            `• Price Changes\n` +
            `• ATH Information\n\n` +
            `*⏰ Update Schedule:*\n` +
            `• Automatic updates every 5 minutes\n` +
            `• Manual updates via /check command\n\n` +
            `*🔗 Useful Links:*\n` +
            `• [Solana Explorer](https://explorer.solana.com)\n` +
            `• [CoinGecko](https://www.coingecko.com)\n\n` +
            `Stay tuned for regular updates! 📈`;

        await bot.telegram.sendMessage(CHANNEL_ID, welcomeMessage, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });

        // If command was sent from outside the channel, confirm it worked
        if (ctx.chat.id !== parseInt(CHANNEL_ID)) {
            await ctx.reply("Channel initialized successfully! Check the channel for the welcome message.");
        }
    } catch (error) {
        console.error('Error initializing channel:', error);
        await ctx.reply("Error initializing channel. Make sure the bot is an admin and try again.");
    }
});

// Welcome message handler
bot.command('start', async (ctx) => {
    try {
        const welcomeMessage = 
            `*🚀 Welcome to Solana Token Bot! 🚀*\n\n` +
            `I can help you track and discover Solana tokens.\n\n` +
            `*📚 Available Commands:*\n\n` +
            `• /start - Show this welcome message\n` +
            `   Example: /check vodka\n\n` +
            `• /filter <category> - Find tokens by category:\n` +
            `   - micro-caps (0-48h, FDV $100k+)\n` +
            `   - old-micro-caps (0-72h, FDV $100k+)\n` +
            `   - low-caps (FDV $500k+)\n` +
            `   - old-low-caps (FDV $250k-$1M)\n` +
            `   - mid-caps (FDV $1M+)\n` +
            `   Example: /filter micro-caps\n\n` +
            `• /search <term> - Search for specific tokens\n` +
            `   Example: /search vodka\n\n` +
            `• /latest - View latest Solana tokens\n` +
            `• /help - Show detailed help message\n\n` +
            `*🔍 Token Discovery Features:*\n` +
            `• Real-time price updates\n` +
            `• Market cap & volume tracking\n` +
            `• Liquidity monitoring\n` +
            `• Transaction analysis\n` +
            `• Multiple DEX support\n\n` +
            `*💡 Pro Tips:*\n` +
            `• Use /filter to find promising tokens\n` +
            `• Check liquidity before trading\n` +
            `• Monitor transaction volume\n` +
            `• DYOR - Always research before investing\n\n` +
            `*🔔 Updates:*\n` +
            `• Auto-monitoring every 4 minutes\n` +
            `• Instant price alerts\n` +
            `• New token notifications\n\n` +
            `Start exploring with any command! 🚀`;

        await ctx.replyWithMarkdown(welcomeMessage, { disable_web_page_preview: true });

        // Send monitored tokens status
        await ctx.reply('📊 Fetching current status of monitored tokens...');
        
        // Send startup notification with monitored tokens list
        await bot.telegram.sendMessage(
            CHANNEL_ID,
            `🔄 *Token Monitor Update*\n\n` +
            `Monitoring:\n` +
            `• TRUMP Token 🎯\n` +
            `• VODKA Token 🍸\n` +
            `• AI Token 🤖\n\n` +
            `Fetching latest data...`,
            {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }
        );

        // Send current token alerts
        await sendTokenAlerts();

    } catch (error) {
        console.error('Error in start command:', error);
        await ctx.reply('❌ Error showing welcome message. Please try again.');
    }
});

// Function to fetch tokens from multiple sources
async function fetchTokensFromMultipleSources() {
    try {
        const tokens = [];
        
        // DexScreener API - Multiple search strategies
        try {
            // 1. Direct search queries with more specific terms
            const searchQueries = [
                'https://api.dexscreener.com/latest/dex/search?q=solana', // General Solana tokens
                'https://api.dexscreener.com/latest/dex/search?q=raydium', // Raydium DEX
                'https://api.dexscreener.com/latest/dex/search?q=orca', // Orca DEX
                'https://api.dexscreener.com/latest/dex/search?q=jupiter', // Jupiter DEX
                'https://api.dexscreener.com/latest/dex/search?q=serum', // Serum DEX
                'https://api.dexscreener.com/latest/dex/search?q=sol-usdc', // SOL-USDC pair
                'https://api.dexscreener.com/latest/dex/search?q=sol-usdt', // SOL-USDT pair
                'https://api.dexscreener.com/latest/dex/search?q=bonk', // BONK token (Solana meme coin)
                'https://api.dexscreener.com/latest/dex/search?q=cope', // COPE token
                'https://api.dexscreener.com/latest/dex/search?q=srm', // Serum token
                'https://api.dexscreener.com/latest/dex/search?q=ftt', // FTX token on Solana
                'https://api.dexscreener.com/latest/dex/search?q=stepn', // Move-to-earn token
                'https://api.dexscreener.com/latest/dex/search?q=port', // Port Finance token
                'https://api.dexscreener.com/latest/dex/search?q=slim', // Solanium token
                'https://api.dexscreener.com/latest/dex/search?q=helio', // Helio Protocol token
                'https://api.dexscreener.com/latest/dex/tokens/solana'
            ];

            for (const query of searchQueries) {
                console.log(`Fetching from: ${query}`);
                const response = await axios.get(query, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });

                if (response.data?.pairs) {
                    const solanaPairs = response.data.pairs.filter(pair => 
                        pair.chainId === 'solana' &&
                        pair.baseToken &&
                        pair.baseToken.address
                    );
                    tokens.push(...solanaPairs);
                    console.log(`Found ${solanaPairs.length} pairs from query: ${query}`);
                }
                await delay(300); // Rate limit compliance
            }

            // 2. Fetch specific token addresses
            const specificTokens = [
                'https://api.dexscreener.com/latest/dex/tokens/solana/8bD6eoT4QoVjArBbR4eHfkUvUxvLxM1hbl9z1mRYbhEu', // TRUMP
                // Add more specific token addresses here
            ];

            for (const tokenUrl of specificTokens) {
                const response = await axios.get(tokenUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });

                if (response.data?.pairs) {
                    tokens.push(...response.data.pairs);
                }
                await delay(300);
            }

            // 3. Fetch by DEX IDs
            const dexIds = ['raydium', 'orca', 'jupiter'];
            for (const dexId of dexIds) {
                const response = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/solana/${dexId}`, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });

                if (response.data?.pairs) {
                    tokens.push(...response.data.pairs);
                    console.log(`Found ${response.data.pairs.length} pairs from DEX: ${dexId}`);
                }
                await delay(300);
            }
            
            console.log('Total pairs fetched before deduplication:', tokens.length);
        } catch (error) {
            console.error('DexScreener API error:', error.message);
        }

        // Remove duplicates based on pair address and base token address
        const uniqueTokens = Array.from(new Map(
            tokens.map(token => [
                `${token.pairAddress}-${token.baseToken.address}`,
                token
            ])
        ).values());

        console.log('Unique pairs after deduplication:', uniqueTokens.length);
        return uniqueTokens;
    } catch (error) {
        console.error('Error fetching tokens:', error);
        return [];
    }
}

// Normalize token data
function normalizeTokenData(token) {
    try {
        if (token.source === 'dexscreener') {
            return {
                name: token.baseToken.name,
                symbol: token.baseToken.symbol,
                address: token.baseToken.address,
                price: token.priceUsd,
                priceChange24h: token.priceChange?.h24 || '0',
                liquidity: token.liquidity?.usd || '0',
                volume24h: token.volume?.h24 || '0',
                txns24h: token.txns?.h24 || '0',
                createdAt: token.pairCreatedAt,
                dex: token.dexId,
                fdv: token.fdv,
                pairAddress: token.pairAddress
            };
        }
        return null;
    } catch (error) {
        console.error('Error normalizing token data:', error);
        return null;
    }
}

// Add the command handler for '/latest'
bot.command('latest', async (ctx) => {
    try {
        console.log('Latest command received');
        
        // Check cooldown
        const userId = ctx.from.id;
        const lastUsed = userCooldowns.get(userId);
        const now = Date.now();
        
        if (lastUsed && (now - lastUsed) < COOLDOWN_PERIOD) {
            const remainingTime = Math.ceil((COOLDOWN_PERIOD - (now - lastUsed)) / 1000);
            await ctx.reply(`⏳ Please wait ${remainingTime} seconds before requesting again.`);
            return;
        }
        
        userCooldowns.set(userId, now);
        
        const statusMessage = await ctx.reply("🔍 Fetching all Solana tokens from the last week...");
        
        // Fetch all tokens
        const allTokens = await fetchTokensFromMultipleSources();
        console.log(`Total tokens fetched: ${allTokens.length}`);
        
        // Filter for tokens from the last week, but include specific tokens regardless of age
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const recentTokens = allTokens.filter(token => {
            // Always include TRUMP token
            if (token.baseToken.address === '8bD6eoT4QoVjArBbR4eHfkUvUxvLxM1hbl9z1mRYbhEu') {
                return true;
            }
            
            // Include tokens from last week
            const creationDate = new Date(token.pairCreatedAt);
            return creationDate > oneWeekAgo;
        });

        console.log(`Tokens from last week: ${recentTokens.length}`);

        if (recentTokens.length === 0) {
            await ctx.reply("⚠️ No tokens found from the last week. Please try again later.");
            return;
        }

        // Sort by creation date (newest first)
        const sortedTokens = recentTokens.sort((a, b) => 
            new Date(b.pairCreatedAt) - new Date(a.pairCreatedAt)
        );

        await ctx.reply(`📊 Found ${sortedTokens.length} Solana tokens from the last week. Displaying all tokens, newest first...`);

        // Process all tokens in batches
        const BATCH_SIZE = 10;
        for (let i = 0; i < sortedTokens.length; i += BATCH_SIZE) {
            const batch = sortedTokens.slice(i, i + BATCH_SIZE);
            
            await ctx.reply(`Processing tokens ${i + 1} to ${Math.min(i + BATCH_SIZE, sortedTokens.length)} of ${sortedTokens.length}...`);
            
            for (const pair of batch) {
                await displayTokenWithIcon(ctx, pair);
            }
        }

        await ctx.reply(
            `✅ All ${sortedTokens.length} Solana tokens have been displayed.\n\n` +
            "⚠️ Warning: Many tokens may have low volume and be risky!\n" +
            "🔍 Always research before investing.\n" +
            "🔄 Use /latest to refresh the list."
        );

    } catch (error) {
        console.error('Error in latest command:', error);
        await ctx.reply(`❌ Error: ${error.message}\nPlease try again later.`);
    }
});

// Register search command
bot.command('search', async (ctx) => {
    try {
        const searchTerm = ctx.message.text.split('/search ')[1]?.toLowerCase();
        
        if (!searchTerm) {
            await ctx.reply("ℹ️ Please specify a search term. Example: /search trump");
            return;
        }

        const statusMsg = await ctx.reply(`🔍 Searching for tokens matching "${searchTerm}"...`);
        
        // Fetch tokens using multiple search methods
        let tokens = [];
        const processedAddresses = new Set(); // Track processed addresses
        
        // 1. Direct DexScreener search
        try {
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/search`, {
                params: { q: searchTerm },
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            if (response.data?.pairs) {
                const solanaPairs = response.data.pairs.filter(pair => 
                    pair.chainId === 'solana' &&
                    pair.baseToken &&
                    pair.baseToken.address &&
                    !processedAddresses.has(pair.baseToken.address)
                );

                for (const pair of solanaPairs) {
                    processedAddresses.add(pair.baseToken.address);
                    tokens.push(pair);
                }
            }
        } catch (error) {
            console.error('DexScreener search error:', error.message);
        }

        // 2. Specific token search if it's a known token
        const knownTokens = {
            'trump': '8bD6eoT4QoVjArBbR4eHfkUvUxvLxM1hbl9z1mRYbhEu',
            // Add more known tokens here
        };

        if (knownTokens[searchTerm] && !processedAddresses.has(knownTokens[searchTerm])) {
            try {
                const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/solana/${knownTokens[searchTerm]}`);
                if (response.data?.pairs?.[0]) {
                    tokens.push(response.data.pairs[0]);
                    processedAddresses.add(knownTokens[searchTerm]);
                }
            } catch (error) {
                console.error('Known token search error:', error.message);
            }
        }

        // Remove any remaining duplicates and sort by liquidity
        tokens = tokens.filter((token, index, self) =>
            index === self.findIndex((t) => t.baseToken.address === token.baseToken.address)
        ).sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0));

        if (tokens.length === 0) {
            await ctx.reply("❌ No matching tokens found.");
            return;
        }

        await ctx.reply(`Found ${tokens.length} matching tokens. Displaying results...`);

        // Display tokens
        for (let i = 0; i < tokens.length; i++) {
            await displayTokenWithIcon(ctx, tokens[i], i, tokens.length);
        }

        await ctx.reply(
            `✅ Displayed all ${tokens.length} matching tokens.\n\n` +
            "🔍 Try another search with /search <term>\n" +
            "⚠️ Always DYOR before investing!"
        );

    } catch (error) {
        console.error('Error in search command:', error);
        await ctx.reply("❌ Error searching tokens. Please try again later.");
    }
});

// Register help command
bot.command('help', async (ctx) => {
    try {
        const helpMessage = 
            `*📚 Available Commands:*\n\n` +
            `• /start - Show welcome message\n` +
            `• /latest - View latest Solana tokens\n` +
            `• /search <term> - Search for specific tokens\n` +
            `• /help - Show this help message\n\n` +
            `*💡 Tips:*\n` +
            `• Use /search followed by token name or symbol\n` +
            `• Example: /search bonk\n` +
            `• Latest shows newest tokens first\n` +
            `• Search shows most popular matches`;

        await ctx.replyWithMarkdown(helpMessage);
    } catch (error) {
        console.error('Error in help command:', error);
        await ctx.reply("❌ Error showing help. Please try again later.");
    }
});

// Add Solana token addresses
const TOKEN_ADDRESSES = {
    'VODKA': '5iTrKEyVWiQNoUFfwNZeFCYEwPDgrXCzke9Nz1Dk6g9K',
    // Add other token addresses as needed
};

// Function to search tokens by address
async function searchTokenByAddress(tokenName) {
    try {
        const address = TOKEN_ADDRESSES[tokenName.toUpperCase()];
        if (!address) {
            throw new Error(`No address found for ${tokenName.toUpperCase()}`);
        }

        // Use DexScreener API to get token data
        const dexscreenerResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (dexscreenerResponse.data?.pairs?.[0]) {
            const tokenData = dexscreenerResponse.data.pairs[0];
            return {
                name: tokenData.baseToken.name,
                symbol: tokenData.baseToken.symbol,
                address: address,
                price: tokenData.priceUsd,
                volume24h: tokenData.volume.h24,
                liquidity: tokenData.liquidity.usd,
                priceChange24h: tokenData.priceChange.h24,
                platform: 'Solana',
                pairAddress: tokenData.pairAddress,
                dexId: tokenData.dexId
            };
        }

        throw new Error(`No data found for ${tokenName.toUpperCase()}`);
    } catch (error) {
        console.error('Error searching token by address:', error.message);
        return null;
    }
}

// Update the check command to use DexScreener data
bot.command('check', async (ctx) => {
    try {
        const tokenName = ctx.message.text.split('/check ')[1]?.toLowerCase();
        
        if (!tokenName) {
            await ctx.reply("ℹ️ Please specify a token. Example: /check vodka");
            return;
        }

        await ctx.reply(`🔍 Searching for ${tokenName.toUpperCase()} token...`);

        const token = await searchTokenByAddress(tokenName);

        if (!token) {
            await ctx.reply(`❌ Could not find data for ${tokenName.toUpperCase()}`);
            return;
        }

        // Display token information with DexScreener data
        const message = 
            `*${token.name} (${token.symbol})*\n\n` +
            `🔗 Address: \`${token.address}\`\n` +
            `💰 Price: $${Number(token.price).toFixed(8)}\n` +
            `📊 24h Change: ${token.priceChange24h}%\n` +
            `📈 24h Volume: $${Number(token.volume24h).toLocaleString()}\n` +
            `💧 Liquidity: $${Number(token.liquidity).toLocaleString()}\n` +
            `⛓ Platform: ${token.platform}\n` +
            `🏦 DEX: ${token.dexId.toUpperCase()}\n\n` +
            `Links:\n` +
            `• [DexScreener](https://dexscreener.com/solana/${token.address})\n` +
            `• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${token.address})\n` +
            `• [Solscan](https://solscan.io/token/${token.address})\n` +
            `• [Birdeye](https://birdeye.so/token/${token.address})`;

        await ctx.replyWithMarkdown(message);

    } catch (error) {
        console.error('Error in check command:', error);
        await ctx.reply(`❌ Error: ${error.message}\nPlease try again later or contact support.`);
    }
});

// Add token addresses for monitoring with pair addresses
const MONITORED_TOKENS = {
    'TRUMP': {
        address: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
        pairAddress: 'hkujrp5tyqlbeudjkwjgnhs2957qkjr2iwhjkttma1xs'
    },
    'VODKA': {
        address: '5iTrKEyVWiQNoUFfwNZeFCYEwPDgrXCzke9Nz1Dk6g9K',
        pairAddress: '5un4gxop85lvucccx1pfuqrmxl7xasvqeflvayygmj57'
    },
    'AI': {
        address: '99ouK5YUK3JPGCPX9joNtHsMU7NPpU7w91JN4kdQ97po',
        pairAddress: 'xdeemwjk6wrojcjkgvxapwgaz3jbbmcsaw1nvt6xsek'
    }
};

// Function to fetch token data with better headers
async function fetchTokenData(address) {
    const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://dexscreener.com',
        'Referer': 'https://dexscreener.com/',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty'
    };

    try {
        const response = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/solana/${address}`,
            {
                headers,
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error(`Error fetching token data: ${error.message}`);
        return null;
    }
}

// Function to fetch and send token alerts with better error handling
async function sendTokenAlerts() {
    try {
        for (const [tokenName, tokenInfo] of Object.entries(MONITORED_TOKENS)) {
            try {
                console.log(`Fetching data for ${tokenName}...`);
                
                const data = await fetchTokenData(tokenInfo.address);
                
                if (data?.pairs?.[0]) {
                    const pair = data.pairs[0];
                    
                    const alertMessage = 
                        `🔔 *${tokenName} Token Update*\n\n` +
                        `💰 Price: $${Number(pair.priceUsd).toFixed(8)}\n` +
                        `📊 24h Change: ${pair.priceChange?.h24 || '0'}%\n` +
                        `💎 FDV: $${Number(pair.fdv || 0).toLocaleString()}\n` +
                        `💧 Liquidity: $${Number(pair.liquidity?.usd || 0).toLocaleString()}\n` +
                        `📈 24h Volume: $${Number(pair.volume?.h24 || 0).toLocaleString()}\n` +
                        `🔄 24h Txns: ${pair.txns?.h24 || '0'}\n` +
                        `🏦 DEX: ${pair.dexId}\n\n` +
                        `Links:\n` +
                        `• [DexScreener](https://dexscreener.com/solana/${pair.pairAddress})\n` +
                        `• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${tokenInfo.address})\n` +
                        `• [Birdeye](https://birdeye.so/token/${tokenInfo.address})\n\n` +
                        `⚠️ DYOR! Check token safety before trading!`;

                    await bot.telegram.sendMessage(CHANNEL_ID, alertMessage, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });

                    // Add longer delay between tokens
                    await delay(5000);
                } else {
                    console.error(`No valid pair data found for ${tokenName}`);
                }
            } catch (error) {
                console.error(`Error processing ${tokenName}:`, error.message);
            }
            // Add delay between tokens even if there's an error
            await delay(5000);
        }
    } catch (error) {
        console.error('Error in sendTokenAlerts:', error);
    }
}

// Function to send initial welcome and token status
async function sendStartupNotification() {
    try {
        // Send startup message
        await bot.telegram.sendMessage(
            CHANNEL_ID,
            `🚀 *Bot Started Successfully!*\n\n` +
            `Monitoring:\n` +
            `• TRUMP Token 🎯\n` +
            `• VODKA Token 🍸\n` +
            `• AI Token 🤖\n\n` +
            `Updates every 4 hours 🕒`,
            {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }
        );

        // Immediately send first token updates
        await sendTokenAlerts();

    } catch (error) {
        console.error('Error in startup notification:', error);
    }
}

// Update the startBot function
const startBot = async () => {
    try {
        await bot.launch();
        console.log('Bot is running...');
        
        // Send startup notification and initial token status
        await sendStartupNotification();
        
        // Start the 4-hour interval alerts
        setInterval(sendTokenAlerts, 4 * 60 * 60 * 1000);
        
        console.log('Token alert system started - 4-hour intervals');
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
};

// Replace the existing bot.launch() with startBot()
startBot();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Add this command to get channel ID
bot.command('channelid', async (ctx) => {
    try {
        // Forward a message to the channel
        const msg = await bot.telegram.sendMessage('@solanaallet', 'Getting channel ID...');
        // Get the channel ID from the message
        const channelId = msg.chat.id;
        // Send the channel ID to the user
        await ctx.reply(`Channel ID: ${channelId}\n\nAdd this to your .env file as:\nCHANNEL_ID=${channelId}`);
        // Delete the test message from the channel
        await bot.telegram.deleteMessage(msg.chat.id, msg.message_id);
    } catch (error) {
        console.error('Error getting channel ID:', error);
        await ctx.reply("Error: Make sure the bot is an admin in the channel and the channel name is correct");
    }
});

// Add this function to help debug channel issues
bot.command('testchannel', async (ctx) => {
    try {
        const testMessage = "🔄 Testing channel connection...";
        await bot.telegram.sendMessage(CHANNEL_ID, testMessage);
        await ctx.reply("✅ Channel test successful! Check the channel for test message.");
    } catch (error) {
        console.error('Channel test error:', error);
        await ctx.reply(`❌ Channel test failed. Error: ${error.message}\n\nCurrent Channel ID: ${CHANNEL_ID}`);
    }
});

// Add test command to verify token fetching
bot.command('testalert', async (ctx) => {
    try {
        await ctx.reply("🔍 Testing alert system...");
        await sendTokenAlerts();
        await ctx.reply("✅ Alert test completed. Check the channel for messages.");
    } catch (error) {
        console.error('Alert test error:', error);
        await ctx.reply("❌ Alert test failed: " + error.message);
    }
});

// Define DexScreener filter criteria
const DEX_FILTERS = {
    'micro-caps': {
        name: 'Micro-caps 🔍',
        criteria: {
            minFDV: 100000,        // $100,000
            minLiquidity: 10000,   // $10,000
            maxAge: 48,            // 0-48 hours
            min1hTxns: 50          // 50 transactions
        }
    },
    'old-micro-caps': {
        name: 'Old Micro-caps 📊',
        criteria: {
            minFDV: 100000,        // $100,000
            minLiquidity: 15000,   // $15,000
            maxAge: 72,            // 0-72 hours
            min1hTxns: 120         // 120 transactions
        }
    },
    'low-caps': {
        name: 'Low-caps 💎',
        criteria: {
            minFDV: 500000,        // $500,000
            minLiquidity: 75000,   // $75,000
            min24hVolume: 1000000, // $1M+
            min24hTxns: 50         // 50 transactions
        }
    },
    'old-low-caps': {
        name: 'Old Low-caps 💰',
        criteria: {
            minFDV: 250000,        // $250,000
            maxFDV: 1000000,       // $1,000,000
            minLiquidity: 100000,  // $100,000
            min24hVolume: 250000,  // $250,000
            min24hTxns: 1000       // 1000 transactions
        }
    },
    'mid-caps': {
        name: 'Mid-caps 🚀',
        criteria: {
            minFDV: 1000000,       // $1M
            minLiquidity: 150000,  // $150,000
            min24hVolume: 500000   // $500,000
        }
    }
};

// Function to check if token meets criteria
function tokenMeetsCriteria(token, criteria) {
    const tokenAge = (Date.now() - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60); // hours
    const fdv = Number(token.fdv);
    const liquidity = Number(token.liquidity?.usd || 0);
    const volume24h = Number(token.volume?.h24 || 0);
    const txns24h = Number(token.txns?.h24 || 0);
    const txns1h = Number(token.txns?.h1 || 0);

    if (criteria.minFDV && fdv < criteria.minFDV) return false;
    if (criteria.maxFDV && fdv > criteria.maxFDV) return false;
    if (criteria.minLiquidity && liquidity < criteria.minLiquidity) return false;
    if (criteria.maxAge && tokenAge > criteria.maxAge) return false;
    if (criteria.min24hVolume && volume24h < criteria.min24hVolume) return false;
    if (criteria.min24hTxns && txns24h < criteria.min24hTxns) return false;
    if (criteria.min1hTxns && txns1h < criteria.min1hTxns) return false;

    return true;
}

// Add filter command
bot.command('filter', async (ctx) => {
    try {
        const filterType = ctx.message.text.split('/filter ')[1]?.toLowerCase();
        
        if (!filterType) {
            const helpMessage = 
                "*🔍 Token Filter Categories:*\n\n" +
                "*📊 Market Cap Filters:*\n" +
                "• `micro-caps` - New tokens (0-48h)\n" +
                "  - FDV: $100k-$500k\n" +
                "  - Min liquidity: $10k\n\n" +
                "• `old-micro-caps` - Older tokens (48-72h)\n" +
                "  - FDV: $100k-$500k\n" +
                "  - Min liquidity: $10k\n\n" +
                "• `low-caps` - Established tokens\n" +
                "  - FDV: $500k-$1M\n" +
                "  - Min liquidity: $25k\n\n" +
                "• `old-low-caps` - Mature tokens\n" +
                "  - FDV: $250k-$1M\n" +
                "  - Age: >72h\n" +
                "  - Min liquidity: $15k\n\n" +
                "• `mid-caps` - Large tokens\n" +
                "  - FDV: >$1M\n" +
                "  - Min liquidity: $50k\n\n" +
                "*📈 Volume Filters:*\n" +
                "• `high-volume` - Active trading\n" +
                "  - 24h volume >$100k\n" +
                "  - Min transactions: 100\n\n" +
                "• `trending` - Growing tokens\n" +
                "  - Positive price change\n" +
                "  - Increasing volume\n\n" +
                "*⚡ Quick Filters:*\n" +
                "• `new` - Listed in last 24h\n" +
                "• `hot` - High activity now\n" +
                "• `gainers` - Best performers\n" +
                "• `verified` - Official tokens\n\n" +
                "*Usage Examples:*\n" +
                "• `/filter micro-caps`\n" +
                "• `/filter trending`\n" +
                "• `/filter new`\n\n" +
                "⚠️ *Always DYOR and check:*\n" +
                "• Token contract\n" +
                "• Liquidity locks\n" +
                "• Team information\n" +
                "• Trading volume\n" +
                "• Holder distribution";

            await ctx.replyWithMarkdown(helpMessage);
            return;
        }

        const statusMsg = await ctx.reply(`🔍 Filtering tokens by ${filterType}...`);
        
        // Fetch all tokens
        const allTokens = await fetchTokensFromMultipleSources();
        let filteredTokens = [];
        const now = Date.now();

        // Apply filters based on type
        switch (filterType) {
            case 'micro-caps':
                filteredTokens = allTokens.filter(token => {
                    const age = (now - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60);
                    const fdv = Number(token.fdv) || 0;
                    const liquidity = Number(token.liquidity?.usd) || 0;
                    return age <= 48 && fdv >= 100000 && fdv < 500000 && liquidity >= 10000;
                });
                break;

            case 'old-micro-caps':
                filteredTokens = allTokens.filter(token => {
                    const age = (now - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60);
                    const fdv = Number(token.fdv) || 0;
                    const liquidity = Number(token.liquidity?.usd) || 0;
                    return age <= 72 && age > 48 && fdv >= 100000 && fdv < 500000 && liquidity >= 10000;
                });
                break;

            case 'low-caps':
                filteredTokens = allTokens.filter(token => {
                    const fdv = Number(token.fdv) || 0;
                    const liquidity = Number(token.liquidity?.usd) || 0;
                    return fdv >= 500000 && fdv < 1000000 && liquidity >= 25000;
                });
                break;

            case 'old-low-caps':
                filteredTokens = allTokens.filter(token => {
                    const age = (now - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60);
                    const fdv = Number(token.fdv) || 0;
                    const liquidity = Number(token.liquidity?.usd) || 0;
                    return age > 72 && fdv >= 250000 && fdv < 1000000 && liquidity >= 15000;
                });
                break;

            case 'mid-caps':
                filteredTokens = allTokens.filter(token => {
                    const fdv = Number(token.fdv) || 0;
                    const liquidity = Number(token.liquidity?.usd) || 0;
                    return fdv >= 1000000 && liquidity >= 50000;
                });
                break;

            case 'high-volume':
                filteredTokens = allTokens.filter(token => {
                    const volume = Number(token.volume?.h24) || 0;
                    const txns = Number(token.txns?.h24) || 0;
                    return volume >= 100000 && txns >= 100;
                });
                break;

            case 'trending':
                filteredTokens = allTokens.filter(token => {
                    const priceChange = Number(token.priceChange?.h24) || 0;
                    const volume = Number(token.volume?.h24) || 0;
                    return priceChange > 0 && volume > 50000;
                });
                break;

            case 'new':
                filteredTokens = allTokens.filter(token => {
                    const age = (now - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60);
                    return age <= 24;
                });
                break;

            case 'hot':
                filteredTokens = allTokens.filter(token => {
                    const volume = Number(token.volume?.h24) || 0;
                    const txns = Number(token.txns?.h24) || 0;
                    const priceChange = Number(token.priceChange?.h24) || 0;
                    return volume > 75000 && txns > 50 && priceChange > 0;
                });
                break;

            case 'gainers':
                filteredTokens = allTokens.filter(token => {
                    const priceChange = Number(token.priceChange?.h24) || 0;
                    return priceChange > 10;
                });
                break;

            case 'verified':
                const verifiedTokens = [];
                // ... (keep existing verification logic) ...
                
                // Display tokens with progress information
                for (let i = 0; i < filteredTokens.length; i++) {
                    await displayTokenWithIcon(ctx, filteredTokens[i], i, filteredTokens.length);
                }
                break;

            default:
                await ctx.reply("❌ Invalid filter category. Use /filter for available options.");
                return;
        }

        // Sort tokens by creation date (newest first)
        filteredTokens.sort((a, b) => new Date(b.pairCreatedAt) - new Date(a.pairCreatedAt));

        if (filteredTokens.length === 0) {
            await ctx.reply(`No tokens found matching the ${filterType} criteria.`);
            return;
        }

        await ctx.reply(`Found ${filteredTokens.length} tokens matching ${filterType} criteria. Displaying results...`);

        // Check and display tokens with icons
        for (const pair of filteredTokens) {
            await displayTokenWithIcon(ctx, pair);
        }

        await ctx.reply(
            `✅ Displayed all ${filteredTokens.length} ${filterType} tokens.\n\n` +
            "🔍 Try another filter with /filter <category>\n" +
            "⚠️ Always DYOR before investing!"
        );

    } catch (error) {
        console.error('Error in filter command:', error);
        await ctx.reply("❌ Error filtering tokens. Please try again later.");
    }
});

// Add helper function for displaying tokens with icons
async function displayTokenWithIcon(ctx, pair, currentIndex, totalTokens) {
    try {
        const now = Date.now();
        const timeAgo = Math.floor((now - new Date(pair.pairCreatedAt).getTime()) / (1000 * 60 * 60));
        const timeAgoText = timeAgo < 24 
            ? `${timeAgo} hours ago`
            : `${Math.floor(timeAgo / 24)} days ${timeAgo % 24} hours ago`;

        const caption = 
            `*${pair.baseToken.name} (${pair.baseToken.symbol})*\n\n` +
            `🔗 Address: \`${pair.baseToken.address}\`\n` +
            `💰 Price: $${Number(pair.priceUsd).toFixed(8)}\n` +
            `📊 24h Change: ${pair.priceChange?.h24 || '0'}%\n` +
            `💎 FDV: $${Number(pair.fdv || 0).toLocaleString()}\n` +
            `💧 Liquidity: $${Number(pair.liquidity?.usd || 0).toLocaleString()}\n` +
            `📈 24h Volume: $${Number(pair.volume?.h24 || 0).toLocaleString()}\n` +
            `🔄 24h Txns: ${pair.txns?.h24 || '0'}\n` +
            `⏰ Created: ${timeAgoText}\n` +
            `🏦 DEX: ${pair.dexId}\n` +
            `🔄 Pair: ${pair.baseToken.symbol}/${pair.quoteToken?.symbol || 'SOL'}\n\n` +
            `Links:\n` +
            `• [DexScreener](https://dexscreener.com/solana/${pair.pairAddress})\n` +
            `• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${pair.baseToken.address})\n` +
            `• [Birdeye](https://birdeye.so/token/${pair.baseToken.address})\n` +
            `• [🔒 RugCheck](https://rugcheck.xyz/tokens/${pair.baseToken.address})\n\n` +
            `⚠️ DYOR! Check token safety before trading!`;

        // Try to get token icon from multiple sources
        let iconUrl = null;

        // 1. Check if token has its own logo in DexScreener data
        if (pair.baseToken.logoURI && !pair.baseToken.logoURI.includes('solana')) {
            iconUrl = pair.baseToken.logoURI;
        }

        // 2. Try Jupiter API if no DexScreener logo
        if (!iconUrl) {
            try {
                const jupiterResponse = await axios.get('https://cache.jup.ag/tokens');
                const tokenInfo = jupiterResponse.data?.find(t => t.address === pair.baseToken.address);
                if (tokenInfo?.logoURI && !tokenInfo.logoURI.includes('solana')) {
                    iconUrl = tokenInfo.logoURI;
                }
            } catch (error) {
                console.log('Jupiter logo fetch failed');
            }
        }

        // 3. Try Raydium API if still no logo
        if (!iconUrl) {
            try {
                const raydiumResponse = await axios.get('https://api.raydium.io/v2/sdk/token/raydium.mainnet.json');
                const tokenInfo = raydiumResponse.data?.tokens?.find(t => t.mint === pair.baseToken.address);
                if (tokenInfo?.logoURI && !tokenInfo.logoURI.includes('solana')) {
                    iconUrl = tokenInfo.logoURI;
                }
            } catch (error) {
                console.log('Raydium logo fetch failed');
            }
        }

        if (iconUrl) {
            try {
                const imageResponse = await axios.get(iconUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 5000
                });
                
                if (imageResponse.status === 200 && imageResponse.data) {
                    await ctx.replyWithPhoto(
                        { source: imageResponse.data },
                        {
                            caption: caption,
                            parse_mode: 'Markdown'
                        }
                    );
                } else {
                    await ctx.replyWithMarkdown(caption, { 
                        disable_web_page_preview: true 
                    });
                }
            } catch (error) {
                await ctx.replyWithMarkdown(caption, { 
                    disable_web_page_preview: true 
                });
            }
        } else {
            await ctx.replyWithMarkdown(caption, { 
                disable_web_page_preview: true 
            });
        }

        // Show waiting message only if there are more tokens and only every 5 tokens
        if (currentIndex !== undefined && totalTokens !== undefined && currentIndex < totalTokens - 1) {
            if ((currentIndex + 1) % 5 === 0) {  // Show progress every 5 tokens
                await ctx.reply(`⏳ Token ${currentIndex + 1}/${totalTokens} displayed...`);
            }
            await delay(1000); // 1 second delay between tokens
        }

    } catch (error) {
        console.error(`Error displaying token:`, error);
        // Don't throw, just log the error and continue
    }
}