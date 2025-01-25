const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Add basic web server with error handling
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

// Start the server with error handling
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, trying ${port + 1}`);
        server.listen(port + 1);
    } else {
        console.error('Server error:', err);
    }
});

// Initialize bot and channel ID
const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID || '@solanaallet';

// Verify environment variables
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not found in environment variables');
    process.exit(1);
}

// Log channel configuration
console.log('Channel ID/Username:', CHANNEL_ID);

// Add constants for timeouts and chunking
const API_TIMEOUT = 30000; // 30 seconds for API calls
const DISPLAY_TIMEOUT = 60000; // 60 seconds for displaying data
const CHUNK_SIZE = 20; // Number of tokens per chunk
const DELAY_BETWEEN_CHUNKS = 3000; // 3 seconds between chunks

// Add constants for pump.fun API
const PUMP_API_URLS = {
    primary: "https://pumpapi.fun/api/get_newer_mints",
    backup: "https://api.pump.fun/api/get_newer_mints"  // Backup URL if primary fails
};
const PUMP_FETCH_LIMIT = 30;

// Update constants for API endpoints
const API_ENDPOINTS = {
    PUMP_API: "https://pumpapi.fun/api/get_newer_mints?limit=5",  // New endpoint
    BACKUP_API: "https://pumpapi.fun/api/get_newer_mints",
    FALLBACK_API: "https://pump.fun/api/mints/recent"
};

// Add constants for GraphQL API
const BITQUERY_API_URL = 'https://streaming.bitquery.io/graphql';
const BITQUERY_ACCESS_TOKEN = process.env.BITQUERY_ACCESS_TOKEN; // Use access token instead of API key

// Add GraphQL query
const PUMP_FUN_QUERY = `
query {
  solana {
    transfers(
      where: {
        currency: {mintAddress: {is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}}
        success: {is: true}
      }
      limit: 50
      orderBy: {descending: BLOCK_TIME}
    ) {
      block {
        timestamp
      }
      transaction {
        signature
      }
      currency {
        name
        symbol
        mintAddress
        decimals
      }
      amount
      sender
      receiver
    }
  }
}`;

// Add function to handle API calls with timeout
async function fetchWithTimeout(promise, timeout = API_TIMEOUT) {
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            )
        ]);
    } catch (error) {
        console.error('Fetch timeout:', error);
        throw error;
    }
}

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

// Add function to fetch DexScreener data
async function getDexScreenerData(searchTerm) {
    try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/search/?q=${searchTerm}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 10000
        });

        if (response.data?.pairs) {
            // Filter for Solana pairs only
            return response.data.pairs.filter(pair => pair.chainId === 'solana');
        }
        return [];
    } catch (error) {
        console.error('DexScreener fetch error:', error);
        return [];
    }
}

// Update search function to combine CoinGecko and DexScreener results
async function searchSolanaTokens(searchTerm) {
    try {
        // Fetch from both sources in parallel
        const [coingeckoTokens, dexscreenerPairs] = await Promise.all([
            searchCoingeckoTokens(searchTerm),
            getDexScreenerData(searchTerm)
        ]);

        // Process DexScreener pairs into token format
        const dexscreenerTokens = dexscreenerPairs.map(pair => ({
            name: pair.baseToken.name,
            symbol: pair.baseToken.symbol,
            contract_address: pair.baseToken.address,
            market_data: {
                current_price: { usd: parseFloat(pair.priceUsd) },
                price_change_percentage_24h: parseFloat(pair.priceChange?.h24),
                total_volume: { usd: parseFloat(pair.volume?.h24) },
                market_cap: { usd: parseFloat(pair.fdv) },
                fully_diluted_valuation: { usd: parseFloat(pair.fdv) }
            },
            dexscreener_data: {
                liquidity: pair.liquidity?.usd,
                pairs: pair.pairAddress,
                dex: pair.dexId,
                created_at: pair.pairCreatedAt
            }
        }));

        // Combine and deduplicate results
        const allTokens = [...(coingeckoTokens || []), ...dexscreenerTokens];
        const uniqueTokens = allTokens.filter((token, index, self) =>
            index === self.findIndex(t => 
                t.contract_address?.toLowerCase() === token.contract_address?.toLowerCase()
            )
        );

        return uniqueTokens;
    } catch (error) {
        console.error('Error in combined search:', error);
        return [];
    }
}

// Add helper function for CoinGecko search
async function searchCoingeckoTokens(searchTerm) {
    try {
        const searchResponse = await axios.get(`https://api.coingecko.com/api/v3/search`, {
            params: { query: searchTerm },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (!searchResponse.data?.coins) {
            return [];
        }

        const detailedTokens = [];
        for (const coin of searchResponse.data.coins.slice(0, 5)) {
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
                await delay(1000);
            } catch (error) {
                console.error(`Error fetching details for ${coin.id}:`, error.message);
            }
        }

        return detailedTokens;
    } catch (error) {
        console.error('Error searching CoinGecko:', error);
        return [];
    }
}

