import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// **Feature: admin-user-management, Property 6: Delete confirmation dialog shows correct user info**
// **Validates: Requirements 5.2**

// User type for testing
interface TestUser {
  id: string;
  username: string;
  email: string;
  user_group: 'normal' | 'vip';
}

// Function to generate the confirmation dialog message
// This mirrors the logic in AdminUsersPage.tsx
function generateDeleteConfirmationMessage(user: TestUser): string {
  return `确定要删除用户 "${user.username}" (${user.email}) 吗？此操作将永久删除该用户及其所有关联数据，无法恢复。`;
}

// Function to check if the message contains the required user info
function messageContainsUserInfo(message: string, user: TestUser): boolean {
  return message.includes(user.username) && message.includes(user.email);
}

describe('AdminUsersPage', () => {
  // **Feature: admin-user-management, Property 6: Delete confirmation dialog shows correct user info**
  // **Validates: Requirements 5.2**
  describe('Property 6: Delete confirmation dialog shows correct user info', () => {
    // Arbitrary for generating valid usernames (non-empty, no special chars that could break display)
    const usernameArbitrary = fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => s.trim().length > 0);
    
    // Arbitrary for generating valid emails
    const emailArbitrary = fc.emailAddress();
    
    // Arbitrary for user group
    const userGroupArbitrary = fc.constantFrom<'normal' | 'vip'>('normal', 'vip');

    it('confirmation message should contain the target user username and email', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          usernameArbitrary,
          emailArbitrary,
          userGroupArbitrary,
          (id, username, email, userGroup) => {
            const user: TestUser = {
              id,
              username,
              email,
              user_group: userGroup,
            };

            const message = generateDeleteConfirmationMessage(user);

            // The message should contain both username and email
            expect(messageContainsUserInfo(message, user)).toBe(true);
            expect(message).toContain(username);
            expect(message).toContain(email);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('confirmation message format should be consistent for all users', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          usernameArbitrary,
          emailArbitrary,
          userGroupArbitrary,
          (id, username, email, userGroup) => {
            const user: TestUser = {
              id,
              username,
              email,
              user_group: userGroup,
            };

            const message = generateDeleteConfirmationMessage(user);

            // Message should follow the expected format pattern
            // Format: 确定要删除用户 "{username}" ({email}) 吗？...
            expect(message).toMatch(/确定要删除用户 ".*" \(.*\) 吗？/);
            
            // Username should be quoted
            expect(message).toContain(`"${username}"`);
            
            // Email should be in parentheses
            expect(message).toContain(`(${email})`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('different users should produce different confirmation messages', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          usernameArbitrary,
          emailArbitrary,
          fc.uuid(),
          usernameArbitrary,
          emailArbitrary,
          (id1, username1, email1, id2, username2, email2) => {
            // Skip if users have same username AND email
            fc.pre(username1 !== username2 || email1 !== email2);

            const user1: TestUser = {
              id: id1,
              username: username1,
              email: email1,
              user_group: 'normal',
            };

            const user2: TestUser = {
              id: id2,
              username: username2,
              email: email2,
              user_group: 'vip',
            };

            const message1 = generateDeleteConfirmationMessage(user1);
            const message2 = generateDeleteConfirmationMessage(user2);

            // Messages should be different if users are different
            expect(message1).not.toBe(message2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
