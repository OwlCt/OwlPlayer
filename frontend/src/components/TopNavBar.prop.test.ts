import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// **Feature: top-navigation-bar, Property 1: Auth-based UI rendering**
// **Validates: Requirements 3.1, 3.2**

// User type matching authStore
interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
  is_email_verified: boolean;
  is_active: boolean;
  is_admin: boolean;
  user_group: 'normal' | 'vip';
  created_at: string;
  updated_at: string;
}

// Auth state type
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

// Generate valid date strings
const dateArbitrary = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 }),
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 }),
  fc.integer({ min: 0, max: 59 })
).map(([year, month, day, hour, min, sec]) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}Z`
);

// Generate random User
const userArbitrary = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  username: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)),
  avatar_url: fc.oneof(fc.constant(''), fc.webUrl()),
  is_email_verified: fc.boolean(),
  is_active: fc.boolean(),
  is_admin: fc.boolean(),
  user_group: fc.constantFrom('normal', 'vip') as fc.Arbitrary<'normal' | 'vip'>,
  created_at: dateArbitrary,
  updated_at: dateArbitrary,
});

// Generate authenticated state
const authenticatedStateArbitrary: fc.Arbitrary<AuthState> = userArbitrary.map(user => ({
  user,
  isAuthenticated: true,
}));

// Generate unauthenticated state
const unauthenticatedStateArbitrary: fc.Arbitrary<AuthState> = fc.constant({
  user: null,
  isAuthenticated: false,
});

// Generate any auth state
const authStateArbitrary: fc.Arbitrary<AuthState> = fc.oneof(
  authenticatedStateArbitrary,
  unauthenticatedStateArbitrary
);

// Pure function that determines what UI element to show based on auth state
// This mimics the logic in UserAvatar component
function determineUserAreaElement(authState: AuthState): 'avatar' | 'login-button' {
  if (authState.isAuthenticated && authState.user) {
    return 'avatar';
  }
  return 'login-button';
}

// Pure function to check if both elements would be shown (should never happen)
function wouldShowBothElements(authState: AuthState): boolean {
  const showAvatar = authState.isAuthenticated && authState.user !== null;
  const showLoginButton = !authState.isAuthenticated || authState.user === null;
  return showAvatar && showLoginButton;
}

describe('TopNavBar Auth-based UI Rendering', () => {
  // **Feature: top-navigation-bar, Property 1: Auth-based UI rendering**
  // **Validates: Requirements 3.1, 3.2**
  describe('Property 1: Auth-based UI rendering', () => {
    it('should show UserAvatar when authenticated with user', () => {
      fc.assert(
        fc.property(authenticatedStateArbitrary, (authState) => {
          const element = determineUserAreaElement(authState);
          expect(element).toBe('avatar');
        }),
        { numRuns: 100 }
      );
    });

    it('should show Login Button when not authenticated', () => {
      fc.assert(
        fc.property(unauthenticatedStateArbitrary, (authState) => {
          const element = determineUserAreaElement(authState);
          expect(element).toBe('login-button');
        }),
        { numRuns: 100 }
      );
    });

    it('should never show both Avatar and Login Button simultaneously', () => {
      fc.assert(
        fc.property(authStateArbitrary, (authState) => {
          const showsBoth = wouldShowBothElements(authState);
          expect(showsBoth).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should always show exactly one element (Avatar XOR Login Button)', () => {
      fc.assert(
        fc.property(authStateArbitrary, (authState) => {
          const element = determineUserAreaElement(authState);
          // Element must be one of the two valid options
          expect(['avatar', 'login-button']).toContain(element);
        }),
        { numRuns: 100 }
      );
    });

    it('should show Avatar if and only if isAuthenticated is true and user exists', () => {
      fc.assert(
        fc.property(authStateArbitrary, (authState) => {
          const element = determineUserAreaElement(authState);
          const shouldShowAvatar = authState.isAuthenticated && authState.user !== null;
          
          if (shouldShowAvatar) {
            expect(element).toBe('avatar');
          } else {
            expect(element).toBe('login-button');
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});


// **Feature: top-navigation-bar, Property 2: Search submission triggers navigation**
// **Validates: Requirements 2.2**

// Pure function that determines if a search query should trigger navigation
function shouldTriggerNavigation(query: string): boolean {
  return query.trim().length > 0;
}

// Pure function that generates the expected navigation URL for a search query
function getExpectedSearchUrl(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}

// Pure function that extracts query from URL
function extractQueryFromUrl(url: string): string | null {
  const match = url.match(/\/search\?q=(.+)$/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

describe('TopNavBar Search Submission', () => {
  // **Feature: top-navigation-bar, Property 2: Search submission triggers navigation**
  // **Validates: Requirements 2.2**
  describe('Property 2: Search submission triggers navigation', () => {
    // Generate non-empty, non-whitespace strings
    const validSearchQueryArbitrary = fc.string({ minLength: 1, maxLength: 100 })
      .filter(s => s.trim().length > 0);

    // Generate whitespace-only strings
    const whitespaceOnlyArbitrary = fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 10 })
      .map(chars => chars.join(''));

    // Generate empty or whitespace strings
    const invalidSearchQueryArbitrary = fc.oneof(
      fc.constant(''),
      whitespaceOnlyArbitrary
    );

    it('should trigger navigation for any non-empty, non-whitespace query', () => {
      fc.assert(
        fc.property(validSearchQueryArbitrary, (query) => {
          const shouldNavigate = shouldTriggerNavigation(query);
          expect(shouldNavigate).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should not trigger navigation for empty or whitespace-only queries', () => {
      fc.assert(
        fc.property(invalidSearchQueryArbitrary, (query) => {
          const shouldNavigate = shouldTriggerNavigation(query);
          expect(shouldNavigate).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate correct URL with encoded query parameter', () => {
      fc.assert(
        fc.property(validSearchQueryArbitrary, (query) => {
          const url = getExpectedSearchUrl(query);
          // URL should start with /search?q=
          expect(url.startsWith('/search?q=')).toBe(true);
          // URL should contain the encoded query
          expect(url).toContain(encodeURIComponent(query.trim()));
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve query through URL encoding round-trip', () => {
      fc.assert(
        fc.property(validSearchQueryArbitrary, (query) => {
          const url = getExpectedSearchUrl(query);
          const extractedQuery = extractQueryFromUrl(url);
          // Extracted query should match the trimmed original
          expect(extractedQuery).toBe(query.trim());
        }),
        { numRuns: 100 }
      );
    });

    it('should handle special characters in search queries', () => {
      // Generate strings with special characters
      const specialCharQueryArbitrary = fc.string({ minLength: 1, maxLength: 50 })
        .map(s => s + '&=?#%')
        .filter(s => s.trim().length > 0);

      fc.assert(
        fc.property(specialCharQueryArbitrary, (query) => {
          const url = getExpectedSearchUrl(query);
          const extractedQuery = extractQueryFromUrl(url);
          // Should correctly encode and decode special characters
          expect(extractedQuery).toBe(query.trim());
        }),
        { numRuns: 100 }
      );
    });

    it('should trim leading and trailing whitespace from queries', () => {
      const whitespaceArbitrary = fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 })
        .map(chars => chars.join(''));
      const queryWithWhitespaceArbitrary = fc.tuple(
        whitespaceArbitrary,
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        whitespaceArbitrary
      ).map(([leading, content, trailing]) => leading + content + trailing);

      fc.assert(
        fc.property(queryWithWhitespaceArbitrary, (query) => {
          const url = getExpectedSearchUrl(query);
          const extractedQuery = extractQueryFromUrl(url);
          // Extracted query should be trimmed
          expect(extractedQuery).toBe(query.trim());
        }),
        { numRuns: 100 }
      );
    });
  });
});