// Add delay utility function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const userCooldowns = new Map();
const COOLDOWN_PERIOD = 30000; // 30 seconds


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

// Welcome message handler
bot.command('start', async (ctx) => {
    try {
        // Get user's first name for personalized greeting
        const firstName = ctx.from.first_name || 'there';
        
        const welcomeMessage = 
            `🚀 *Welcome to Solana Token Bot!* 🚀\n\n` +
            `Hello ${firstName}! I can help you track and discover Solana tokens.\n\n` +
            `📚 *Available Commands:*\n\n` +
            `• /start - Show this welcome message\n` +
            `• /filter <category> - Find tokens by category:\n` +
            `   - micro-caps (0-48h, FDV $100k+)\n` +
            `   - old-micro-caps (0-72h, FDV $100k+)\n` +
            `   - low-caps (FDV $500k+)\n` +
            `   - old-low-caps (FDV $250k-$1M)\n` +
            `   - mid-caps (FDV $1M+)\n` +
            `   Example: /filter micro-caps\n\n` +
            `• /search <term> - Search for specific tokens\n` +
            `   Example: /search vodka\n\n` +   
            `🔍 *Token Discovery Features:*\n` +
            `• Real-time price updates\n` +
            `• Market cap & volume tracking\n` +
            `• Liquidity monitoring\n` +
            `• Transaction analysis\n` +
            `• Multiple DEX support\n\n` +
            `💡 *Pro Tips:*\n` +
            `• Use /filter to find promising tokens\n` +
            `• Check liquidity before trading\n` +
            `• Monitor transaction volume\n` +
            `• DYOR - Always research before investing\n\n` +
            `🔔 *Updates:*\n` +
            `• Instant price alerts\n` +
            `• New token notifications\n\n` +
            `Start exploring with any command! 🚀`;

        // Send welcome message with markdown formatting
        await ctx.replyWithMarkdown(welcomeMessage, { 
            disable_web_page_preview: true,
            parse_mode: 'Markdown'
        });

        console.log(`Welcome message sent to user: ${firstName}`); // Debug log

    } catch (error) {
        console.error('Error in start command:', error);
        await ctx.reply('❌ Error showing welcome message. Please try again.');
    }
});

// Make sure bot is launched
bot.launch().then(() => {
    console.log('Bot started successfully');
}).catch((error) => {
    console.error('Error starting bot:', error);
});

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

// Update the tokenMeetsCriteria function to properly handle numeric values
function tokenMeetsCriteria(token, criteria) {
    try {
        // Parse numeric values safely
        const fdv = parseFloat(token.fdv) || 0;
        const liquidity = parseFloat(token.liquidity?.usd) || 0;
        const volume24h = parseFloat(token.volume?.h24) || 0;
        const txns24h = parseInt(token.txns?.h24) || 0;
        const txns1h = parseInt(token.txns?.h1) || 0;

        // Calculate token age in hours
        const tokenAge = token.pairCreatedAt 
            ? (Date.now() - new Date(token.pairCreatedAt).getTime()) / (1000 * 60 * 60)
            : 0;

        // Debug logging
        console.log(`Token ${token.baseToken.symbol} metrics:`, {
            fdv,
            liquidity,
            volume24h,
            txns24h,
            txns1h,
            tokenAge
        });

        // Check criteria
        if (criteria.minFDV && fdv < criteria.minFDV) {
            console.log(`Failed minFDV check: ${fdv} < ${criteria.minFDV}`);
            return false;
        }
        if (criteria.maxFDV && fdv > criteria.maxFDV) {
            console.log(`Failed maxFDV check: ${fdv} > ${criteria.maxFDV}`);
            return false;
        }
        if (criteria.minLiquidity && liquidity < criteria.minLiquidity) {
            console.log(`Failed minLiquidity check: ${liquidity} < ${criteria.minLiquidity}`);
            return false;
        }
        if (criteria.maxAge && tokenAge > criteria.maxAge) {
            console.log(`Failed maxAge check: ${tokenAge} > ${criteria.maxAge}`);
            return false;
        }
        if (criteria.min24hVolume && volume24h < criteria.min24hVolume) {
            console.log(`Failed min24hVolume check: ${volume24h} < ${criteria.min24hVolume}`);
            return false;
        }
        if (criteria.min24hTxns && txns24h < criteria.min24hTxns) {
            console.log(`Failed min24hTxns check: ${txns24h} < ${criteria.min24hTxns}`);
            return false;
        }
        if (criteria.min1hTxns && txns1h < criteria.min1hTxns) {
            console.log(`Failed min1hTxns check: ${txns1h} < ${criteria.min1hTxns}`);
            return false;
        }

        // If all checks pass
        console.log(`Token ${token.baseToken.symbol} passed all criteria`);
        return true;
    } catch (error) {
        console.error(`Error checking criteria for token ${token.baseToken?.symbol}:`, error);
        return false;
    }
}

