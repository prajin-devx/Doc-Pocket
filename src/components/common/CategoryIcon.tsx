import React from 'react';
import {
  GraduationCap,
  BookOpen,
  Award,
  Briefcase,
  User,
  Inbox,
  Folder,
  FileText,
  Bookmark,
  Sparkles,
  Archive,
  Layers,
  Calendar,
  Clock,
  LucideProps,
} from 'lucide-react';

interface CategoryIconProps extends LucideProps {
  icon: string;
  color?: string;
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ icon, color, className = 'w-5 h-5', ...props }) => {
  const iconMap: Record<string, React.FC<LucideProps>> = {
    GraduationCap,
    BookOpen,
    Award,
    Briefcase,
    User,
    Inbox,
    Folder,
    FileText,
    Bookmark,
    Sparkles,
    Archive,
    Layers,
    Calendar,
    Clock,
  };

  const Component = iconMap[icon] || Folder;

  return (
    <Component
      className={className}
      style={color ? { color } : undefined}
      {...props}
    />
  );
};
