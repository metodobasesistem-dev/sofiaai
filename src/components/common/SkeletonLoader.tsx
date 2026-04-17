import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
  width?: string | number;
  height?: string | number;
}

export const Skeleton = ({ 
  className = '', 
  variant = 'rect',
  width,
  height 
}: SkeletonProps) => {
  const baseStyles = "animate-shimmer overflow-hidden relative bg-slate-100";
  
  const variantStyles = {
    rect: "rounded-2xl",
    circle: "rounded-full",
    text: "rounded-lg h-3 w-full"
  };

  return (
    <div 
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={{ 
        width: width || '100%', 
        height: height || (variant === 'text' ? undefined : '100%') 
      }}
    />
  );
};

export const CardSkeleton = () => (
  <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
    <div className="flex items-center gap-4">
      <Skeleton variant="circle" width={48} height={48} />
      <div className="space-y-2 flex-1">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="40%" />
      </div>
    </div>
    <Skeleton variant="rect" height={100} />
  </div>
);

export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-4">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4 p-4 items-center">
        <Skeleton variant="circle" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="30%" />
        </div>
      </div>
    ))}
  </div>
);