// Update the DEX_FILTERS criteria to be more realistic
const DEX_FILTERS = {
    'micro-caps': {
        name: 'Micro-caps 🔍',
        criteria: {
            minFDV: 50000,         // $50k (lowered from 100k)
            minLiquidity: 5000,    // $5k (lowered from 10k)
            maxAge: 48,            // 0-48 hours
            min1hTxns: 10          // 10 transactions (lowered from 50)
        }
    },
    'old-micro-caps': {
        name: 'Old Micro-caps 📊',
        criteria: {
            minFDV: 50000,         // $50k (lowered from 100k)
            minLiquidity: 7500,    // $7.5k (lowered from 15k)
            maxAge: 72,            // 0-72 hours
            min1hTxns: 20          // 20 transactions (lowered from 120)
        }
    },
    'low-caps': {
        name: 'Low-caps 💎',
        criteria: {
            minFDV: 250000,        // $250k (lowered from 500k)
            minLiquidity: 25000,   // $25k (lowered from 75k)
            min24hVolume: 50000,   // $50k (lowered from 1M)
            min24hTxns: 20         // 20 transactions (lowered from 50)
        }
    },
    'old-low-caps': {
        name: 'Old Low-caps 💰',
        criteria: {
            minFDV: 100000,        // $100k (lowered from 250k)
            maxFDV: 500000,        // $500k (lowered from 1M)
            minLiquidity: 50000,   // $50k (lowered from 100k)
            min24hVolume: 100000,  // $100k (lowered from 250k)
            min24hTxns: 100        // 100 transactions (lowered from 1000)
        }
    },
    'mid-caps': {
        name: 'Mid-caps 🚀',
        criteria: {
            minFDV: 500000,        // $500k (lowered from 1M)
            minLiquidity: 75000,   // $75k (lowered from 150k)
            min24hVolume: 250000   // $250k (lowered from 500k)
        }
    }
};

