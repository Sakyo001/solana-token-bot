const axios = require('axios');

async function makeRequest(url, options = {}) {
    try {
        const response = await axios({
            url,
            method: options.method || 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ...options.headers
            },
            timeout: options.timeout || 15000,
            ...options
        });

        return response.data;
    } catch (error) {
        console.error('Request error:', error.message);
        throw error;
    }
}

module.exports = { makeRequest }; 