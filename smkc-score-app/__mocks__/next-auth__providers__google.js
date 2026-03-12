// Mock for Google provider
module.exports = jest.fn((options) => ({
  id: 'google',
  name: 'Google',
  type: 'oauth',
  authorization: { params: {} },
  ...options,
}));