// Update filter command with correct API endpoint
bot.command('filter', async (ctx) => {
    try {
        const filterType = ctx.message.text.split('/filter ')[1]?.toLowerCase();
        
        console.log('Filter type:', filterType); // Debug log

        if (!filterType || !DEX_FILTERS[filterType]) {
            await ctx.replyWithMarkdown(
                `📚 *Available Filters:*\n\n` +
                `• micro-caps (0-48h, FDV $100k+)\n` +
                `• old-micro-caps (0-72h, FDV $100k+)\n` +
                `• low-caps (FDV $500k+)\n` +
                `• old-low-caps (FDV $250k-$1M)\n` +
                `• mid-caps (FDV $1M+)\n\n` +
                `*Example:* /filter micro-caps\n\n` +
                `💡 *Filter Tips:*\n` +
                `• Micro-caps: New tokens with potential\n` +
                `• Low-caps: Established small tokens\n` +
                `• Mid-caps: More stable tokens`
            );
            return;
        }

        const statusMsg = await ctx.reply(`🔍 Fetching ${filterType} tokens...`);
        
        // Use the correct DexScreener API endpoint
        console.log('Fetching from DexScreener...'); // Debug log
        const response = await axios.get('https://api.dexscreener.com/latest/dex/search?q=solana', {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });

        console.log('DexScreener response received'); // Debug log
        const pairs = response.data?.pairs || [];
        console.log(`Total pairs received: ${pairs.length}`); // Debug log

        // Filter Solana pairs only
        const solanaPairs = pairs.filter(pair => pair.chainId === 'solana');
        console.log(`Solana pairs found: ${solanaPairs.length}`); // Debug log

        const filterCriteria = DEX_FILTERS[filterType].criteria;
        console.log('Filter criteria:', filterCriteria); // Debug log
        
        // Apply filter criteria with logging
        const filteredTokens = solanaPairs.filter(pair => {
            try {
                const meets = tokenMeetsCriteria(pair, filterCriteria);
                if (meets) {
                    console.log(`Token passed filter: ${pair.baseToken.symbol}`); // Debug log
                }
                return meets;
            } catch (error) {
                console.error(`Error filtering token:`, error);
                return false;
            }
        });

        console.log(`Filtered tokens count: ${filteredTokens.length}`); // Debug log

        if (!filteredTokens.length) {
            await ctx.reply(`No tokens found matching the ${filterType} criteria. Try adjusting the filter parameters.`);
            return;
        }

        await ctx.reply(`Found ${filteredTokens.length} ${filterType} tokens. Starting display...`);

        // Process tokens in chunks
        for (let i = 0; i < filteredTokens.length; i += CHUNK_SIZE) {
            const chunk = filteredTokens.slice(i, i + CHUNK_SIZE);
            
            for (const token of chunk) {
                try {
                    const message = `
*${token.baseToken.symbol} (${DEX_FILTERS[filterType].name})*

💰 *Price Information:*
• Price: $${Number(token.priceUsd).toFixed(8)}
• 24h Change: ${token.priceChange?.h24 || '0'}%
• FDV: $${Number(token.fdv).toLocaleString()}

📊 *Market Data:*
• Liquidity: $${Number(token.liquidity?.usd).toLocaleString()}
• 24h Volume: $${Number(token.volume?.h24).toLocaleString()}
• 24h Txns: ${token.txns?.h24 || '0'}

⏰ *Token Info:*
• Created: ${new Date(token.pairCreatedAt).toLocaleString()}
• DEX: ${token.dexId}
• Pair: ${token.baseToken.symbol}/${token.quoteToken.symbol}

🔗 *Links:*
• [DexScreener](https://dexscreener.com/solana/${token.pairAddress})
• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${token.baseToken.address})
• [Solscan](https://solscan.io/token/${token.baseToken.address})
⚠️ [Token Safety](https://rugcheck.xyz/tokens/${token.baseToken.address})

⚠️ *DYOR! Check token safety before trading!*
`;

                    await ctx.replyWithMarkdown(message, { 
                        disable_web_page_preview: true 
                    });
                    await delay(1000);
                } catch (error) {
                    console.error('Error displaying token:', error);
                    continue;
                }
            }

            if (i + CHUNK_SIZE < filteredTokens.length) {
                await delay(DELAY_BETWEEN_CHUNKS);
            }
        }

        await ctx.reply(
            `✅ Displayed all ${filteredTokens.length} ${filterType} tokens.\n\n` +
            "⚠️ Warning: Always DYOR before investing!\n" +
            "🔄 Use /filter again to refresh the list."
        );

    } catch (error) {
        console.error('Error in filter command:', error);
        let errorMessage = "An unexpected error occurred.";
        
        if (error.response) {
            // Handle specific HTTP errors
            switch (error.response.status) {
                case 404:
                    errorMessage = "API endpoint not found. This might be temporary.";
                    break;
                case 429:
                    errorMessage = "Too many requests. Please wait a moment and try again.";
                    break;
                case 500:
                    errorMessage = "Server error. Please try again later.";
                    break;
                default:
                    errorMessage = `API Error: ${error.response.status}`;
            }
        } else if (error.request) {
            errorMessage = "No response from server. Please check your connection.";
        } else {
            errorMessage = error.message;
        }
        
        await ctx.reply(
            `❌ Error: ${errorMessage}\n` +
            "Please try again later or use a different filter."
        );
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

async function getTokenPrice(tokenAddress) {
    try {
        console.log(`Fetching price for token: ${tokenAddress}`); // Debug log
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
            timeout: 10000 // 10 second timeout
        });
        
        const pairs = response.data.pairs;
        console.log(`Found ${pairs?.length || 0} pairs for token`); // Debug log
        
        if (pairs && pairs.length > 0) {
            // Sort pairs by USD volume to get the most liquid pair
            const sortedPairs = pairs.sort((a, b) => b.volumeUsd - a.volumeUsd);
            const bestPair = sortedPairs[0];
            
            return {
                price: parseFloat(bestPair.priceUsd),
                priceChange24h: parseFloat(bestPair.priceChange.h24)
            };
        } else {
            // Try fallback method or throw detailed error
            throw new Error(`No trading pairs found for token ${tokenAddress}`);
        }
    } catch (error) {
        console.error('Detailed price fetch error:', {
            tokenAddress,
            errorMessage: error.message,
            errorResponse: error.response?.data
        });
        
        // Return a formatted error message
        return {
            error: true,
            message: `Unable to fetch price. Error: ${error.message}`
        };
    }
}

// Update the price message formatting if needed
async function formatPriceMessage(tokenInfo) {
    const priceData = await getTokenPrice(tokenInfo.address);
    
    // Check if there was an error
    if (priceData.error) {
        return `⚠️ ${priceData.message}\n\nToken: ${tokenInfo.name} (${tokenInfo.symbol})`;
    }

    const priceChangeEmoji = priceData.priceChange24h >= 0 ? '🟢' : '🔴';
    
    return `
${tokenInfo.name} (${tokenInfo.symbol}) Price:
💰 $${priceData.price.toFixed(tokenInfo.decimals)}
${priceChangeEmoji} 24h Change: ${priceData.priceChange24h.toFixed(2)}%
`;
}

// Add new utility function for fetching from pump.fun
async function fetchPumpFunTokens() {
    try {
        const response = await axios.get('https://pump.fun/board', {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            },
            timeout: 30000
        });

        // Parse the HTML response using cheerio
        const $ = cheerio.load(response.data);
        const tokens = [];

        // Extract token information from the board
        $('.token-row').each((i, element) => {
            const token = {
                name: $(element).find('.token-name').text().trim(),
                address: $(element).find('.token-address').text().trim(),
                launchTime: $(element).find('.launch-time').text().trim(),
                // Add other relevant fields you want to extract
            };
            tokens.push(token);
        });

        return tokens;
    } catch (error) {
        console.error('Error fetching from pump.fun:', error);
        return [];
    }
}

