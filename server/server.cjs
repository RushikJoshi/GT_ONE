/**
 * IIS/Plesk CommonJS Bridge for ESM
 * This file is the entry point for iisnode.
 * It dynamically imports the main ESM server.js.
 */
(async () => {
    try {
        await import('./server.js');
    } catch (err) {
        console.error('Failed to load ESM app:', err);
        process.exit(1);
    }
})();
