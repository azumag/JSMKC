// Mock for GitHub provider
module.exports = jest.fn((options) => ({
  id: 'github',
  name: 'GitHub',
  type: 'oauth',
  authorization: { params: {} },
  ...options,
}));
