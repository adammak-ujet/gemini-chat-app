const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON bodies
app.use(express.static(__dirname)); // Serve the static gemini_chat.html file

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
    
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;
    const systemPrompt = "You are Gemini, a helpful and creative AI assistant. You can help users with a variety of tasks like writing, summarizing, reformatting text, brainstorming ideas, and answering questions.";

    const payload = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    try {
        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            console.error('Gemini API Error:', errorBody);
            // Pass the detailed error from Gemini back to the frontend if possible
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