// Add new command to check pump.fun listings
bot.command('checkboard', async (ctx) => {
    try {
        const statusMessage = await ctx.reply("🔍 Scanning pump.fun board...");
        
        const tokens = await fetchPumpFunTokens();
        
        if (!tokens.length) {
            await ctx.reply("❌ No tokens found on the board currently.");
            return;
        }

        // Display found tokens
        await ctx.reply(`Found ${tokens.length} tokens on the board:`);
        
        for (const token of tokens) {
            const message = `
🪙 Token: ${token.name}
📍 Address: ${token.address}
⏰ Launch: ${token.launchTime}
`;
            await ctx.reply(message);
            await delay(1000); // Prevent rate limiting
        }

    } catch (error) {
        console.error('Error in checkboard command:', error);
        await ctx.reply("❌ Error scanning the board. Please try again later.");
    }
});

// Add search command for specific tokens
bot.command('searchboard', async (ctx) => {
    try {
        const query = ctx.message.text.split(' ').slice(1).join(' ').toLowerCase();
        
        if (!query) {
            await ctx.reply("Please provide a token name or address to search for.\nExample: /searchboard SOL");
            return;
        }

        const statusMessage = await ctx.reply(`🔍 Searching for "${query}" on the board...`);
        
        const tokens = await fetchPumpFunTokens();
        
        const matchingTokens = tokens.filter(token => 
            token.name.toLowerCase().includes(query) || 
            token.address.toLowerCase().includes(query)
        );

        if (!matchingTokens.length) {
            await ctx.reply(`❌ No tokens found matching "${query}"`);
            return;
        }

        await ctx.reply(`Found ${matchingTokens.length} matching tokens:`);
        
        for (const token of matchingTokens) {
            const message = `
🪙 Token: ${token.name}
📍 Address: ${token.address}
⏰ Launch: ${token.launchTime}
`;
            await ctx.reply(message);
            await delay(1000); // Prevent rate limiting
        }

    } catch (error) {
        console.error('Error in searchboard command:', error);
        await ctx.reply("❌ Error searching the board. Please try again later.");
    }
});

