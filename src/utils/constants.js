module.exports = {
    API_TIMEOUT: 30000,
    DISPLAY_TIMEOUT: 60000,
    CHUNK_SIZE: 20,
    DELAY_BETWEEN_CHUNKS: 3000,
    
    PUMP_API_URLS: {
        primary: "https://pumpapi.fun/api/get_newer_mints",
        backup: "https://api.pump.fun/api/get_newer_mints"
    },
    
    API_ENDPOINTS: {
        PUMP_API: "https://pumpapi.fun/api/get_newer_mints?limit=5",
        BACKUP_API: "https://pumpapi.fun/api/get_newer_mints",
        FALLBACK_API: "https://pump.fun/api/mints/recent"
    },
    
    DEX_FILTERS: {
        'micro-caps': {
            minFDV: 50000,    // $50K
            maxFDV: 250000,   // $250K
            maxAge: 48,       // 2 days
            minLiquidity: 5000
        },
        'old-micro-caps': {
            minFDV: 50000,    // $50K
            maxFDV: 250000,   // $250K
            minAge: 48,
            maxAge: 72,
            minLiquidity: 5000
        },
        'low-caps': {
            minFDV: 250000,   // $250K
            maxFDV: 500000,   // $500K
            minLiquidity: 10000
        },
        'old-low-caps': {
            minFDV: 100000,   // $100K
            maxFDV: 500000,   // $500K
            minAge: 72,
            minLiquidity: 7500
        },
        'mid-caps': {
            minFDV: 500000,   // $500K (lowered from $1M)
            minLiquidity: 20000
        }
    },
    
    // ... other constants ...
}; 