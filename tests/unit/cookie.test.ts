import { describe, it, expect } from 'vitest';
import { getStateFromCookie, getSessionIdFromCookie } from '../../src/cookie';

describe('Cookie Utils', () => {
  describe('getStateFromCookie', () => {
    it('should correctly parse a state containing "=" characters', () => {
      const stateWithEquals = 'abc==';
      const request = new Request('http://localhost', {
        headers: {
          'Cookie': `oauth_state=${stateWithEquals}`
        }
      });
      const result = getStateFromCookie(request);
      expect(result).toBe(stateWithEquals);
    });

    it('should correctly parse a simple state', () => {
      const state = 'abc';
      const request = new Request('http://localhost', {
        headers: {
          'Cookie': `oauth_state=${state}`
        }
      });
      const result = getStateFromCookie(request);
      expect(result).toBe(state);
    });

    it('should return null if cookie is missing', () => {
      const request = new Request('http://localhost');
      const result = getStateFromCookie(request);
      expect(result).toBeNull();
    });

    it('should parse correctly when multiple cookies exist', () => {
      const state = 'xyz==';
      const request = new Request('http://localhost', {
        headers: {
          'Cookie': `other_cookie=123; oauth_state=${state}; another=456`
        }
      });
      const result = getStateFromCookie(request);
      expect(result).toBe(state);
    });
  });

  describe('getSessionIdFromCookie', () => {
     it('should correctly parse a session ID containing "=" characters', () => {
      const sessionWithEquals = 'sess==';
      const request = new Request('http://localhost', {
        headers: {
          'Cookie': `storage_session=${sessionWithEquals}`
        }
      });
      const result = getSessionIdFromCookie(request);
      expect(result).toBe(sessionWithEquals);
    });
  });
});
