const { exec } = require('child_process');
const path = require('path');

// Kill any existing node processes
const killNode = () => {
    return new Promise((resolve, reject) => {
        const command = process.platform === 'win32' ? 'taskkill /F /IM node.exe' : 'pkill node';
        
        exec(command, (error) => {
            // Ignore errors as there might not be any processes to kill
            resolve();
        });
    });
};

// Start the bot
const startBot = async () => {
    try {
        // First kill any existing processes
        await killNode();
        
        // Wait a moment for processes to clean up
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Start the bot
        const botProcess = exec('node bot.js', {
            cwd: __dirname
        });

        botProcess.stdout.on('data', (data) => {
            console.log(data.toString());
        });

        botProcess.stderr.on('data', (data) => {
            console.error(data.toString());
        });

    } catch (error) {
        console.error('Error starting bot:', error);
    }
};

startBot(); 