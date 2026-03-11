// Create mock functions for rate-limit module
// checkRateLimit defaults to allowing all requests in tests
export const checkRateLimit = jest.fn().mockResolvedValue({ success: true, remaining: 100 });

export const rateLimit = jest.fn();

export const clearRateLimitStore = jest.fn();

export const getClientIdentifier = jest.fn().mockReturnValue('127.0.0.1');

export const getUserAgent = jest.fn();

export const getServerSideIdentifier = jest.fn().mockResolvedValue('127.0.0.1');
