const axios = require('axios');
const { API_ENDPOINTS, CHUNK_SIZE, DELAY_BETWEEN_CHUNKS } = require('../utils/constants');
const { delay } = require('../utils/helpers');

module.exports = (bot) => {
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
                            'User-Agent': 'Mozilla/5.0',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        },
                        timeout: 15000
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
                        break;
                    }
                } catch (error) {
                    console.error(`Error with ${name}:`, error.message);
                    continue;
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
                        const message = `
*🆕 New Token Mint*
📍 Address: \`${address}\`
⏰ Minted: ${new Date().toLocaleString()}

🔗 *Links:*
• [Solscan](https://solscan.io/token/${address})
• [Birdeye](https://birdeye.so/token/${address})
• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${address})
⚠️ [Token Safety](https://rugcheck.xyz/tokens/${address})

⚠️ *DYOR! New mints are highly risky!*
`;

                        await ctx.replyWithMarkdown(message, { 
                            disable_web_page_preview: true,
                            disable_notification: true
                        });
                        await delay(1000);
                    } catch (error) {
                        console.error('Error displaying mint:', error);
                        continue;
                    }
                }

                await delay(DELAY_BETWEEN_CHUNKS);
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
}; 