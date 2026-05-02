import { describe, expect, it } from 'vitest';
import AdminUsersPage from './AdminUsersPage';
import RuntimeSettingsTab from './RuntimeSettingsTab';
import ScanTab from './ScanTab';
import ScrapeTab from './ScrapeTab';
import MobileAdminPage from '../mobile/MobileAdminPage';
import MobileAdminSystemTab from '../mobile/MobileAdminSystemTab';
import MobileAdminScanTab from '../mobile/MobileAdminScanTab';
import MobileAdminScrapeTab from '../mobile/MobileAdminScrapeTab';
import SetupPage from '../SetupPage';

describe('admin components smoke imports', () => {
  it('exports desktop admin components', () => {
    expect(typeof AdminUsersPage).toBe('function');
    expect(typeof RuntimeSettingsTab).toBe('function');
    expect(typeof ScanTab).toBe('function');
    expect(typeof ScrapeTab).toBe('function');
  });

  it('exports mobile admin components', () => {
    expect(typeof MobileAdminPage).toBe('function');
    expect(typeof MobileAdminSystemTab).toBe('function');
    expect(typeof MobileAdminScanTab).toBe('function');
    expect(typeof MobileAdminScrapeTab).toBe('function');
  });

  it('exports setup page component', () => {
    expect(typeof SetupPage).toBe('function');
  });
});
