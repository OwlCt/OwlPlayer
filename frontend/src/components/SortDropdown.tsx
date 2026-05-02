import { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiCheck } from 'react-icons/fi';
import { SortOption, useLibraryStore } from '../store/libraryStore';

interface SortDropdownProps {
  className?: string;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'recent-played', label: '最近播放' },
  { value: 'recent-added', label: '最近添加' },
  { value: 'alphabetical', label: '按字母顺序' },
  { value: 'creator', label: '创建者' },
];

export default function SortDropdown({ className = '' }: SortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { sortBy, setSortBy } = useLibraryStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = sortOptions.find(opt => opt.value === sortBy);

  const handleSelect = (value: SortOption) => {
    setSortBy(value);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-spotify-gray text-white hover:bg-spotify-dark transition-colors"
      >
        <span>{currentOption?.label || '排序'}</span>
        <FiChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-spotify-dark rounded-lg shadow-lg py-1 z-50">
          {sortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className="w-full flex items-center justify-between px-4 py-2 text-sm text-white hover:bg-spotify-gray transition-colors"
            >
              <span>{option.label}</span>
              {sortBy === option.value && <FiCheck className="text-spotify-green" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
