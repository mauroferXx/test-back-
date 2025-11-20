import { User } from '../models/User.js';

export async function updatePreferencesController(req, res) {
    try {
        const { userId } = req.params;
        const { preferences } = req.body;

        if (!preferences) {
            return res.status(400).json({ error: 'Preferences are required' });
        }

        const updatedUser = await User.updatePreferences(userId, preferences);

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(updatedUser);
    } catch (error) {
        console.error('Error in updatePreferencesController:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export async function getUserController(req, res) {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error in getUserController:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
