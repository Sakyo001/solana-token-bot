const axios = require('axios');

function keepAlive() {
    setInterval(async () => {
        try {
            const response = await axios.get(process.env.PROJECT_URL);
            console.log('Keep-alive ping successful:', response.status);
        } catch (error) {
            console.error('Keep-alive ping failed:', error.message);
        }
    }, 5 * 60 * 1000); // Ping every 5 minutes
}

module.exports = keepAlive;