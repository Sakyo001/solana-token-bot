const { DEX_FILTERS } = require('../utils/constants');
const { delay } = require('../utils/helpers');
const axios = require('axios');

module.exports = (bot) => {
    bot.command('filter', async (ctx) => {
        try {
            const filterType = ctx.message.text.split('/filter ')[1]?.toLowerCase();
            
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

            try {
                // Use multiple search terms to get more Solana pairs
                const searchTerms = ['sol', 'solana', 'bonk', 'wen'];
                let allPairs = [];

                for (const term of searchTerms) {
                    const response = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${term}`, {
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0'
                        }
                    });

                    if (response.data?.pairs) {
                        allPairs = [...allPairs, ...response.data.pairs];
                    }
                    await delay(500); // Rate limiting between requests
                }

                console.log(`Total pairs found before filtering: ${allPairs.length}`);

                // Filter unique Solana pairs
                const uniquePairs = Array.from(new Map(allPairs
                    .filter(pair => pair?.chainId === 'solana')
                    .map(pair => [pair.baseToken?.address, pair]))
                    .values());

                console.log(`Unique Solana pairs found: ${uniquePairs.length}`);

                // Filter valid pairs
                const validPairs = uniquePairs.filter(pair => {
                    try {
                        return pair &&
                            pair.baseToken?.address &&
                            pair.fdv &&
                            pair.liquidity?.usd &&
                            parseFloat(pair.fdv) > 0 &&
                            parseFloat(pair.liquidity.usd) > 0;
                    } catch (error) {
                        return false;
                    }
                });

                console.log(`Valid pairs found: ${validPairs.length}`);

                // Apply filter criteria
                const filteredPairs = validPairs.filter(pair => {
                    try {
                        const fdv = parseFloat(pair.fdv);
                        const age = (Date.now() - new Date(pair.pairCreatedAt).getTime()) / (1000 * 60 * 60);
                        const liquidity = parseFloat(pair.liquidity.usd);

                        console.log(`Checking ${pair.baseToken.symbol}:`, {
                            fdv: `$${fdv.toLocaleString()}`,
                            age: `${Math.round(age)}h`,
                            liquidity: `$${liquidity.toLocaleString()}`
                        });

                        switch(filterType) {
                            case 'micro-caps':
                                return fdv >= 25000 && fdv <= 500000 && age <= 48 && liquidity >= 1000;
                            case 'old-micro-caps':
                                return fdv >= 25000 && fdv <= 500000 && age <= 72 && age > 48 && liquidity >= 1000;
                            case 'low-caps':
                                return fdv >= 100000 && fdv <= 1000000 && liquidity >= 5000;
                            case 'old-low-caps':
                                return fdv >= 50000 && fdv <= 1000000 && age > 72 && liquidity >= 2500;
                            case 'mid-caps':
                                return fdv >= 500000 && fdv <= 10000000 && liquidity >= 10000;
                            default:
                                return false;
                        }
                    } catch (error) {
                        console.error('Error filtering pair:', error);
                        return false;
                    }
                });

                if (filteredPairs.length === 0) {
                    await ctx.reply(`No tokens found matching the ${filterType} criteria.`);
                    return;
                }

                // Sort pairs by FDV
                const sortedPairs = filteredPairs.sort((a, b) => 
                    (parseFloat(b.fdv) || 0) - (parseFloat(a.fdv) || 0)
                );

                await ctx.reply(`Found ${sortedPairs.length} tokens matching ${filterType} criteria. Displaying results...`);

                // Display tokens
                for (const pair of sortedPairs) {
                    try {
                        // Try to get rugcheck data
                        let rugcheckInfo = '';
                        if (pair.baseToken?.address) {
                            try {
                                const rugcheckResponse = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${pair.baseToken.address}`);
                                if (rugcheckResponse.data) {
                                    const { score, warnings } = rugcheckResponse.data;
                                    rugcheckInfo = `
🚨 *Rugcheck Score:* ${score}/100
${warnings && warnings.length > 0 ? `⚠️ *Warnings:*\n${warnings.map(w => `• ${w}`).join('\n')}` : '✅ No warnings found'}`;
                                }
                            } catch (error) {
                                rugcheckInfo = '\n⚠️ *Rugcheck:* Unable to fetch safety data';
                            }
                        }

                        const message = `
*${pair.baseToken.name} (${pair.baseToken.symbol})*

💰 *Price Information:*
• Current Price: $${parseFloat(pair.priceUsd).toFixed(8)}
• 24h Change: ${pair.priceChange?.h24 || 0}%
• Liquidity: $${Number(pair.liquidity?.usd || 0).toLocaleString()}

📊 *Market Data:*
• FDV: $${Number(pair.fdv || 0).toLocaleString()}
• 24h Volume: $${Number(pair.volume?.h24 || 0).toLocaleString()}

⏰ *Launch Information:*
• Created: ${new Date(pair.pairCreatedAt).toLocaleString()}
• Age: ${Math.round((Date.now() - new Date(pair.pairCreatedAt).getTime()) / (1000 * 60 * 60))}h
• DEX: ${pair.dexId}

${rugcheckInfo}

🔍 *Verification Links:*
• [Solscan](https://solscan.io/token/${pair.baseToken.address})
• [Birdeye](https://birdeye.so/token/${pair.baseToken.address})
• [DexScreener](https://dexscreener.com/solana/${pair.baseToken.address})
• [RugCheck](https://rugcheck.xyz/tokens/${pair.baseToken.address})

⚠️ *Risk Warning:*
• Always DYOR before investing
• Check contract verification
• Verify liquidity & holders
• Monitor trading patterns
`;

                        await ctx.replyWithMarkdown(message, { 
                            disable_web_page_preview: true 
                        });
                        await delay(1000);
                    } catch (error) {
                        console.error('Error sending message:', error);
                        continue;
                    }
                }

                await ctx.reply(
                    `✅ Filter results complete!\n\n` +
                    `💡 Tips:\n` +
                    `• Use different filters to find tokens\n` +
                    `• Always verify tokens before trading\n` +
                    `• Monitor trading patterns\n` +
                    `• Check liquidity levels`
                );

            } catch (error) {
                console.error('Error in filter command:', error);
                await ctx.reply(`❌ Error: ${error.message}. Please try again later.`);
            }

        } catch (error) {
            console.error('Error in filter command:', error);
            await ctx.reply(`❌ Error: ${error.message}. Please try again later.`);
        }
    });
}; 