// Update newmints command with multiple fallback options
bot.command('newmints', async (ctx) => {
    try {
        const statusMsg = await ctx.reply("🔍 Fetching latest mints...");
        let mintAddresses = [];

        // Try each API endpoint until we get a successful response
        for (const [name, url] of Object.entries(API_ENDPOINTS)) {
            try {
                console.log(`Trying ${name}...`);
                const response = await axios.get(url, {
                    params: { limit: 30 },
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    timeout: 15000,
                    validateStatus: function (status) {
                        return status >= 200 && status < 300; // Only accept success status codes
                    }
                });

                // Handle different response formats
                if (response.data?.mint) {
                    mintAddresses = response.data.mint;
                } else if (Array.isArray(response.data)) {
                    mintAddresses = response.data.map(item => item.address || item);
                } else if (response.data?.data?.mints) {
                    mintAddresses = response.data.data.mints;
                }

                if (mintAddresses.length > 0) {
                    console.log(`Successfully fetched ${mintAddresses.length} mints from ${name}`);
                    break; // Exit loop if we got valid data
                }
            } catch (error) {
                console.error(`Error with ${name}:`, error.message);
                continue; // Try next endpoint
            }
        }

        if (!mintAddresses || mintAddresses.length === 0) {
            throw new Error('No mints found from any available source');
        }

        await ctx.reply(`Found ${mintAddresses.length} new mints. Starting display...`);

        // Process mints in chunks
        for (let i = 0; i < mintAddresses.length; i += CHUNK_SIZE) {
            const chunk = mintAddresses.slice(i, i + CHUNK_SIZE);
            
            for (const address of chunk) {
                try {
                    if (!address || typeof address !== 'string') {
                        console.log('Invalid mint address:', address);
                        continue;
                    }

                    const message = `
*🆕 New Token Mint*
📍 Address: \`${address}\`
⏰ Minted: ${new Date().toLocaleString()}

🔗 Links:
• [Solscan](https://solscan.io/token/${address})
• [Birdeye](https://birdeye.so/token/${address})
• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${address})
• [pump.fun](https://pump.fun/token/${address})
⚠️ [Token Safety](https://rugcheck.xyz/tokens/${address})

⚠️ *DYOR! New mints are highly risky!*
`;

                    await ctx.replyWithMarkdown(message, { 
                        disable_web_page_preview: true,
                        disable_notification: true
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error('Error displaying mint:', error);
                    continue;
                }
            }

            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
        }

        await ctx.reply(
            `✅ Displayed all ${mintAddresses.length} new mints.\n\n` +
            "⚠️ Warning: New mints are extremely risky!\n" +
            "• Always verify contracts\n" +
            "• Check token safety\n" +
            "• Start with small amounts\n" +
            "🔄 Use /newmints to refresh the list"
        );

    } catch (error) {
        console.error('Error in newmints command:', error);
        await ctx.reply(
            `❌ Error: ${error.message}\n` +
            "Please try again in a few minutes.\n" +
            "If the problem persists, the service might be under maintenance."
        );
    }
});

// Add help message for new command
const newMintsHelpMessage = 
    `📚 Available Commands:*\n\n` +
    `• /start - Show welcome message\n` +
    `• /latest - View latest Solana tokens\n` +
    `• /newmints - View newest token mints\n` +
    `• /search <term> - Search for specific tokens\n` +
    `• /filter - Show token filters\n` +
    `• /help - Show this help message\n\n` +
    `💡 Tips:*\n` +
    `• Use /newmints to see fresh mints\n` +
    `• Use /search followed by token name or symbol\n` +
    `• Latest shows most liquid tokens first\n` +
    `• Filter helps find specific market caps`;

// Update constants with SolanaScan API V2 credentials
const SOLANA_API_URL = 'https://api.solscan.io/v2';
const SOLANA_API_ID = '0150d174-2dd3-43d4-9f44-d2fb0a7bd81c';
const SOLANA_API_SECRET = 'RhgtSNuYg_dF7Ur4y77MfHE9r-';

// Update the fetch function to use SolanaScan API
async function fetchPumpFunTokensMetadata() {
    try {
        console.log('Fetching from SolanaScan API...');
        const response = await axios.get(
            `${SOLANA_API_URL}/token/list`, 
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-id': SOLANA_API_ID,
                    'x-api-secret': SOLANA_API_SECRET
                },
                params: {
                    sort_by: 'created_time',
                    sort_order: 'desc',
                    limit: 50
                },
                timeout: 10000
            }
        );

        // Log the full response for debugging
        console.log('SolanaScan API response:', response.data);

        if (!response.data?.data) {
            throw new Error('Invalid response format from SolanaScan API');
        }

        return response.data.data;
    } catch (error) {
        console.error('Error fetching from SolanaScan:', error);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        throw error;
    }
}

// Update the command to handle SolanaScan data
bot.command('pumpfun', async (ctx) => {
    try {
        const statusMsg = await ctx.reply("🔍 Fetching new tokens from SolanaScan...");
        
        const tokens = await fetchPumpFunTokensMetadata();
        
        if (!tokens.length) {
            await ctx.reply("No new tokens found at the moment.");
            return;
        }

        await ctx.reply(`Found ${tokens.length} new tokens. Displaying details...`);

        // Process tokens in chunks
        const CHUNK_SIZE = 5;
        for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
            const chunk = tokens.slice(i, i + CHUNK_SIZE);
            
            for (const token of chunk) {
                const message = `
*🆕 New Token*
📝 Name: ${token.symbol || 'Unknown'}
💎 Symbol: ${token.name || 'Unknown'}
📍 Address: \`${token.address}\`
🔢 Decimals: ${token.decimals || 'Unknown'}
💰 Supply: ${token.supply ? Number(token.supply).toLocaleString() : 'Unknown'}
👥 Holders: ${token.holder_count || 'Unknown'}
🕒 Created: ${token.created_time ? new Date(token.created_time * 1000).toLocaleString() : 'Unknown'}

🔗 *Links:*
• [Solscan](https://solscan.io/token/${token.address})
• [Birdeye](https://birdeye.so/token/${token.address})
• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${token.address})
⚠️ [Token Safety](https://rugcheck.xyz/tokens/${token.address})

⚠️ *DYOR! New tokens are high risk!*
`;

                await ctx.replyWithMarkdown(message, { 
                    disable_web_page_preview: true 
                });
                await delay(1000);
            }

            if (i + CHUNK_SIZE < tokens.length) {
                await delay(3000);
            }
        }

        await ctx.reply(
            `✅ Displayed all ${tokens.length} new tokens.\n\n` +
            "⚠️ Warning: New tokens are extremely risky!\n" +
            "• Always verify contracts\n" +
            "• Check token safety\n" +
            "• Start with small amounts\n" +
            "🔄 Use /pumpfun to refresh the list"
        );

    } catch (error) {
        console.error('Error in pumpfun command:', error);
        let errorMessage = "❌ An error occurred while fetching tokens.";
        
        if (error.response?.status === 401) {
            errorMessage = "❌ API authentication error. Please check credentials.";
        } else if (error.response?.status === 429) {
            errorMessage = "❌ Rate limit exceeded. Please try again later.";
        }
        
        await ctx.reply(
            `${errorMessage}\n\n` +
            "For support:\n" +
            "1. Verify API credentials\n" +
            "2. Check API rate limits\n" +
            "3. Try again in a few minutes"
        );
    }
});

