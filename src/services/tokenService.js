const axios = require('axios');
const { API_TIMEOUT, SOLANA_API_URL } = require('../utils/constants');
const { delay } = require('../utils/helpers');
const { makeRequest } = require('../utils/browser');

class TokenService {
    static async getSolanaTokens() {
        try {
            // ... getSolanaTokens implementation ...
        } catch (error) {
            console.error('Error in getSolanaTokens:', error.message);
            return null;
        }
    }

    static async searchSolanaTokens(searchTerm) {
        try {
            // Fetch from both sources in parallel
            const [coingeckoTokens, dexscreenerPairs] = await Promise.all([
                this.searchCoingeckoTokens(searchTerm),
                this.getDexScreenerData(searchTerm)
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

    static async searchCoingeckoTokens(searchTerm) {
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

    static async getDexScreenerData(searchTerm) {
        try {
            const data = await makeRequest(`https://api.dexscreener.com/latest/dex/search?q=${searchTerm}`);
            
            if (data?.pairs) {
                // Filter for Solana pairs only
                const solanaPairs = data.pairs.filter(pair => 
                    pair.chainId === 'solana' && 
                    pair.baseToken?.address
                );
                
                console.log(`Found ${solanaPairs.length} Solana pairs from DexScreener`);
                return solanaPairs;
            }
        } catch (error) {
            console.error('DexScreener error:', error.message);
            
            // Fallback to Birdeye API
            try {
                const birdeyeResponse = await makeRequest('https://public-api.birdeye.so/public/token_list?offset=0&limit=100');
                
                if (birdeyeResponse?.data) {
                    const tokens = birdeyeResponse.data.filter(token => 
                        token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        token.name.toLowerCase().includes(searchTerm.toLowerCase())
                    );

                    return tokens.map(token => ({
                        chainId: 'solana',
                        dexId: 'birdeye',
                        pairAddress: token.address,
                        baseToken: {
                            address: token.address,
                            name: token.name,
                            symbol: token.symbol
                        },
                        priceUsd: token.price,
                        priceChange: { h24: token.priceChange24h },
                        volume: { h24: token.volume24h },
                        liquidity: { usd: token.liquidity },
                        fdv: token.fdv
                    }));
                }
            } catch (fallbackError) {
                console.error('Birdeye API error:', fallbackError.message);
            }
        }
        
        return [];
    }

    static async searchPreLaunchTokens(searchTerm) {
        try {
            const response = await axios.get(
                'https://api.solscan.io/v2/token/list',
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-id': process.env.SOLANA_API_ID,
                        'x-api-secret': process.env.SOLANA_API_SECRET
                    },
                    params: {
                        sort_by: 'created_time',
                        sort_order: 'desc',
                        limit: 100
                    }
                }
            );

            const tokens = response.data?.data || [];

            // Filter for pre-launch tokens
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

    // ... other token-related methods ...
}

module.exports = TokenService; 