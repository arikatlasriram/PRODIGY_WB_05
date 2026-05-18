const express = require('express');
const router = express.Router();

// @route   POST api/ai/chat
// @desc    Ask AI Weather Assistant
// @access  Public (or protected if desired)
router.post('/chat', async (req, res) => {
    try {
        const { question, weatherData } = req.body;

        if (!question) {
            return res.status(400).json({ message: 'Question is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        // Graceful Fallback if Gemini API key is missing
        if (!apiKey) {
            console.log('No GEMINI_API_KEY found, using rule-based fallback responder.');
            const fallbackResponse = getRuleBasedResponse(question, weatherData);
            return res.json({ response: fallbackResponse });
        }

        // Format weather context for AI
        let weatherContext = "No current weather active.";
        if (weatherData) {
            weatherContext = `City: ${weatherData.name}, Temp: ${weatherData.main.temp}°C (Feels like: ${weatherData.main.feels_like}°C), Description: ${weatherData.weather[0].description}, Humidity: ${weatherData.main.humidity}%, Wind: ${weatherData.wind.speed} m/s, Clouds: ${weatherData.clouds.all}%.`;
        }

        // Call Gemini 2.5 Flash API using direct fetch
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Weather Context:\n${weatherContext}\n\nUser Question: "${question}"`
                    }]
                }],
                systemInstruction: {
                    parts: [{
                        text: "You are SkyPulse AI, a premium, friendly weather assistant. Keep your response helpful, cheerful, and extremely concise (maximum 3 sentences or 60 words). Suggest practical clothing or activity advice based on the context. Always use 1-3 emojis!"
                    }]
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            console.error('Gemini API error:', errData);
            return res.json({ response: getRuleBasedResponse(question, weatherData) });
        }

        const data = await response.json();
        const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm not sure how to answer that based on the current weather. 🌤️";
        
        res.json({ response: aiResponse.trim() });

    } catch (err) {
        console.error('AI assistant error:', err);
        res.status(500).json({ message: 'Server error in AI assistant' });
    }
});

// Smart local fallback assistant to ensure excellent demo offline / without API key
function getRuleBasedResponse(q, weather) {
    const question = q.toLowerCase();
    const temp = weather ? weather.main.temp : 20;
    const desc = weather ? weather.weather[0].description.toLowerCase() : 'clear';
    const humidity = weather ? weather.main.humidity : 50;

    if (question.includes('umbrella') || question.includes('rain') || question.includes('carry')) {
        if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('thunderstorm')) {
            return "Yes, definitely carry an umbrella! 🌧️ Rain is currently active in your area, so stay protected and warm!";
        }
        return "No umbrella needed today! ☀️ The skies look safe for now, but keep an eye on SkyPulse just in case!";
    }

    if (question.includes('run') || question.includes('outside') || question.includes('sport') || question.includes('go out')) {
        if (desc.includes('rain') || desc.includes('storm')) {
            return "I'd recommend staying indoors today! ⛈️ Active precipitation makes outdoor runs unsafe. How about an indoor workout?";
        }
        if (temp > 35) {
            return `It is extremely hot outside (${Math.round(temp)}°C)! 🥵 Better do your run early in the morning or stick to an air-conditioned gym.`;
        }
        return `Perfect weather for outdoor activities! 🏃‍♂️ With ${Math.round(temp)}°C and ${desc}, conditions are optimal for a great outdoor session.`;
    }

    if (question.includes('wear') || question.includes('clothes') || question.includes('jacket')) {
        if (temp < 15) {
            return `Brr, it's chilly! 🧥 I recommend layered warm clothing, a thick jacket, and maybe a scarf to keep comfortable.`;
        }
        if (temp > 28) {
            return "It's warm today! 👕 Lightweight, breathable fabrics like linen or cotton will keep you nice and cool.";
        }
        return "Mild weather today! 🧥 A light sweater or hoodie over a t-shirt should be absolutely perfect for today.";
    }

    // Default response
    if (weather) {
        return `Hello! Currently in ${weather.name}, it is ${Math.round(temp)}°C with ${desc}. 🌍 It is a great day to explore and enjoy the weather! Let me know if you need specific advice.`;
    }
    return "Hi there! Search for any city first, and I can give you personalized AI advice about carrying umbrellas, clothing, and outdoor plans! 🤖✨";
}

module.exports = router;
