import React from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 'w-full max-w-xl',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true" role="dialog">
      <div
        className="fixed inset-0 bg-ink/20 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className={`w-screen ${width} bg-panel border-l border-border flex flex-col`}>
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-14 font-semibold text-ink">{title}</h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-ink text-13 px-2 py-1 border border-border rounded hover:bg-page"
              aria-label="Close drawer"
            >
              Esc
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};
