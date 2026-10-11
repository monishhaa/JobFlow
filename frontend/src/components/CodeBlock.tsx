import React from 'react';

export interface CodeBlockProps {
  code: string | object | unknown;
  className?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, className = '' }) => {
  const content = typeof code === 'string' ? code : JSON.stringify(code, null, 2);

  return (
    <pre
      className={`p-3 bg-page border border-border rounded font-mono text-12 text-ink overflow-x-auto whitespace-pre-wrap ${className}`}
    >
      {content}
    </pre>
  );
};
