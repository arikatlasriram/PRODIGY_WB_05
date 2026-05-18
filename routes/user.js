const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// @route   POST api/user/favorites
// @desc    Add city to favorites
// @access  Private
router.post('/favorites', auth, async (req, res) => {
    try {
        const { city } = req.body;
        const user = await User.findById(req.user.id);

        if (user.favoriteCities.includes(city)) {
            return res.status(400).json({ message: 'City is already in favorites' });
        }

        user.favoriteCities.push(city);
        await user.save();

        res.json(user.favoriteCities);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/user/favorites/:city
// @desc    Remove city from favorites
// @access  Private
router.delete('/favorites/:city', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const city = req.params.city;

        user.favoriteCities = user.favoriteCities.filter(c => c !== city);
        await user.save();

        res.json(user.favoriteCities);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/user/history
// @desc    Add city to search history
// @access  Private
router.post('/history', auth, async (req, res) => {
    try {
        const { city } = req.body;
        const user = await User.findById(req.user.id);

        // Remove if it already exists to avoid duplicates
        user.searchHistory = user.searchHistory.filter(h => h.city !== city);
        
        // Add to the beginning of the array
        user.searchHistory.unshift({ city });

        // Keep only the last 10 searches
        if (user.searchHistory.length > 10) {
            user.searchHistory.pop();
        }

        await user.save();
        res.json(user.searchHistory);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
