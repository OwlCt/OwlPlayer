import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBottomPadding } from '../../hooks/useBottomPadding';
import MobileHeader from '../mobile/MobileHeader';
import ProfileTab from './ProfileTab';
import EmailTab from './EmailTab';
import PasswordTab from './PasswordTab';
import DataTab from './DataTab';

type TabType = 'profile' | 'email' | 'password' | 'data';

const TABS: { id: TabType; label: string }[] = [
  { id: 'profile', label: '个人资料' },
  { id: 'email', label: '修改邮箱' },
  { id: 'password', label: '修改密码' },
  { id: 'data', label: '数据管理' },
];

const TAB_TITLES: Record<TabType, string> = {
  profile: '个人资料',
  email: '修改邮箱',
  password: '修改密码',
  data: '数据管理',
};

interface SettingsPageProps {
  initialTab?: TabType;
}

export default function SettingsPage({ initialTab }: SettingsPageProps) {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'profile');
  const [highlightTab, setHighlightTab] = useState<TabType | null>(null);
  const { paddingClass: bottomPaddingClass } = useBottomPadding();

  // Handle highlightTab parameter from URL
  useEffect(() => {
    const tabToHighlight = searchParams.get('highlightTab') as TabType | null;
    if (tabToHighlight && TABS.some(t => t.id === tabToHighlight)) {
      // Remove the parameter from URL
      setSearchParams({}, { replace: true });
      
      // Highlight the tab
      setHighlightTab(tabToHighlight);
      
      // Remove highlight after animation
      setTimeout(() => {
        setHighlightTab(null);
      }, 2000);
    }
  }, [searchParams, setSearchParams]);

  if (!user) {
    return (
      <div className="p-8 text-white">
        <p>请先登录</p>
      </div>
    );
  }

  // 移动端：显示单个 Tab 内容，带返回按钮
  if (isMobile && initialTab) {
    return (
      <div className={`min-h-screen bg-black ${bottomPaddingClass}`}>
        <MobileHeader
          title={TAB_TITLES[activeTab]}
          opacity={1}
          backgroundColor="rgb(0, 0, 0)"
          showBackButton={true}
          onBack={() => navigate('/settings')}
        />
        <div className="pt-14 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'email' && <EmailTab />}
          {activeTab === 'password' && <PasswordTab />}
          {activeTab === 'data' && <DataTab />}
        </div>
      </div>
    );
  }

  // 桌面端：显示完整的 Tab 导航
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">设置与隐私</h1>

      {/* Tab Navigation */}
      <div className="flex gap-4 mb-8 border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 px-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-green-500'
                : 'text-white/60 hover:text-white'
            } ${
              highlightTab === tab.id ? 'animate-highlight-pulse rounded-t' : ''
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'email' && <EmailTab />}
      {activeTab === 'password' && <PasswordTab />}
      {activeTab === 'data' && <DataTab />}
    </div>
  );
}
