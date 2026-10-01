const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Configuration: CCaaS parent domain allowed to embed this widget
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'https://agent-assist.cloud.google.com';

// Security Headers: Ensure widget can only be embedded inside your CCaaS domain
app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy", 
        `frame-ancestors 'self' ${ALLOWED_DOMAIN}`
    );
    next();
});

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON bodies
app.use(express.static(__dirname)); // Serve static files

// Helper function for exponential backoff to handle 429 rate limit errors
const fetchWithBackoff = async (url, options, maxRetries = 5) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(url, options);
        if (response.ok || (response.status !== 429 && response.status < 500)) {
            return response;
        }
        if (i === maxRetries - 1) return response;
        await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
};

// --- Gemini API Proxy Route ---
app.post('/api/chat', async (req, res) => {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return res.status(500).json({ error: { message: 'GEMINI_API_KEY is not configured on the server.' } });
    }

    // The user's chat history is sent from the frontend
    const { contents } = req.body;
    if (!contents) {
        return res.status(400).json({ error: { message: 'Request body must contain "contents" array.' } });
    }
    
    // Model updated to gemini-3.8-flash as required by the API
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiApiKey}`;
    const systemPrompt = "You are Gemini, a helpful and creative AI assistant. You can help users with a variety of tasks like writing, summarizing, reformatting text, brainstorming ideas, and answering questions.";

    const payload = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    try {
        const geminiResponse = await fetchWithBackoff(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            console.error('Gemini API Error:', errorBody);
            return res.status(geminiResponse.status).json({ 
                error: { message: errorBody.error?.message || 'An error occurred with the Gemini API.' }
            });
        }

        const result = await geminiResponse.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            res.json({ text: candidate.content.parts[0].text });
        } else {
            res.status(500).json({ error: { message: 'Invalid response structure from Gemini API.' } });
        }

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ error: { message: 'Failed to communicate with the Gemini API.' } });
    }
});

// --- Health Check Route for Cloud Run ---
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// --- Serve the HTML file for the root URL ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'gemini_chat.html'));
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
