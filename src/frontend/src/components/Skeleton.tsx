interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Skeleton({ width, height, className = '', style }: SkeletonProps) {
  const merged: React.CSSProperties = { ...style };
  if (width) merged.width = typeof width === 'number' ? `${width}px` : width;
  if (height) merged.height = typeof height === 'number' ? `${height}px` : height;
  return <div className={`skeleton ${className}`} style={merged} />;
}