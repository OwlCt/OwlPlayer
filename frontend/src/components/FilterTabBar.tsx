import { SearchFilterTab } from '../types';

interface FilterTabBarProps {
  activeTab: SearchFilterTab;
  onTabChange: (tab: SearchFilterTab) => void;
  hasResults: {
    songs: boolean;
    artists: boolean;
    records: boolean;
  };
}

const tabs: { key: SearchFilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'songs', label: '歌曲' },
  { key: 'artists', label: '艺术家' },
  { key: 'records', label: '唱片' },
];

export default function FilterTabBar({ activeTab, onTabChange, hasResults }: FilterTabBarProps) {
  // Check if a tab should be shown (all tab always shown, others only if they have results)
  const shouldShowTab = (key: SearchFilterTab): boolean => {
    if (key === 'all') return true;
    return hasResults[key as keyof typeof hasResults] ?? false;
  };

  // Handle tab click - toggle back to 'all' if clicking the active tab
  const handleTabClick = (key: SearchFilterTab) => {
    if (key === activeTab && key !== 'all') {
      onTabChange('all');
    } else {
      onTabChange(key);
    }
  };

  return (
    <div className="flex gap-2 mb-6 flex-wrap">
      {tabs.filter(tab => shouldShowTab(tab.key)).map((tab) => (
        <button
          key={tab.key}
          onClick={() => handleTabClick(tab.key)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? 'bg-white text-black'
              : 'bg-spotify-gray text-white hover:bg-spotify-light-gray/20'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Export tabs for testing
export { tabs };