// Add function to search pre-launch tokens
async function searchPreLaunchTokens(searchTerm) {
    try {
        // First try SolanaScan API for newest tokens
        const response = await axios.get(
            `${SOLANA_API_URL}/token/list`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-id': SOLANA_API_ID,
                    'x-api-secret': SOLANA_API_SECRET
                },
                params: {
                    sort_by: 'created_time',
                    sort_order: 'desc',
                    limit: 100 // Fetch more tokens to filter through
                }
            }
        );

        const tokens = response.data?.data || [];

        // Filter for pre-launch tokens (tokens with no price or very low holder count)
        const prelaunchTokens = tokens.filter(token => {
            return (
                (!token.price_usd || token.price_usd === '0') &&
                (!token.holder_count || token.holder_count < 10) &&
                (token.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 token.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 token.address?.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        });

        return prelaunchTokens;
    } catch (error) {
        console.error('Error searching pre-launch tokens:', error);
        return [];
    }
}

// Add new command for searching pre-launch tokens
bot.command('prelaunch', async (ctx) => {
    try {
        const searchTerm = ctx.message.text.split('/prelaunch ')[1]?.toLowerCase();
        
        if (!searchTerm) {
            await ctx.reply("ℹ️ Please specify a search term. Example: /prelaunch sol");
            return;
        }

        const statusMsg = await ctx.reply(`🔍 Searching for pre-launch tokens matching "${searchTerm}"...`);
        
        const tokens = await searchPreLaunchTokens(searchTerm);

        if (!tokens.length) {
            await ctx.reply(`❌ No pre-launch tokens found matching "${searchTerm}"`);
            return;
        }

        await ctx.reply(`Found ${tokens.length} pre-launch tokens. Displaying details...`);

        // Process tokens in chunks
        const CHUNK_SIZE = 5;
        for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
            const chunk = tokens.slice(i, i + CHUNK_SIZE);
            
            for (const token of chunk) {
                const message = `
*🚀 Pre-launch Token Found*
📝 Name: ${token.name || 'Unknown'}
💎 Symbol: ${token.symbol || 'Unknown'}
📍 Address: \`${token.address}\`
🔢 Decimals: ${token.decimals || 'Unknown'}
💰 Supply: ${token.supply ? Number(token.supply).toLocaleString() : 'Unknown'}
👥 Holders: ${token.holder_count || '0'}
🕒 Created: ${token.created_time ? new Date(token.created_time * 1000).toLocaleString() : 'Unknown'}
💵 Price: ${token.price_usd ? `$${token.price_usd}` : '⏳ Not priced yet'}
📊 Status: ${getTokenStatus(token)}

🔗 *Verification Links:*
• [Solscan](https://solscan.io/token/${token.address})
• [Birdeye](https://birdeye.so/token/${token.address})
• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${token.address})
⚠️ [Token Safety](https://rugcheck.xyz/tokens/${token.address})

⚠️ *DYOR! Pre-launch tokens are extremely high risk!*
• Verify contract ownership
• Check token distribution
• Research the team
• Be cautious of scams
`;

                await ctx.replyWithMarkdown(message, { 
                    disable_web_page_preview: true 
                });
                await delay(1000);
            }

            if (i + CHUNK_SIZE < tokens.length) {
                await delay(3000);
            }
        }

        await ctx.reply(
            `✅ Displayed all ${tokens.length} pre-launch tokens.\n\n` +
            "⚠️ Important Warnings:\n" +
            "• Pre-launch tokens are extremely risky\n" +
            "• Many could be scams or rugs\n" +
            "• Always verify contracts\n" +
            "• Never invest more than you can afford to lose\n" +
            "🔄 Use /prelaunch again to refresh results"
        );

    } catch (error) {
        console.error('Error in prelaunch command:', error);
        await ctx.reply(
            `❌ Error searching pre-launch tokens: ${error.message}\n` +
            "Please try again later or contact support."
        );
    }
});

