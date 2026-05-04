import React, { useState } from 'react';

interface ContactAvatarProps {
  url?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const getAvatarColor = (name: string) => {
  const colors = [
    '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', 
    '#16a34a', '#0891b2', '#4f46e5', '#9333ea', '#c026d3'
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export const ContactAvatar: React.FC<ContactAvatarProps> = ({ url, name, size = 'md', className = '' }) => {
  const [error, setError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-[12px]',
    lg: 'w-12 h-12 text-[14px]',
    xl: 'w-28 h-28 text-[32px]'
  };

  const showInitials = !url || error;

  return (
    <div 
      className={`rounded-full flex items-center justify-center text-white border border-slate-200/50 overflow-hidden shrink-0 shadow-sm transition-all ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: showInitials ? getAvatarColor(name) : 'transparent' }}
    >
      {!showInitials ? (
        <img 
          src={url!} 
          alt={name} 
          onError={() => setError(true)}
          loading="lazy"
          className="w-full h-full object-cover animate-in fade-in duration-300"
        />
      ) : (
        <span className="font-bold tracking-tighter">
          {getInitials(name)}
        </span>
      )}
    </div>
  );
};
