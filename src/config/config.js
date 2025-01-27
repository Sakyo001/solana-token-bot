require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    CHANNEL_ID: process.env.CHANNEL_ID,
    port: process.env.PORT || 3000,
    SOLANA_API_URL: 'https://api.solscan.io/v2',
    SOLANA_API_ID: process.env.SOLANA_API_ID,
    SOLANA_API_SECRET: process.env.SOLANA_API_SECRET,
    BITQUERY_ACCESS_TOKEN: process.env.BITQUERY_ACCESS_TOKEN
}; 