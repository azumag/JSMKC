// Mock for Discord provider
module.exports = jest.fn((options) => ({
  id: 'discord',
  name: 'Discord',
  type: 'oauth',
  authorization: { params: {} },
  ...options,
}));
