// Mock for Credentials provider
module.exports = jest.fn((options) => ({
  id: 'player-credentials',
  name: 'Player Login',
  type: 'credentials',
  credentials: {},
  authorize: jest.fn(),
  ...options,
}));