// Helper function to determine token status
function getTokenStatus(token) {
    if (!token.price_usd && !token.holder_count) {
        return '🆕 Just Created';
    } else if (!token.price_usd && token.holder_count < 5) {
        return '📝 Pre-Launch';
    } else if (!token.price_usd && token.holder_count >= 5) {
        return '🚀 Launch Soon';
    } else {
        return '✅ Listed';
    }
}

// Add to help message
const helpMessage = 
    `📚 Available Commands:*\n\n` +
    `• /start - Show welcome message\n` +
    `• /latest - View latest Solana tokens\n` +
    `• /search <term> - Search for specific tokens\n` +
    `• /prelaunch <term> - Search pre-launch tokens\n` +
    `• /help - Show this help message\n\n` +
    `💡 Tips:*\n` +
    `• Use /prelaunch to find tokens before launch\n` +
    `• Always verify contracts and team\n` +
    `• Be extremely careful with pre-launch tokens\n` +
    `• Research thoroughly before investing`;

// Update search function to handle both data sources
bot.command('search', async (ctx) => {
    try {
        const searchTerm = ctx.message.text.split('/search ')[1]?.toLowerCase();
        
        if (!searchTerm) {
            await ctx.reply("Please specify a search term. Example: /search solana");
            return;
        }

        const statusMsg = await ctx.reply(`🔍 Searching for "${searchTerm}"...`);
        
        const tokens = await searchSolanaTokens(searchTerm);
        
        if (!tokens || tokens.length === 0) {
            await ctx.reply(`No tokens found matching "${searchTerm}"`);
            return;
        }

        await ctx.reply(`Found ${tokens.length} tokens. Displaying results...`);

        for (const token of tokens) {
            const isDexScreenerToken = !!token.dexscreener_data;
            
            const message = `
*${token.name} (${token.symbol.toUpperCase()})*

💰 *Price Information:*
• Current Price: $${token.market_data?.current_price?.usd?.toFixed(8) || 'Unknown'}
• 24h Change: ${token.market_data?.price_change_percentage_24h?.toFixed(2) || 0}%
${isDexScreenerToken ? `• Liquidity: $${Number(token.dexscreener_data?.liquidity).toLocaleString() || 'Unknown'}
• DEX: ${token.dexscreener_data?.dex || 'Unknown'}` : `• 7d Change: ${token.market_data?.price_change_percentage_7d?.toFixed(2) || 0}%`}

📊 *Market Data:*
• Market Cap: $${token.market_data?.market_cap?.usd ? Number(token.market_data.market_cap.usd).toLocaleString() : 'Unknown'}
• FDV: $${token.market_data?.fully_diluted_valuation?.usd ? Number(token.market_data.fully_diluted_valuation.usd).toLocaleString() : 'Unknown'}
• 24h Volume: $${token.market_data?.total_volume?.usd ? Number(token.market_data.total_volume.usd).toLocaleString() : 'Unknown'}

${isDexScreenerToken ? `⏰ *Launch Information:*
• Created: ${new Date(token.dexscreener_data.created_at).toLocaleString()}
• Pair Address: ${token.dexscreener_data.pairs}` : ''}

🔍 *Verification Links:*
• [Solscan](https://solscan.io/token/${token.contract_address || ''})
• [Birdeye](https://birdeye.so/token/${token.contract_address || ''})
• [DexScreener](https://dexscreener.com/solana/${token.contract_address || ''})
• [RugCheck](https://rugcheck.xyz/tokens/${token.contract_address || ''})

⚠️ *Risk Warning:*
• Always DYOR before investing
• Check contract verification
• Verify liquidity & holders
• Monitor trading patterns
• Start with small amounts
• Be aware of potential risks
`;

            await ctx.replyWithMarkdown(message, { 
                disable_web_page_preview: true 
            });
            await delay(1000);
        }

        await ctx.reply(
            "✅ Search complete!\n\n" +
            "💡 Tips:\n" +
            "• Always verify tokens before trading"
        );

    } catch (error) {
        console.error('Error in search command:', error);
        await ctx.reply('❌ Error searching tokens. Please try again.');
    }
});
